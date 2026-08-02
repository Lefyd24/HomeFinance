from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class DebtBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    creditor: Optional[str] = None
    type: str = Field(
        ...,
        pattern="^(credit_card|student_loan|mortgage|car_loan|personal_loan|utilities|subscription|medical|tax|informal|legal|other|custom)$",
    )
    custom_type: Optional[str] = Field(None, max_length=200)
    original_balance: float = Field(..., gt=0)
    current_balance: float = Field(..., ge=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=1)
    minimum_payment: Optional[float] = Field(None, gt=0)
    opened_date: Optional[date] = None
    maturity_date: Optional[date] = None
    notes: Optional[str] = None
    
    # Recurrence settings
    recurrence_interval: Optional[int] = Field(None, ge=1)
    recurrence_unit: Optional[str] = Field(None, pattern="^(days|weeks|months)$")
    recurrence_day_of_month: Optional[int] = Field(None, ge=1, le=31)
    next_payment_date: Optional[date] = None
    
    # Linked account and category
    linked_account_id: Optional[int] = None
    linked_category_id: Optional[int] = None

    notify_enabled: bool = False
    notify_days_before: Optional[int] = None
    priority: int = 0
    is_paid_off: bool = False
    paid_off_date: Optional[date] = None


class DebtCreate(DebtBase):
    pass


class DebtUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    creditor: Optional[str] = None
    type: Optional[str] = Field(
        None,
        pattern="^(credit_card|student_loan|mortgage|car_loan|personal_loan|utilities|subscription|medical|tax|informal|legal|other|custom)$",
    )
    custom_type: Optional[str] = Field(None, max_length=200)
    original_balance: Optional[float] = Field(None, gt=0)
    current_balance: Optional[float] = Field(None, ge=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=1)
    minimum_payment: Optional[float] = Field(None, gt=0)
    opened_date: Optional[date] = None
    maturity_date: Optional[date] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    is_paid_off: Optional[bool] = None
    paid_off_date: Optional[date] = None
    notes: Optional[str] = None
    
    # Recurrence settings
    recurrence_interval: Optional[int] = Field(None, ge=1)
    recurrence_unit: Optional[str] = Field(None, pattern="^(days|weeks|months)$")
    recurrence_day_of_month: Optional[int] = Field(None, ge=1, le=31)
    next_payment_date: Optional[date] = None
    
    # Linked account and category
    linked_account_id: Optional[int] = None
    linked_category_id: Optional[int] = None

    notify_enabled: Optional[bool] = None
    notify_days_before: Optional[int] = None


class DebtResponse(DebtBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    # Computed fields
    months_to_payoff: Optional[int] = None
    total_interest: Optional[float] = None
    payoff_date: Optional[date] = None
    total_amount_due: Optional[float] = None
    
    class Config:
        from_attributes = True


class DebtPaymentBase(BaseModel):
    amount: float = Field(..., gt=0)
    payment_date: date
    principal_amount: Optional[float] = None
    interest_amount: Optional[float] = None
    notes: Optional[str] = None


class DebtPaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    payment_date: date
    principal_amount: Optional[float] = None
    interest_amount: Optional[float] = None
    notes: Optional[str] = None
    account_id: Optional[int] = None  # Account to create transaction from
    transaction_id: Optional[int] = None  # Existing transaction to link
    create_transaction: bool = True  # Whether to create a transaction record


class DebtPaymentUpdate(BaseModel):
    """Update a payment record only — never touches a linked transaction."""

    amount: Optional[float] = Field(None, gt=0)
    payment_date: Optional[date] = None
    principal_amount: Optional[float] = None
    interest_amount: Optional[float] = None
    notes: Optional[str] = None


class DebtPaymentResponse(DebtPaymentBase):
    id: int
    debt_id: int
    user_id: int
    account_id: Optional[int] = None
    transaction_id: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class UpcomingPayment(BaseModel):
    """Upcoming debt payment for dashboard."""
    debt_id: int
    debt_name: str
    creditor: Optional[str]
    amount: float
    due_date: date
    days_until_due: int
    is_overdue: bool
    debt_type: str


class PayoffScheduleItem(BaseModel):
    month: int
    debt_id: int
    debt_name: str
    payment: float
    remaining_balance: float


class PayoffStrategy(BaseModel):
    """Debt payoff strategy comparison."""
    strategy: str  # 'snowball' or 'avalanche'
    total_months: int
    total_interest_paid: float
    total_payments: float
    payoff_schedule: List[PayoffScheduleItem]


class PayoffComparison(BaseModel):
    """Comparison between snowball and avalanche strategies."""
    snowball: PayoffStrategy
    avalanche: PayoffStrategy
    recommended_strategy: str
    savings_difference: float
    months_difference: int


class DebtSummary(BaseModel):
    total_debts: int
    active_debts: int
    paid_off_debts: int
    total_original_balance: float
    total_current_balance: float
    total_paid_off: float
    total_minimum_payments: float
    average_interest_rate: float
    overall_progress_percentage: float
    total_projected_interest: float
    total_amount_due: float


class ExtraPaymentScenario(BaseModel):
    extra_payment: float
    new_payoff_months: int
    interest_saved: float
    months_saved: int
