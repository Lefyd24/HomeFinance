from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class RecurringExpenseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    recurrence_interval: int = Field(..., ge=1)
    recurrence_unit: str = Field(..., pattern="^(days|weeks|months)$")
    start_date: date
    next_due_date: date
    notes: Optional[str] = None
    is_active: bool = True
    notify_enabled: bool = False
    notify_days_before: Optional[int] = None


class RecurringExpenseCreate(RecurringExpenseBase):
    pass


class RecurringExpenseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, gt=0)
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    recurrence_interval: Optional[int] = Field(None, ge=1)
    recurrence_unit: Optional[str] = Field(None, pattern="^(days|weeks|months)$")
    next_due_date: Optional[date] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    notify_enabled: Optional[bool] = None
    notify_days_before: Optional[int] = None


class RecurringExpenseResponse(RecurringExpenseBase):
    id: int
    user_id: int
    days_until_due: Optional[int] = None
    is_overdue: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RecurringExpensePaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    payment_date: date
    transaction_id: Optional[int] = None
    notes: Optional[str] = None


class RecurringExpensePaymentUpdate(BaseModel):
    """Update a payment record only — never touches a linked transaction."""

    amount: Optional[float] = Field(None, gt=0)
    payment_date: Optional[date] = None
    notes: Optional[str] = None


class RecurringExpensePaymentResponse(BaseModel):
    id: int
    recurring_expense_id: int
    user_id: int
    amount: float
    payment_date: date
    transaction_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UpcomingRecurringExpense(BaseModel):
    recurring_expense_id: int
    name: str
    amount: float
    due_date: date
    days_until_due: int
    is_overdue: bool
    category_id: Optional[int] = None
    account_id: Optional[int] = None
