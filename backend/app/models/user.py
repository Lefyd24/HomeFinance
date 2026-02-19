from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class User(Base):
    """User model for authentication and user data."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    accounts = relationship(
        "Account", back_populates="user", cascade="all, delete-orphan"
    )
    categories = relationship(
        "Category", back_populates="user", cascade="all, delete-orphan"
    )
    transactions = relationship(
        "Transaction", back_populates="user", cascade="all, delete-orphan"
    )
    budgets = relationship(
        "Budget", back_populates="user", cascade="all, delete-orphan"
    )
    import_batches = relationship(
        "ImportBatch", back_populates="user", cascade="all, delete-orphan"
    )
    saved_reports = relationship(
        "SavedReport", back_populates="user", cascade="all, delete-orphan"
    )
    goals = relationship(
        "FinancialGoal", back_populates="user", cascade="all, delete-orphan"
    )
    insights = relationship(
        "UserInsight", back_populates="user", cascade="all, delete-orphan"
    )
    spending_patterns = relationship(
        "SpendingPattern", back_populates="user", cascade="all, delete-orphan"
    )
    debts = relationship(
        "Debt", back_populates="user", cascade="all, delete-orphan"
    )

