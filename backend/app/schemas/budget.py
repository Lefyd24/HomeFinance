from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class BudgetCategoryAllocation(BaseModel):
    category_id: int
    allocated_amount: Optional[float] = None


class BudgetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    amount: float = Field(..., gt=0)
    period: str = Field(..., pattern="^(monthly|yearly|custom)$")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    category_ids: Optional[List[int]] = []


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[float] = Field(None, gt=0)
    period: Optional[str] = Field(None, pattern="^(monthly|yearly|custom)$")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    category_ids: Optional[List[int]] = None
    is_active: Optional[bool] = None


class BudgetProgress(BaseModel):
    spent: float
    remaining: float
    percentage: float


class BudgetResponse(BudgetBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    spent: float = 0
    remaining: float = 0
    percentage: float = 0
    
    class Config:
        from_attributes = True