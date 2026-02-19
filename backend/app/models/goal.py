from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    Text,
    Date,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class FinancialGoal(Base):
    """Financial goal tracking model."""

    __tablename__ = "financial_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0)
    currency = Column(String(3), default="EUR")
    category = Column(String(50))
    icon = Column(String(50))
    color = Column(String(7))

    target_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)

    status = Column(String(20), default="active")
    is_primary = Column(Boolean, default=False)

    linked_budget_id = Column(Integer, ForeignKey("budgets.id"))
    linked_account_id = Column(Integer, ForeignKey("accounts.id"))
    auto_track_from_account = Column(Boolean, default=False)

    # Relationships
    user = relationship("User", back_populates="goals")
    goal_transactions = relationship(
        "GoalTransaction", back_populates="goal", cascade="all, delete-orphan"
    )
    linked_budget = relationship("Budget", foreign_keys=[linked_budget_id])
    linked_account = relationship("Account", foreign_keys=[linked_account_id])


class GoalTransaction(Base):
    """Track contributions and withdrawals from goals."""

    __tablename__ = "goal_transactions"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("financial_goals.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)

    description = Column(Text)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    goal = relationship("FinancialGoal", back_populates="goal_transactions")
    user = relationship("User")
    transaction = relationship("Transaction")
