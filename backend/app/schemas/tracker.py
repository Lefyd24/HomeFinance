from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class TrackerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    # Optional throughout: a tracker is about totals, not limits.
    target_amount: Optional[float] = Field(None, gt=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    icon: Optional[str] = None
    color: Optional[str] = None


class TrackerCreate(TrackerBase):
    is_active: bool = True


class TrackerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    target_amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


class TrackerResponse(TrackerBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Computed from the linked transactions.
    transaction_count: int = 0
    total_amount: float = 0.0
    last_transaction_date: Optional[date] = None
    first_transaction_date: Optional[date] = None
    progress_percentage: Optional[float] = None
    remaining_amount: Optional[float] = None

    class Config:
        from_attributes = True


class TrackerTransactionEntry(BaseModel):
    """One transaction as it appears inside a tracker."""

    id: int
    transaction_id: int
    amount: float
    type: str
    description: str
    date: date
    notes: Optional[str] = None
    account_name: Optional[str] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    added_at: Optional[datetime] = None


class TrackerTransactionList(BaseModel):
    items: List[TrackerTransactionEntry]
    total_amount: float
    count: int


class TrackerTransactionLink(BaseModel):
    """Add a transaction that already exists to this tracker."""

    transaction_id: int


class TrackerTransactionCreate(BaseModel):
    """Create a brand-new transaction and file it under this tracker.

    Mirrors the debt-payment flow: the tracker page can record real spending
    without sending the user off to the transactions page first.
    """

    account_id: int
    amount: float = Field(..., gt=0)
    type: str = Field(default="expense", pattern="^(income|expense)$")
    description: str = Field(..., min_length=1, max_length=500)
    date: date
    category_id: Optional[int] = None
    notes: Optional[str] = None


class TrackerAssignment(BaseModel):
    """The full set of trackers a transaction belongs to."""

    tracker_ids: List[int] = Field(default_factory=list)
