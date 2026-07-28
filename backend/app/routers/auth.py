import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.models.invite_code import InviteCode
from app.schemas import (
    APIKeyResponse,
    APIKeyStatus,
    ForgotPasswordRequest,
    PasswordChange,
    ResendVerificationRequest,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserResponse,
    UserUpdate,
    VerifyEmailRequest,
)
from app.services import auth_tokens, email_templates, mail_service
from app.utils.rate_limit import clear_rate_limit, enforce_rate_limit
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_api_key,
    get_current_user,
    get_current_user_authenticated,
    get_password_hash,
    verify_password,
)
from app.utils.urls import public_base_url

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("app")

GENERIC_INVITE_ERROR = "Invite code is invalid, expired, or already used."


def _send_verification_email(db: Session, user: User, request: Request) -> None:
    plaintext = auth_tokens.create_user_token(
        db, user.id, "email_verify", auth_tokens.EMAIL_VERIFY_EXPIRE_MINUTES
    )
    verify_url = f"{public_base_url(request)}/verify-email?token={plaintext}"
    html, text = email_templates.verify_email(verify_url)
    mail_service.send_transactional_email(
        user.email,
        "Verify your email",
        html,
        text,
        settings,
        action_link=verify_url,
    )


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def register(user_data: UserCreate, request: Request, db: Session = Depends(get_db)):
    """Register a new user. Requires a valid, unused, unexpired invite code."""
    enforce_rate_limit(request, email=user_data.email)

    # Check if email already exists
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    code_hash = auth_tokens.hash_token(user_data.invite_code)
    invite = db.query(InviteCode).filter(InviteCode.code_hash == code_hash).first()
    now = datetime.utcnow()
    if (
        invite is None
        or invite.used_at is not None
        or invite.revoked_at is not None
        or (invite.expires_at is not None and invite.expires_at < now)
    ):
        # Uniform error regardless of which of the above is true — never reveal
        # whether a code exists, is expired, or was already used.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_INVITE_ERROR
        )

    # Create new user
    db_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        email_verified=False,
    )
    db.add(db_user)
    db.flush()  # assign db_user.id without committing yet

    # Atomically claim the invite in the same transaction as the user insert —
    # a conditional UPDATE (not a read-then-write) closes the race where two
    # concurrent registrations both pass the check above for the same code.
    claimed = (
        db.query(InviteCode)
        .filter(
            InviteCode.id == invite.id,
            InviteCode.used_at.is_(None),
            InviteCode.revoked_at.is_(None),
        )
        .update({"used_at": now, "used_by_user_id": db_user.id})
    )
    if not claimed:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_INVITE_ERROR
        )

    db.commit()
    db.refresh(db_user)

    try:
        _send_verification_email(db, db_user, request)
    except Exception:
        logger.exception("Failed to send verification email to %s", db_user.email)

    return db_user


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login user and return JWT tokens."""
    enforce_rate_limit(request, email=form_data.username)

    # Find user by email
    user = db.query(User).filter(User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
        )

    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in. Check your inbox for a verification link.",
        )

    # Credentials checked out — don't let a legitimate sign-in eat into the
    # brute-force budget (see clear_rate_limit).
    clear_rate_limit(request, email=form_data.username)

    # Create tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=Token)
def refresh_token(refresh_token: str, db: Session = Depends(get_db)):
    """Refresh access token using refresh token."""
    payload = decode_token(refresh_token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Create new tokens
    new_access_token = create_access_token(data={"sub": str(user.id)})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user_authenticated)):
    """Logout user (client should discard tokens)."""
    # In a more advanced implementation, you could blacklist tokens
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user_authenticated)):
    """Get current user information."""
    return current_user


@router.put("/me", response_model=UserResponse)
def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Update current user profile."""
    # Check if email is being changed and if it's already taken
    if user_update.email and user_update.email != current_user.email:
        if db.query(User).filter(User.email == user_update.email).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        current_user.email = user_update.email

    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name

    db.commit()
    db.refresh(current_user)

    return current_user


@router.post("/change-password")
def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Change user password."""
    # Verify current password
    if not verify_password(
        password_data.current_password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match",
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    # Invalidate any JWTs issued before now — see get_current_user's iat check.
    current_user.sessions_valid_from = datetime.utcnow()
    db.commit()

    return {"message": "Password changed successfully"}


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    """Always returns the same response, whether or not the email exists —
    prevents account enumeration via this endpoint."""
    enforce_rate_limit(request, email=payload.email)

    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None and user.is_active:
        plaintext = auth_tokens.create_user_token(
            db, user.id, "password_reset", auth_tokens.PASSWORD_RESET_EXPIRE_MINUTES
        )
        reset_url = f"{public_base_url(request)}/reset-password?token={plaintext}"
        html, text = email_templates.password_reset(
            reset_url, auth_tokens.PASSWORD_RESET_EXPIRE_MINUTES
        )
        try:
            mail_service.send_transactional_email(
                user.email,
                "Reset your password",
                html,
                text,
                settings,
                action_link=reset_url,
            )
        except Exception:
            logger.exception("Failed to send password reset email to %s", user.email)

    return {
        "message": "If an account with that email exists, a password reset link has been sent."
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validate a password-reset token, set the new password, invalidate outstanding sessions."""
    token_row = auth_tokens.consume_user_token(db, payload.token, "password_reset")
    if token_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or has expired.",
        )

    user = db.query(User).filter(User.id == token_row.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or has expired.",
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.sessions_valid_from = datetime.utcnow()
    db.commit()

    return {"message": "Password has been reset. Please log in with your new password."}


@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Consume an email-verification token and mark the account verified."""
    token_row = auth_tokens.consume_user_token(db, payload.token, "email_verify")
    if token_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or has expired.",
        )

    user = db.query(User).filter(User.id == token_row.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or has expired.",
        )

    user.email_verified = True
    db.commit()

    return {"message": "Email verified. You can now log in."}


@router.post("/resend-verification")
def resend_verification(
    payload: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)
):
    """Resend the verification email. Same generic response either way, to
    avoid leaking whether an email is registered or already verified."""
    enforce_rate_limit(request, email=payload.email)

    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None and user.is_active and not user.email_verified:
        try:
            _send_verification_email(db, user, request)
        except Exception:
            logger.exception("Failed to resend verification email to %s", user.email)

    return {
        "message": "If an account with that email exists and isn't verified yet, a new verification link has been sent."
    }


@router.post("/api-key", response_model=APIKeyResponse)
def generate_new_api_key(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Generate a new API key for the current user."""
    api_key = generate_api_key()
    current_user.api_key = api_key
    db.commit()
    db.refresh(current_user)

    return {
        "api_key": api_key,
        "message": "API key generated successfully. Store it securely as it will not be shown again.",
    }


@router.get("/api-key", response_model=APIKeyStatus)
def get_api_key_status(current_user: User = Depends(get_current_user)):
    """Check if user has an API key configured."""
    return {
        "has_api_key": current_user.api_key is not None,
        "api_key_last_four": current_user.api_key[-4:]
        if current_user.api_key
        else None,
    }


@router.delete("/api-key")
def revoke_api_key(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Revoke the current user's API key."""
    current_user.api_key = None
    db.commit()

    return {"message": "API key revoked successfully"}
