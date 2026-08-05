from pydantic import BaseModel, Field, field_serializer
from datetime import datetime
from typing import Optional

from app.utils.datetime_utils import ensure_utc


class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., pattern="^(checking|savings|credit|cash|investment)$")
    currency: str = Field(default="EUR", pattern="^[A-Z]{3}$")
    balance: float = Field(default=0)
    description: Optional[str] = None
    icon: Optional[str] = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[str] = Field(None, pattern="^(checking|savings|credit|cash|investment)$")
    currency: Optional[str] = Field(None, pattern="^[A-Z]{3}$")
    balance: Optional[float] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class AccountResponse(AccountBase):
    id: int
    user_id: int
    is_active: bool
    # Bank sync state. A linked account is owned by the bank: its balance is
    # overwritten on every sync and it rejects manual transaction writes, so the
    # UI must render it read-only.
    is_linked: bool = False
    bank_connection_id: Optional[int] = None
    last_synced_at: Optional[datetime] = None
    sync_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("last_synced_at")
    def _serialize_last_synced_at(self, value: Optional[datetime]) -> Optional[datetime]:
        return ensure_utc(value)

    class Config:
        from_attributes = True