from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class GoalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    target_amount: float = Field(..., gt=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    category: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    target_date: Optional[date] = None
    is_primary: bool = False
    linked_budget_id: Optional[int] = None
    linked_account_id: Optional[int] = None
    auto_track_from_account: bool = False


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    target_amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = None
    category: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None
    is_primary: Optional[bool] = None
    linked_budget_id: Optional[int] = None
    linked_account_id: Optional[int] = None


class GoalTransactionBase(BaseModel):
    amount: float = Field(..., gt=0)
    type: str = Field(..., pattern="^(contribution|withdrawal)$")
    description: Optional[str] = None
    date: date
    transaction_id: Optional[int] = None


class GoalTransactionCreate(GoalTransactionBase):
    pass


class GoalTransactionResponse(GoalTransactionBase):
    id: int
    goal_id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class GoalResponse(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str]
    target_amount: float
    current_amount: float
    currency: str
    category: Optional[str]
    icon: Optional[str]
    color: Optional[str]
    target_date: Optional[date]
    created_at: datetime
    completed_at: Optional[datetime]
    status: str
    is_primary: bool
    linked_budget_id: Optional[int]
    linked_account_id: Optional[int]

    # Computed fields
    progress_percentage: float = 0.0
    remaining_amount: float = 0.0
    days_remaining: Optional[int] = None
    monthly_contribution_needed: Optional[float] = None
    estimated_completion_date: Optional[date] = None

    class Config:
        from_attributes = True


class GoalProgress(BaseModel):
    goal_id: int
    goal_name: str
    current_amount: float
    target_amount: float
    progress_percentage: float
    remaining_amount: float
    days_remaining: Optional[int]
    monthly_contribution_needed: Optional[float]
    estimated_completion_date: Optional[date]
    on_track: bool
    average_monthly_contribution: float


class GoalSummary(BaseModel):
    total_goals: int
    active_goals: int
    completed_goals: int
    total_target_amount: float
    total_current_amount: float
    overall_progress_percentage: float
