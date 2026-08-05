from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Tracker(Base):
    """A free-form bucket of transactions, e.g. "Trip to Italy".

    Deliberately not a budget: no categories and no period, and the target
    amount is optional — a tracker exists to answer "how much did this thing
    cost in the end", which is a question you often ask without a limit in mind.
    Membership is manual only (see TrackerTransaction).
    """

    __tablename__ = "trackers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    # Optional on purpose — a tracker without a target is still useful.
    target_amount = Column(Float, nullable=True)
    currency = Column(String(3), default="EUR")
    icon = Column(String(50))
    color = Column(String(7))
    # Inactive trackers are hidden from the transaction edit modal, so a
    # finished trip stops cluttering every transaction you touch afterwards.
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    tracker_transactions = relationship(
        "TrackerTransaction", back_populates="tracker", cascade="all, delete-orphan"
    )


class TrackerTransaction(Base):
    """Junction row putting one transaction into one tracker.

    A transaction can belong to several trackers at once, so this is a plain
    many-to-many with a uniqueness guard against double-adding.
    """

    __tablename__ = "tracker_transactions"
    __table_args__ = (
        UniqueConstraint(
            "tracker_id", "transaction_id", name="uq_tracker_transactions_pair"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    tracker_id = Column(Integer, ForeignKey("trackers.id"), nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    tracker = relationship("Tracker", back_populates="tracker_transactions")
    transaction = relationship("Transaction")
