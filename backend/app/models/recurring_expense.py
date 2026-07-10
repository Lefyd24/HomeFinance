from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class RecurringExpense(Base):
    """Recurring expense model – bills, subscriptions, and periodic costs."""

    __tablename__ = "recurring_expenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    amount = Column(Float, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    recurrence_interval = Column(Integer, nullable=False, default=1)
    recurrence_unit = Column(String(20), nullable=False)  # 'days', 'weeks', 'months'
    start_date = Column(Date, nullable=False)
    next_due_date = Column(Date, nullable=False)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    notify_enabled = Column(Boolean, default=False)
    notify_days_before = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    category = relationship("Category")
    account = relationship("Account")
    payments = relationship(
        "RecurringExpensePayment",
        back_populates="recurring_expense",
        cascade="all, delete-orphan",
    )


class RecurringExpensePayment(Base):
    """Individual payment record for a recurring expense."""

    __tablename__ = "recurring_expense_payments"

    id = Column(Integer, primary_key=True, index=True)
    recurring_expense_id = Column(Integer, ForeignKey("recurring_expenses.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    payment_date = Column(Date, nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    recurring_expense = relationship("RecurringExpense", back_populates="payments")
    user = relationship("User")
    transaction = relationship("Transaction")
