from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Transaction(Base):
    """Transaction model for income, expenses, and transfers."""
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)  # Source account
    destination_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)  # Destination account for transfers
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)  # income, expense, transfer
    description = Column(Text, nullable=False)
    date = Column(Date, nullable=False)
    notes = Column(Text)
    is_imported = Column(Boolean, default=False)
    import_batch_id = Column(String(100))
    source_file = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions", foreign_keys="Transaction.account_id")
    destination_account = relationship("Account", foreign_keys="Transaction.destination_account_id")
    category = relationship("Category", back_populates="transactions")