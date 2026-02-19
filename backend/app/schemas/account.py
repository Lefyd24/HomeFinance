from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


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
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True