from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.models.invite_code import InviteCode
from app.schemas import (
    InviteCodeCreate,
    InviteCodeCreated,
    InviteCodeRead,
    UserActiveUpdate,
    UserAdminRead,
)
from app.services import auth_tokens
from app.utils.security import require_admin

router = APIRouter(prefix="/admin", tags=["Admin"])


def _invite_status(invite: InviteCode) -> str:
    if invite.revoked_at is not None:
        return "revoked"
    if invite.used_at is not None:
        return "used"
    if invite.expires_at is not None and invite.expires_at < datetime.utcnow():
        return "expired"
    return "active"


def _invite_read(invite: InviteCode, used_by_email: str | None = None) -> InviteCodeRead:
    return InviteCodeRead(
        id=invite.id,
        label=invite.label,
        created_by_user_id=invite.created_by_user_id,
        expires_at=invite.expires_at,
        used_at=invite.used_at,
        used_by_user_id=invite.used_by_user_id,
        used_by_email=used_by_email,
        revoked_at=invite.revoked_at,
        created_at=invite.created_at,
        status=_invite_status(invite),
    )


@router.post(
    "/invites", response_model=InviteCodeCreated, status_code=status.HTTP_201_CREATED
)
def create_invite(
    payload: InviteCodeCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a single-use invite code. The plaintext code is returned ONCE —
    only its sha256 hash is stored, so it cannot be retrieved again."""
    plaintext = auth_tokens.generate_invite_code()
    expires_at = (
        datetime.utcnow() + timedelta(days=payload.expires_in_days)
        if payload.expires_in_days
        else None
    )
    invite = InviteCode(
        code_hash=auth_tokens.hash_token(plaintext),
        label=payload.label,
        created_by_user_id=admin.id,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()

    return InviteCodeCreated(code=plaintext, label=invite.label, expires_at=expires_at)


@router.get("/invites", response_model=list[InviteCodeRead])
def list_invites(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    invites = db.query(InviteCode).order_by(InviteCode.created_at.desc()).all()
    used_ids = {i.used_by_user_id for i in invites if i.used_by_user_id}
    emails = (
        dict(db.query(User.id, User.email).filter(User.id.in_(used_ids)).all())
        if used_ids
        else {}
    )
    return [_invite_read(i, emails.get(i.used_by_user_id)) for i in invites]


@router.post("/invites/{invite_id}/revoke", response_model=InviteCodeRead)
def revoke_invite(
    invite_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    invite = db.query(InviteCode).filter(InviteCode.id == invite_id).first()
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found"
        )

    if invite.used_at is None and invite.revoked_at is None:
        invite.revoked_at = datetime.utcnow()
        db.commit()
        db.refresh(invite)

    return _invite_read(invite)


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invite(
    invite_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete an invite code of any status. Users who already registered with
    it are unaffected - nothing references the invite from the user side."""
    invite = db.query(InviteCode).filter(InviteCode.id == invite_id).first()
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found"
        )
    db.delete(invite)
    db.commit()


@router.get("/users", response_model=list[UserAdminRead])
def list_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.created_at.asc()).all()


@router.patch("/users/{user_id}/active", response_model=UserAdminRead)
def set_user_active(
    user_id: int,
    payload: UserActiveUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Activate/deactivate a user. No deletion is exposed here by design."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.id == admin.id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user
