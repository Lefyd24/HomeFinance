from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str | None = None
    type: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    scope: Literal["read", "full"] = "read"


class ApiKeyRead(BaseModel):
    id: int
    name: str
    scope: str
    key_prefix: str
    last_four: str
    created_at: datetime
    last_used_at: datetime | None = None

    class Config:
        from_attributes = True


class ApiKeyCreated(BaseModel):
    """Returned exactly once, at creation time - the plaintext is never stored."""

    key: str
    api_key: ApiKeyRead


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    token: str
