from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Category(Base):
    """Category model for transaction categorization."""
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL for system defaults
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)  # income, expense, transfer
    color = Column(String(7), default="#3B82F6")  # Hex color
    icon = Column(String(50))
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="categories")
    transactions = relationship("Transaction", back_populates="category")
    parent = relationship("Category", remote_side=[id], backref="children")
    budget_categories = relationship("BudgetCategory", back_populates="category", cascade="all, delete-orphan")