"""Helpers for hashed, single-use tokens: invite codes and user tokens
(password reset / email verification).

Plaintext values are only ever held transiently (invite code shown once to
the admin at creation; reset/verify tokens embedded in an emailed link) —
only their sha256 hex digest is persisted, matching InviteCode.code_hash and
UserToken.token_hash.
"""

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.user_token import UserToken

PASSWORD_RESET_EXPIRE_MINUTES = 30
EMAIL_VERIFY_EXPIRE_MINUTES = 60 * 24  # 24h — more forgiving than a reset link


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_invite_code() -> str:
    # url-safe, no ambiguous separators; friendly enough to paste in a chat
    return secrets.token_urlsafe(18)


def generate_user_token() -> str:
    return secrets.token_urlsafe(32)


def create_user_token(
    db: Session, user_id: int, purpose: str, expires_minutes: int
) -> str:
    """Invalidate any outstanding, unused tokens of this purpose for the user,
    then create and return a fresh plaintext token (only the hash is stored)."""
    now = datetime.utcnow()
    db.query(UserToken).filter(
        UserToken.user_id == user_id,
        UserToken.purpose == purpose,
        UserToken.used_at.is_(None),
    ).update({"used_at": now})

    plaintext = generate_user_token()
    row = UserToken(
        user_id=user_id,
        token_hash=hash_token(plaintext),
        purpose=purpose,
        expires_at=now + timedelta(minutes=expires_minutes),
    )
    db.add(row)
    db.commit()
    return plaintext


def consume_user_token(db: Session, plaintext: str, purpose: str) -> UserToken | None:
    """Look up a token by hash+purpose, validate it's unused and unexpired,
    and mark it used. Returns None (without mutating anything) if invalid."""
    token_hash = hash_token(plaintext)
    row = (
        db.query(UserToken)
        .filter(UserToken.token_hash == token_hash, UserToken.purpose == purpose)
        .first()
    )
    if row is None:
        return None
    if row.used_at is not None:
        return None
    if row.expires_at < datetime.utcnow():
        return None

    row.used_at = datetime.utcnow()
    db.commit()
    return row
