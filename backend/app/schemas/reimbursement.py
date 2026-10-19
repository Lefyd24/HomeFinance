from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReimbursementCreate(BaseModel):
    """Link the transaction in the URL to `counterpart_id` (an expense to an income, or the reverse)."""
    counterpart_id: int
    # Defaults to the most that both sides can still take.
    amount: Optional[float] = Field(None, gt=0)


class ReimbursementLinkResponse(BaseModel):
    """One link, with the transaction on the other side of it from the requester's view."""
    id: int
    amount: float
    transaction_id: int
    description: str
    date: datetime
    account_name: Optional[str] = None


class ReimbursementCandidate(BaseModel):
    """A transaction that could still be linked, with how much of it is free."""
    id: int
    description: str
    date: datetime
    amount: float
    remaining: float
    account_name: Optional[str] = None
