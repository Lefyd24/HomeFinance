from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Date, Enum
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class UserInsight(Base):
    """Store generated insights for users."""
    __tablename__ = "user_insights"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Insight details
    type = Column(String(50), nullable=False)  # spending_increase, budget_alert, savings_opportunity, anomaly, trend, prediction
    category = Column(String(100), nullable=True)  # Related category name
    severity = Column(String(20), nullable=False)  # info, success, warning, alert
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    
    # Metrics
    metric_value = Column(Float, nullable=True)  # Current value
    comparison_value = Column(Float, nullable=True)  # Previous/comparison value
    percentage_change = Column(Float, nullable=True)  # Percentage change
    
    # Metadata
    is_read = Column(Boolean, default=False)
    is_dismissed = Column(Boolean, default=False)
    valid_until = Column(Date, nullable=True)  # When this insight expires
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="insights")


class SpendingPattern(Base):
    """Store detected spending patterns for users."""
    __tablename__ = "spending_patterns"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Pattern details
    pattern_type = Column(String(50), nullable=False)  # recurring, seasonal, weekend, weekday, monthly, weekly
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    description = Column(String(255), nullable=False)
    
    # Pattern metrics
    confidence_score = Column(Float, nullable=False)  # 0.0 to 1.0
    frequency = Column(String(20), nullable=True)  # daily, weekly, monthly, yearly
    average_amount = Column(Float, nullable=True)
    
    # Time range
    first_detected = Column(Date, nullable=False)
    last_occurrence = Column(Date, nullable=True)
    
    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="spending_patterns")
    category = relationship("Category")
