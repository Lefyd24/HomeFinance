from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base

API_KEY_SCOPES = ("read", "full")


class ApiKey(Base):
    """A named personal API key. Only the sha256 hex digest is stored
    (`key_hash`); the plaintext is shown once at creation."""

    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(100), nullable=False)
    key_hash = Column(String(64), unique=True, index=True, nullable=False)
    key_prefix = Column(String(12), nullable=False)
    last_four = Column(String(4), nullable=False)
    scope = Column(String(10), nullable=False, default="read")  # 'read' | 'full'
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
