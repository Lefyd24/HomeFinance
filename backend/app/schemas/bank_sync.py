from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class InstitutionResponse(BaseModel):
    """One bank (ASPSP) as Enable Banking names it.

    `name` + `country` together identify a bank when starting an authorisation —
    there is no opaque id to pass around.
    """

    name: str
    country: str
    logo: Optional[str] = None
    psu_types: list[str] = Field(default_factory=list)
    maximum_consent_validity: Optional[int] = None


class ConnectionStartRequest(BaseModel):
    aspsp_name: str = Field(..., min_length=1, max_length=100)
    aspsp_country: str = Field(default="GR", pattern="^[A-Za-z]{2}$")


class ConnectionStartResponse(BaseModel):
    connection_id: int
    # Where to send the user's browser to authenticate with their bank.
    authorization_url: str


class LinkedAccountSummary(BaseModel):
    id: int
    name: str
    currency: str
    balance: float
    last_synced_at: Optional[datetime] = None
    sync_status: Optional[str] = None

    class Config:
        from_attributes = True


class BankConnectionResponse(BaseModel):
    id: int
    aspsp_name: str
    aspsp_country: str
    status: str
    consent_valid_until: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    last_sync_error: Optional[str] = None
    created_at: datetime
    accounts: list[LinkedAccountSummary] = Field(default_factory=list)

    class Config:
        from_attributes = True


class SyncResultResponse(BaseModel):
    connection_id: int
    imported: int
    accounts: list[dict] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)
