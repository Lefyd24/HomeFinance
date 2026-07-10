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


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    email_enabled = Column(Boolean, default=True)
    push_enabled = Column(Boolean, default=False)
    default_days_before = Column(Integer, default=3)
    quiet_hours_start = Column(Integer, nullable=True)
    quiet_hours_end = Column(Integer, nullable=True)
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_user = Column(String(255), nullable=True)
    smtp_password_encrypted = Column(Text, nullable=True)
    smtp_from = Column(String(255), nullable=True)
    smtp_use_tls = Column(Boolean, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class NotificationRule(Base):
    __tablename__ = "notification_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String(40), nullable=False)  # balance_below|budget_percent|scheduled_report
    name = Column(String(200), nullable=False)
    target_id = Column(Integer, nullable=True)
    threshold = Column(Float, nullable=True)
    report_type = Column(String(40), nullable=True)
    schedule_kind = Column(String(20), nullable=True)  # every_n_days|weekly|monthly
    schedule_value = Column(Integer, nullable=True)
    channels = Column(String(40), default="email")  # comma list: email,push
    is_active = Column(Boolean, default=True)
    last_fired_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(Text, unique=True, nullable=False)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class NotificationLog(Base):
    __tablename__ = "notification_log"
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key", name="uq_notif_dedupe"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    dedupe_key = Column(String(255), nullable=False)
    type = Column(String(40), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    channels_sent = Column(String(40), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
