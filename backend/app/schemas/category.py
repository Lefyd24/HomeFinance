from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., pattern="^(income|expense|transfer)$")
    color: Optional[str] = Field(default="#3B82F6", pattern="^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = None
    parent_id: Optional[int] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = None
    parent_id: Optional[int] = None


class CategoryResponse(CategoryBase):
    id: int
    user_id: Optional[int]
    is_system: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class CategorySuggestion(BaseModel):
    category_id: int
    category_name: str
    confidence: float