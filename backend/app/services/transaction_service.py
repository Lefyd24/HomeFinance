import calendar
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Transaction, Account, Category, Debt, DebtPayment
from app.models.recurring_expense import RecurringExpense, RecurringExpensePayment
from app.models.tracker import TrackerTransaction
from app.schemas import TransactionCreate, TransactionUpdate


def _rewind_due_date(current: date, interval: int, unit: str) -> date:
    """Undo one advance of a recurring expense due date."""
    if unit == "days":
        return current - timedelta(days=interval)
    if unit == "weeks":
        return current - timedelta(weeks=interval)
    month = current.month - 1 - interval
    year = current.year + month // 12
    month = month % 12 + 1
    day = min(current.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


class TransactionService:
    """Service for transaction-related operations."""
    
    @staticmethod
    def get_transactions(
        db: Session,
        user_id: int,
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        account_id: Optional[int] = None,
        category_id: Optional[int] = None,
        type: Optional[str] = None,
        search: Optional[str] = None
    ) -> tuple[List[Transaction], int]:
        """Get transactions with filters and total count."""
        query = db.query(Transaction).filter(Transaction.user_id == user_id)
        
        # Apply filters
        if start_date:
            query = query.filter(Transaction.date >= start_date)
        if end_date:
            query = query.filter(Transaction.date <= end_date)
        if account_id:
            query = query.filter(Transaction.account_id == account_id)
        if category_id:
            query = query.filter(Transaction.category_id == category_id)
        if type:
            query = query.filter(Transaction.type == type)
        if search:
            query = query.filter(Transaction.description.ilike(f"%{search}%"))
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        transactions = query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()
        
        return transactions, total

    @staticmethod
    def _period_expr(group_by: str):
        """SQLite period label expression for day / month / year grouping."""
        if group_by == "day":
            return func.date(Transaction.date)
        if group_by == "year":
            return func.strftime("%Y", Transaction.date)
        # month (default grouping granularity)
        return func.strftime("%Y-%m", Transaction.date)

    @staticmethod
    def get_totals(
        db: Session,
        user_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        group_by: Optional[str] = None,
    ) -> dict:
        """Get income, expenses, and net for the given period.

        Expects optional ``date`` objects (callers parse ISO strings first).
        When ``group_by`` is ``"day"``, ``"month"``, or ``"year"``, returns a
        period-keyed ``summary`` plus overall ``totals``.
        """
        query = db.query(Transaction).filter(Transaction.user_id == user_id)
        if start_date:
            query = query.filter(Transaction.date >= start_date)
        if end_date:
            query = query.filter(Transaction.date <= end_date)

        if not group_by:
            income = float(
                query.filter(Transaction.type == "income")
                .with_entities(func.coalesce(func.sum(Transaction.amount), 0))
                .scalar()
                or 0
            )
            expenses = float(
                query.filter(Transaction.type == "expense")
                .with_entities(func.coalesce(func.sum(Transaction.amount), 0))
                .scalar()
                or 0
            )
            return {
                "income": income,
                "expenses": expenses,
                "net": income - expenses,
            }

        if group_by not in ("day", "month", "year"):
            raise ValueError("group_by must be one of: day, month, year")

        period_expr = TransactionService._period_expr(group_by)

        income_rows = (
            query.filter(Transaction.type == "income")
            .with_entities(
                period_expr.label("period"),
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            )
            .group_by("period")
            .order_by("period")
            .all()
        )
        expense_rows = (
            query.filter(Transaction.type == "expense")
            .with_entities(
                period_expr.label("period"),
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            )
            .group_by("period")
            .order_by("period")
            .all()
        )

        income_by_period = {str(r.period): float(r.total) for r in income_rows}
        expense_by_period = {str(r.period): float(r.total) for r in expense_rows}
        periods = sorted(set(income_by_period) | set(expense_by_period))

        summary: dict[str, dict[str, float]] = {}
        total_income = 0.0
        total_expenses = 0.0
        for period in periods:
            income = income_by_period.get(period, 0.0)
            expenses = expense_by_period.get(period, 0.0)
            summary[period] = {
                "income": income,
                "expenses": expenses,
                "net": income - expenses,
            }
            total_income += income
            total_expenses += expenses

        return {
            "group_by": group_by,
            "summary": summary,
            "totals": {
                "income": total_income,
                "expenses": total_expenses,
                "net": total_income - total_expenses,
            },
        }
    
    @staticmethod
    def get_transaction(db: Session, transaction_id: int, user_id: int) -> Optional[Transaction]:
        """Get a single transaction by ID."""
        return db.query(Transaction).filter(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id
        ).first()
    
    @staticmethod
    def create_transaction(
        db: Session,
        transaction_data: TransactionCreate,
        user_id: int
    ) -> Transaction:
        """Create a new transaction and update account balance(s)."""
        # Validate transfer
        if transaction_data.type == "transfer":
            if not transaction_data.destination_account_id:
                raise ValueError("Transfer transactions require a destination account")
            if transaction_data.account_id == transaction_data.destination_account_id:
                raise ValueError("Source and destination accounts cannot be the same")
        
        # Create transaction
        db_transaction = Transaction(
            user_id=user_id,
            **transaction_data.model_dump()
        )
        db.add(db_transaction)
        
        # Update account balance(s) with proper rounding
        account = db.query(Account).filter(Account.id == transaction_data.account_id).first()
        if account:
            if transaction_data.type == "income":
                account.balance = round(account.balance + transaction_data.amount, 2)
            elif transaction_data.type == "expense":
                account.balance = round(account.balance - transaction_data.amount, 2)
            elif transaction_data.type == "transfer":
                # Deduct from source account
                account.balance = round(account.balance - transaction_data.amount, 2)
                # Add to destination account
                destination_account = db.query(Account).filter(
                    Account.id == transaction_data.destination_account_id
                ).first()
                if destination_account:
                    destination_account.balance = round(destination_account.balance + transaction_data.amount, 2)
        
        db.commit()
        db.refresh(db_transaction)
        return db_transaction
    
    @staticmethod
    def update_transaction(
        db: Session,
        transaction: Transaction,
        transaction_data: TransactionUpdate
    ) -> Transaction:
        """Update a transaction and adjust account balance(s)."""
        # Store old values
        old_amount = transaction.amount
        old_type = transaction.type
        old_account_id = transaction.account_id
        old_destination_id = transaction.destination_account_id
        
        # Revert old balance with proper rounding
        old_account = db.query(Account).filter(Account.id == old_account_id).first()
        if old_account:
            if old_type == "income":
                old_account.balance = round(old_account.balance - old_amount, 2)
            elif old_type == "expense":
                old_account.balance = round(old_account.balance + old_amount, 2)
            elif old_type == "transfer":
                # Revert transfer: add back to source, deduct from destination
                old_account.balance = round(old_account.balance + old_amount, 2)
                if old_destination_id:
                    old_destination = db.query(Account).filter(Account.id == old_destination_id).first()
                    if old_destination:
                        old_destination.balance = round(old_destination.balance - old_amount, 2)
        
        # Validate new transfer
        new_type = transaction_data.type or old_type
        new_account_id = transaction_data.account_id or old_account_id
        new_destination_id = transaction_data.destination_account_id or old_destination_id
        
        if new_type == "transfer":
            if not new_destination_id:
                raise ValueError("Transfer transactions require a destination account")
            if new_account_id == new_destination_id:
                raise ValueError("Source and destination accounts cannot be the same")
        
        # Update transaction fields
        update_data = transaction_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(transaction, field, value)
        
        # Apply new balance
        new_account = db.query(Account).filter(Account.id == new_account_id).first()
        new_amount = transaction_data.amount or old_amount
        
        if new_account:
            if new_type == "income":
                new_account.balance = round(new_account.balance + new_amount, 2)
            elif new_type == "expense":
                new_account.balance = round(new_account.balance - new_amount, 2)
            elif new_type == "transfer":
                # Deduct from source
                new_account.balance = round(new_account.balance - new_amount, 2)
                # Add to destination
                new_destination = db.query(Account).filter(Account.id == new_destination_id).first()
                if new_destination:
                    new_destination.balance = round(new_destination.balance + new_amount, 2)
        
        db.commit()
        db.refresh(transaction)
        return transaction
    
    @staticmethod
    def delete_transaction(
        db: Session,
        transaction: Transaction,
        *,
        affect_linked: bool = False,
    ) -> None:
        """Delete a transaction and adjust account balance(s).

        Linked debt / recurring payments are never modified by default — only
        the FK is cleared so the ledger row can go away. Pass
        ``affect_linked=True`` to also reverse payment progress (debt balance
        up / recurring due date rewound, and the payment rows deleted).
        """
        # Adjust account balance with proper rounding
        account = db.query(Account).filter(Account.id == transaction.account_id).first()
        if account:
            if transaction.type == "income":
                account.balance = round(account.balance - transaction.amount, 2)
            elif transaction.type == "expense":
                account.balance = round(account.balance + transaction.amount, 2)
            elif transaction.type == "transfer":
                # Revert transfer: add back to source, deduct from destination
                account.balance = round(account.balance + transaction.amount, 2)
                if transaction.destination_account_id:
                    destination_account = db.query(Account).filter(
                        Account.id == transaction.destination_account_id
                    ).first()
                    if destination_account:
                        destination_account.balance = round(
                            destination_account.balance - transaction.amount, 2
                        )

        debt_payment = (
            db.query(DebtPayment)
            .filter(DebtPayment.transaction_id == transaction.id)
            .first()
        )
        if debt_payment:
            if affect_linked:
                debt = db.query(Debt).filter(Debt.id == debt_payment.debt_id).first()
                if debt:
                    debt.current_balance = round(
                        debt.current_balance + debt_payment.amount, 2
                    )
                    if debt.is_paid_off and debt.current_balance > 0:
                        debt.is_paid_off = False
                        debt.paid_off_date = None
                        debt.is_active = True
                db.delete(debt_payment)
            else:
                debt_payment.transaction_id = None

        recurring_payment = (
            db.query(RecurringExpensePayment)
            .filter(RecurringExpensePayment.transaction_id == transaction.id)
            .first()
        )
        if recurring_payment:
            if affect_linked:
                expense = (
                    db.query(RecurringExpense)
                    .filter(RecurringExpense.id == recurring_payment.recurring_expense_id)
                    .first()
                )
                if expense:
                    expense.next_due_date = _rewind_due_date(
                        expense.next_due_date,
                        expense.recurrence_interval,
                        expense.recurrence_unit,
                    )
                db.delete(recurring_payment)
            else:
                recurring_payment.transaction_id = None

        # Tracker membership is only a tag on the transaction — the tracker
        # itself survives, it just loses this row from its total.
        db.query(TrackerTransaction).filter(
            TrackerTransaction.transaction_id == transaction.id
        ).delete(synchronize_session=False)

        db.delete(transaction)
        db.commit()

    @staticmethod
    def pair_as_transfer(db: Session, tx_a: Transaction, tx_b: Transaction) -> None:
        """Mark two existing transactions as the two legs of one transfer.

        Used when both accounts already carry their own balance-correct row
        for the same real-world transfer (e.g. two linked accounts, each
        synced independently by the bank) — so no balance math runs here,
        only the linking fields are set.
        """
        if round(tx_a.amount, 2) != round(tx_b.amount, 2):
            raise ValueError("Both legs of a transfer must have the same amount")
        if tx_a.account_id == tx_b.account_id:
            raise ValueError("A transfer cannot be paired with itself")

        for leg, other in ((tx_a, tx_b), (tx_b, tx_a)):
            leg.original_type = leg.type
            leg.type = "transfer"
            leg.destination_account_id = other.account_id
            leg.paired_transaction_id = other.id
            leg.transfer_direction = "incoming" if leg.original_type == "income" else "outgoing"

        db.commit()

    @staticmethod
    def retag_as_transfer(
        db: Session, transaction: Transaction, destination_account_id: int
    ) -> None:
        """Retag a single synced row as a transfer to an account with no row of its own yet.

        `transaction.account_id` is bank-owned and never moves. Its balance is
        already correct (set by the bank sync), so only the destination's
        balance is adjusted here — added to if the row was an expense (money
        left the linked account and arrived at the destination), subtracted
        from if it was income (money arrived at the linked account, having
        left the destination).
        """
        destination = db.query(Account).filter(Account.id == destination_account_id).first()
        if not destination:
            raise ValueError("Destination account not found")
        if destination.is_linked:
            raise ValueError(
                "Both accounts are already linked accounts — pair their existing "
                "synced rows instead of retagging one onto a new destination"
            )

        original_type = transaction.type
        transaction.original_type = original_type
        transaction.type = "transfer"
        transaction.destination_account_id = destination_account_id

        if original_type == "expense":
            transaction.transfer_direction = "outgoing"
            destination.balance = round(destination.balance + transaction.amount, 2)
        elif original_type == "income":
            transaction.transfer_direction = "incoming"
            destination.balance = round(destination.balance - transaction.amount, 2)

        db.commit()

    @staticmethod
    def unmark_transfer(db: Session, transaction: Transaction) -> None:
        """Undo pair_as_transfer / retag_as_transfer.

        Restores the row's original type and reverses whatever balance effect
        retagging applied. Paired rows are un-paired independently of each
        other — un-pairing one leg does not touch the other.
        """
        if not transaction.original_type:
            raise ValueError("This transaction was not retagged as a transfer")

        if transaction.paired_transaction_id is None and transaction.destination_account_id:
            destination = (
                db.query(Account)
                .filter(Account.id == transaction.destination_account_id)
                .first()
            )
            if destination:
                if transaction.transfer_direction == "outgoing":
                    destination.balance = round(destination.balance - transaction.amount, 2)
                elif transaction.transfer_direction == "incoming":
                    destination.balance = round(destination.balance + transaction.amount, 2)

        transaction.type = transaction.original_type
        transaction.original_type = None
        transaction.destination_account_id = None
        transaction.paired_transaction_id = None
        transaction.transfer_direction = None

        db.commit()

    @staticmethod
    def get_transaction_summary(
        db: Session,
        user_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> dict:
        """Get transaction summary (income/expenses) for a period."""
        query = db.query(Transaction).filter(Transaction.user_id == user_id)
        
        if start_date:
            query = query.filter(Transaction.date >= start_date)
        if end_date:
            query = query.filter(Transaction.date <= end_date)
        
        income = query.filter(Transaction.type == "income").with_entities(
            func.sum(Transaction.amount)
        ).scalar() or 0
        
        expenses = query.filter(Transaction.type == "expense").with_entities(
            func.sum(Transaction.amount)
        ).scalar() or 0
        
        return {
            "income": float(income),
            "expenses": float(expenses),
            "net": float(income) - float(expenses)
        }