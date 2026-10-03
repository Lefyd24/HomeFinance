import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User

# API Key scheme
api_key_header = APIKeyHeader(name=settings.API_KEY_HEADER, auto_error=False)

# OAuth2 scheme (auto_error=False to allow API key authentication)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using bcrypt directly.

    Bcrypt has a 72 byte limit, so we truncate the password.
    """
    # Truncate to 72 bytes (bcrypt limit) and encode
    password_bytes = plain_password.encode("utf-8")[:72]
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt directly.

    Bcrypt has a 72 byte limit, so we truncate the password.
    """
    # Truncate to 72 bytes (bcrypt limit) and encode
    password_bytes = password.encode("utf-8")[:72]
    # Generate salt and hash
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update(
        {
            "exp": expire,
            "iat": datetime.now(UTC),
            "jti": str(uuid.uuid4()),
            "type": "access",
        }
    )
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(
        minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update(
        {
            "exp": expire,
            "iat": datetime.now(UTC),
            "jti": str(uuid.uuid4()),
            "type": "refresh",
        }
    )
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_token(token: str) -> dict | None:
    """Decode and validate JWT token."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def token_issued_before_session_invalidation(payload: dict, user: User) -> bool:
    """True if this token was issued before the user's last password reset/change.

    `sessions_valid_from` is bumped to "now" on password reset and password
    change, so any JWT with an earlier `iat` must be rejected — otherwise
    resetting a password wouldn't actually invalidate tokens already handed
    out (logout today is client-side only).
    """
    iat = payload.get("iat")
    valid_from = getattr(user, "sessions_valid_from", None)
    if iat is None or valid_from is None:
        return False
    issued_at = datetime.fromtimestamp(iat, tz=UTC)
    if valid_from.tzinfo is None:
        valid_from = valid_from.replace(tzinfo=UTC)
    # JWT iat is whole seconds; without truncating, a token issued in the same
    # second as the reset (e.g. the login right after it) would be rejected.
    return issued_at < valid_from.replace(microsecond=0)


def user_from_access_token(token: str | None, db: Session) -> User | None:
    """Resolve the user for an access JWT, or None if it must be rejected.

    Single place for every check an access token has to pass: signature and
    expiry, ``type == "access"`` (a refresh token is longer-lived and must only
    ever be accepted by /auth/refresh), an active user, and not issued before
    the user's last password reset/change.
    """
    if not token:
        return None
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        return None
    if token_issued_before_session_invalidation(payload, user):
        return None
    return user


# NOTE: these dependencies are deliberately plain `def`. They run blocking
# SQLAlchemy queries, and FastAPI runs sync dependencies in the threadpool. As
# `async def` they would call pool.connect() on the event loop thread; once the
# pool is exhausted that blocks the loop, which then can't run the teardown that
# returns connections - a deadlock until the pool timeout fires.
def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user via JWT token."""
    user = user_from_access_token(token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current active user."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def generate_api_key(length: int = 64) -> str:
    """Generate a secure random API key."""
    return secrets.token_urlsafe(length)


def get_current_user_by_api_key(
    api_key: str | None = Security(api_key_header), db: Session = Depends(get_db)
) -> User | None:
    """Get current user by API key."""
    if not api_key:
        return None

    user = db.query(User).filter(User.api_key == api_key).first()
    if user and user.is_active:
        return user
    return None


def get_current_user_authenticated(
    token: str | None = Depends(oauth2_scheme),
    api_key: str | None = Security(api_key_header),
    db: Session = Depends(get_db),
) -> User:
    """Get current user authenticated via JWT token or API key."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Try API key first
    if api_key:
        user = get_current_user_by_api_key(api_key, db)
        if user:
            return user

    # Fall back to JWT token
    user = user_from_access_token(token, db)
    if user is None:
        raise credentials_exception
    return user


def require_admin(
    current_user: User = Depends(get_current_user_authenticated),
) -> User:
    """Gate a route to admin users only (401/403 handled uniformly via 403)."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
