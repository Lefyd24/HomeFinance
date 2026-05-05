from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Debt(Base):
    """Debt tracking model for loans, credit cards, and other debts."""
    
    __tablename__ = "debts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Debt details
    name = Column(String(200), nullable=False)
    creditor = Column(String(200))
    type = Column(String(50))
    custom_type = Column(String(200))  # used when type == 'custom'
    
    # Financial terms
    original_balance = Column(Float, nullable=False)
    current_balance = Column(Float, nullable=False)
    interest_rate = Column(Float)  # e.g., 0.0525 for 5.25%
    minimum_payment = Column(Float)
    
    # Timeline
    opened_date = Column(Date)
    maturity_date = Column(Date)
    
    # Recurrence settings
    recurrence_interval = Column(Integer)  # e.g., 1, 2, 3
    recurrence_unit = Column(String(20))  # 'days', 'weeks', 'months'
    recurrence_day_of_month = Column(Integer)  # 1-31 for monthly payments
    next_payment_date = Column(Date)  # Next scheduled payment date
    
    # Linked account and category for auto-transaction creation
    linked_account_id = Column(Integer, ForeignKey("accounts.id"))
    linked_category_id = Column(Integer, ForeignKey("categories.id"))
    
    # Tracking
    priority = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    is_paid_off = Column(Boolean, default=False)
    paid_off_date = Column(Date)
    
    # Notes
    notes = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="debts")
    payments = relationship("DebtPayment", back_populates="debt", cascade="all, delete-orphan")
    linked_account = relationship("Account", foreign_keys=[linked_account_id])
    linked_category = relationship("Category", foreign_keys=[linked_category_id])


class DebtPayment(Base):
    """Track payments made toward debts."""
    
    __tablename__ = "debt_payments"
    
    id = Column(Integer, primary_key=True, index=True)
    debt_id = Column(Integer, ForeignKey("debts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Payment details
    amount = Column(Float, nullable=False)
    payment_date = Column(Date, nullable=False)
    principal_amount = Column(Float)
    interest_amount = Column(Float)
    notes = Column(Text)
    
    # Linked transaction (optional - if payment came from an account)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    debt = relationship("Debt", back_populates="payments")
    user = relationship("User")
    account = relationship("Account")
    transaction = relationship("Transaction", back_populates="debt_payment")
