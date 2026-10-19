from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import Transaction, TransactionReimbursement


class ReimbursementError(ValueError):
    """A reimbursement link would break a rule; the message is user-safe."""


def _cents(value: float) -> int:
    # Compared in cents, like the split feature: float sums drift.
    return round(value * 100)


class ReimbursementService:
    """Rules for linking an expense to the incomes that paid it back."""

    @staticmethod
    def remaining(tx: Transaction) -> float:
        """How much of `tx` is still free to link."""
        return (_cents(tx.amount) - _cents(tx.reimbursed_amount)) / 100

    @staticmethod
    def link(
        db: Session,
        user_id: int,
        tx: Transaction,
        counterpart: Transaction,
        amount: Optional[float],
    ) -> TransactionReimbursement:
        """Link an expense and an income, given in either order.

        `amount` defaults to the most both sides can still take.
        """
        if tx.user_id != user_id or counterpart.user_id != user_id:
            raise ReimbursementError("Transaction not found")
        if {tx.type, counterpart.type} != {"expense", "income"}:
            raise ReimbursementError("A reimbursement links one expense to one income.")
        if tx.is_pending or counterpart.is_pending:
            raise ReimbursementError("Pending transactions cannot be linked until they are booked.")

        expense, income = (tx, counterpart) if tx.type == "expense" else (counterpart, tx)
        free_cents = min(
            _cents(ReimbursementService.remaining(expense)),
            _cents(ReimbursementService.remaining(income)),
        )
        amount_cents = free_cents if amount is None else _cents(amount)
        if amount_cents <= 0:
            raise ReimbursementError("There is nothing left to link on one of these transactions.")
        if amount_cents > free_cents:
            raise ReimbursementError(
                f"Only {free_cents / 100:.2f} can still be linked between these transactions."
            )

        link = TransactionReimbursement(
            user_id=user_id,
            expense_id=expense.id,
            income_id=income.id,
            amount=amount_cents / 100,
        )
        db.add(link)
        db.commit()
        # The computed amounts are read from the links, so reload both sides.
        db.refresh(expense)
        db.refresh(income)
        return link

    @staticmethod
    def unlink(db: Session, user_id: int, link_id: int) -> None:
        link = (
            db.query(TransactionReimbursement)
            .filter(
                TransactionReimbursement.id == link_id,
                TransactionReimbursement.user_id == user_id,
            )
            .first()
        )
        if not link:
            raise LookupError("Reimbursement link not found")
        db.delete(link)
        db.commit()

    @staticmethod
    def links_for(db: Session, tx: Transaction) -> List[TransactionReimbursement]:
        return (
            db.query(TransactionReimbursement)
            .filter(
                or_(
                    TransactionReimbursement.expense_id == tx.id,
                    TransactionReimbursement.income_id == tx.id,
                )
            )
            .order_by(TransactionReimbursement.id)
            .all()
        )

    @staticmethod
    def candidates(
        db: Session,
        user_id: int,
        tx: Transaction,
        search: Optional[str] = None,
        limit: int = 20,
    ) -> List[Transaction]:
        """Opposite-type transactions that still have room, nearest in date first."""
        if tx.type not in ("expense", "income"):
            raise ReimbursementError("Only expenses and incomes can be linked.")

        query = db.query(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.type == ("income" if tx.type == "expense" else "expense"),
            Transaction.is_pending.is_(False),
            Transaction.effective_amount > 0.005,
        )
        if search:
            query = query.filter(Transaction.description.ilike(f"%{search}%"))
        distance = func.abs(func.julianday(Transaction.date) - func.julianday(tx.date))
        return query.order_by(distance).limit(limit).all()

    @staticmethod
    def delete_links_for(db: Session, tx_ids: List[int]) -> None:
        """Drop every link touching these transactions.

        Called by each delete path: SQLite does not enforce foreign keys here,
        so nothing cascades and links would be left pointing at nothing.
        Does not commit; the caller's delete does.
        """
        if not tx_ids:
            return
        db.query(TransactionReimbursement).filter(
            or_(
                TransactionReimbursement.expense_id.in_(tx_ids),
                TransactionReimbursement.income_id.in_(tx_ids),
            )
        ).delete(synchronize_session=False)

    @staticmethod
    def assert_unlinked(tx: Transaction) -> None:
        if tx.reimbursed_amount > 0:
            raise ReimbursementError("Remove its reimbursement links first.")

    @staticmethod
    def assert_can_change(
        tx: Transaction,
        *,
        new_type: Optional[str] = None,
        new_amount: Optional[float] = None,
    ) -> None:
        """Refuse an edit that would leave the links inconsistent with `tx`."""
        if tx.reimbursed_amount <= 0:
            return
        if new_type is not None and new_type != tx.type:
            ReimbursementService.assert_unlinked(tx)
        if new_amount is not None and _cents(new_amount) < _cents(tx.reimbursed_amount):
            raise ReimbursementError(
                f"The amount cannot be lower than the {tx.reimbursed_amount:.2f} "
                "already linked to reimbursements."
            )
