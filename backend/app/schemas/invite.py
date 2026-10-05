from datetime import datetime

from pydantic import BaseModel, Field


class InviteCodeCreate(BaseModel):
    label: str | None = Field(None, max_length=255)
    expires_in_days: int | None = Field(
        None, ge=1, le=365, description="Omit for a code that never expires."
    )


class InviteCodeCreated(BaseModel):
    """Returned exactly once, at creation time — the plaintext is never stored."""

    code: str
    label: str | None = None
    expires_at: datetime | None = None


class InviteCodeRead(BaseModel):
    id: int
    label: str | None = None
    created_by_user_id: int
    expires_at: datetime | None = None
    used_at: datetime | None = None
    used_by_user_id: int | None = None
    used_by_email: str | None = None
    revoked_at: datetime | None = None
    created_at: datetime
    status: str  # 'active' | 'used' | 'expired' | 'revoked'

    class Config:
        from_attributes = True


class UserAdminRead(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class UserActiveUpdate(BaseModel):
    is_active: bool
