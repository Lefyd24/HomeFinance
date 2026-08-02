from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class CategoryRule(Base):
    """User-defined rule that assigns a category to matching transactions."""

    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    match_type = Column(String(10), nullable=False, default="all")  # all | any
    priority = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    stop_on_match = Column(Boolean, nullable=False, default=True)
    times_applied = Column(Integer, nullable=False, default=0)
    last_applied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    category = relationship("Category")
    conditions = relationship(
        "CategoryRuleCondition",
        back_populates="rule",
        cascade="all, delete-orphan",
        order_by="CategoryRuleCondition.id",
    )


class CategoryRuleCondition(Base):
    """One match condition belonging to a CategoryRule."""

    __tablename__ = "category_rule_conditions"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(
        Integer, ForeignKey("category_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field = Column(String(40), nullable=False)
    operator = Column(String(40), nullable=False)
    value = Column(Text, nullable=True)
    value_to = Column(Text, nullable=True)

    rule = relationship("CategoryRule", back_populates="conditions")
