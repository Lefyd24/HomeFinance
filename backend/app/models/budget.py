from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Date
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Budget(Base):
    """Budget model for tracking spending limits."""
    __tablename__ = "budgets"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    period = Column(String(20), nullable=False)  # monthly, yearly, custom
    start_date = Column(Date)
    end_date = Column(Date)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="budgets")
    budget_categories = relationship("BudgetCategory", back_populates="budget", cascade="all, delete-orphan")


class BudgetCategory(Base):
    """Junction table for budget-category relationships."""
    __tablename__ = "budget_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    budget_id = Column(Integer, ForeignKey("budgets.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    allocated_amount = Column(Float)
    
    # Relationships
    budget = relationship("Budget", back_populates="budget_categories")
    category = relationship("Category", back_populates="budget_categories")