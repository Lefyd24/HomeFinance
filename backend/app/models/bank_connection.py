from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class BankConnection(Base):
    """One user's authorised link to one bank (ASPSP) via Enable Banking.

    A connection is created in `pending` status when the user starts the flow,
    and only becomes `active` once the bank redirects back and the session is
    exchanged. Several `Account` rows hang off a single connection — one bank
    authorisation typically exposes every account the user holds there.
    """

    __tablename__ = "bank_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # ASPSP identity as Enable Banking names it — both parts are needed to
    # start an authorisation (e.g. "Eurobank" + "GR").
    aspsp_name = Column(String(100), nullable=False)
    aspsp_country = Column(String(2), nullable=False)

    # Enable Banking session id, Fernet-encrypted at rest via app/utils/crypto.py
    # (same treatment as NotificationSettings.smtp_password_encrypted). It is a
    # bearer credential for this user's bank data.
    session_id_encrypted = Column(Text, nullable=True)

    # pending | active | expired | revoked | error
    status = Column(String(20), nullable=False, default="pending")

    # Single-use CSRF nonce for the OAuth-style callback. The callback cannot be
    # authenticated — it is a browser redirect from the bank with no
    # Authorization header — so this row is the ONLY thing binding the returned
    # code to a user. Consumed by stamping state_used_at.
    state = Column(String(64), nullable=True, unique=True, index=True)
    state_expires_at = Column(DateTime, nullable=True)
    state_used_at = Column(DateTime, nullable=True)

    # What the bank actually granted, which may be less than we asked for.
    consent_valid_until = Column(DateTime, nullable=True)
    # Set once the expiry warning has been sent, so it is not re-sent hourly.
    expiry_notified_at = Column(DateTime, nullable=True)

    last_sync_at = Column(DateTime, nullable=True)
    last_sync_error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    accounts = relationship("Account", back_populates="bank_connection")

    @property
    def is_usable(self) -> bool:
        """True when this connection can currently be synced."""
        if self.status != "active":
            return False
        if self.consent_valid_until and self.consent_valid_until <= datetime.utcnow():
            return False
        return True
