from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Account(Base):
    """Account model for bank accounts, credit cards, cash, etc."""
    __tablename__ = "accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)  # checking, savings, credit, cash, investment
    currency = Column(String(3), default="EUR")
    balance = Column(Float, default=0)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", foreign_keys="Transaction.account_id", cascade="all, delete-orphan")
    outgoing_transfers = relationship("Transaction", foreign_keys="Transaction.destination_account_id", viewonly=True)