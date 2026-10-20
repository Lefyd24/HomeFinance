from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, func, or_, select
from sqlalchemy.orm import column_property, relationship

from app.database import Base
from app.models.transaction import Transaction


class TransactionReimbursement(Base):
    """Part of an income that pays back part of an expense.

    The user paid an expense in full on behalf of others (a group dinner) and
    later received their shares back as ordinary incoming transfers. Linking
    the two says "this much of that income is not earnings, and this much of
    that expense was not really mine", so both drop out of income/expense
    totals, while account balances stay untouched (the cash really moved).
    """
    __tablename__ = "transaction_reimbursements"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    expense_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    income_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    expense = relationship("Transaction", foreign_keys=[expense_id])
    income = relationship("Transaction", foreign_keys=[income_id])


# How much of a transaction is covered by reimbursement links, from whichever
# side it sits on. An expense and an income can never be the same row, so
# matching either column is unambiguous.
Transaction.reimbursed_amount = column_property(
    select(func.coalesce(func.sum(TransactionReimbursement.amount), 0.0))
    .where(
        or_(
            TransactionReimbursement.expense_id == Transaction.id,
            TransactionReimbursement.income_id == Transaction.id,
        )
    )
    .correlate_except(TransactionReimbursement)
    .scalar_subquery()
)

# What the transaction really counts for in income/expense totals. Use this,
# not `amount`, whenever summing earnings or spending; keep `amount` for
# anything that reconstructs account balances.
Transaction.effective_amount = column_property(Transaction.amount - Transaction.reimbursed_amount)
