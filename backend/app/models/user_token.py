from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class UserToken(Base):
    """Single-use, hashed tokens for password reset and email verification.

    Only the sha256 hex digest of the token is stored (`token_hash`) — the
    plaintext token is only ever put in the link sent by email.
    """

    __tablename__ = "user_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    purpose = Column(String(20), nullable=False)  # 'password_reset' | 'email_verify'
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
