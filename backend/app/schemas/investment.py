from pydantic import BaseModel, Field, field_serializer
from datetime import datetime, date
from typing import Optional

from app.utils.datetime_utils import ensure_utc


class InvestmentAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    provider: str = Field(..., pattern="^(freedom24|binance)$")
    currency: str = Field(default="USD", pattern="^[A-Z]{3}$")
    public_key: str = Field(..., min_length=1)
    private_key: str = Field(..., min_length=1)
    description: Optional[str] = None
    icon: Optional[str] = None


class InvestmentCredentialUpdate(BaseModel):
    public_key: str = Field(..., min_length=1)
    private_key: str = Field(..., min_length=1)


class InvestmentAccountResponse(BaseModel):
    id: int
    user_id: int
    name: str
    provider: str
    currency: str
    balance: float
    icon: Optional[str] = None
    is_active: bool
    last_synced_at: Optional[datetime] = None
    sync_status: str
    sync_error: Optional[str] = None
    # Unrealized return across all open positions: sum(market_value) vs
    # sum(cost_basis), computed at request time from PortfolioPosition rows —
    # not stored, since positions are already replaced wholesale on each sync.
    # All figures are in `currency` (the account's own), converted from each
    # instrument's currency during the sync.
    total_cost_basis: float = 0
    total_market_value: float = 0
    total_return_pct: Optional[float] = None
    total_unrealized_pnl: float = 0
    # Cash vs. invested split, from the most recent snapshot.
    cash_balance: float = 0
    positions_value: float = 0
    # Weighted intraday move of the open positions.
    day_change: Optional[float] = None
    day_change_pct: Optional[float] = None
    position_count: int = 0
    created_at: datetime
    updated_at: datetime

    @field_serializer("last_synced_at")
    def _serialize_last_synced_at(self, value: Optional[datetime]) -> Optional[datetime]:
        return ensure_utc(value)

    class Config:
        from_attributes = True


class PortfolioPositionResponse(BaseModel):
    id: int
    account_id: int
    symbol: str
    name: Optional[str] = None
    quantity: float
    avg_price: Optional[float] = None
    current_price: Optional[float] = None
    market_value: float
    currency: str
    synced_at: datetime
    cost_basis: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    unrealized_return_pct: Optional[float] = None
    # Same position restated in the account's currency, for the share-of-
    # portfolio and total rows. Equal to the native values for single-currency
    # accounts.
    market_value_base: Optional[float] = None
    cost_basis_base: Optional[float] = None
    unrealized_pnl_base: Optional[float] = None
    fx_rate: float = 1.0
    day_change: Optional[float] = None
    day_change_pct: Optional[float] = None
    exchange: Optional[str] = None
    weight_pct: Optional[float] = None

    class Config:
        from_attributes = True


class InvestmentTransactionResponse(BaseModel):
    id: int
    account_id: int
    external_id: str
    type: str
    symbol: Optional[str] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    amount: float
    currency: str
    date: datetime

    class Config:
        from_attributes = True


class PortfolioSnapshotResponse(BaseModel):
    date: date
    total_value: float
    cash_balance: float
    positions_value: float = 0
    currency: str

    class Config:
        from_attributes = True


class SymbolSearchResult(BaseModel):
    symbol: str
    name: Optional[str] = None
    exchange: Optional[str] = None
    instrument_type: Optional[str] = None
    currency: Optional[str] = None
    isin: Optional[str] = None
    last_price: Optional[float] = None
    day_change_pct: Optional[float] = None


class NewsItemResponse(BaseModel):
    story_id: str
    title: str
    summary: Optional[str] = None
    url: Optional[str] = None
    source: Optional[str] = None
    published_at: Optional[datetime] = None
    sentiment: Optional[str] = None
    image_url: Optional[str] = None
    symbols: list[str] = []
    # Only the single-story endpoint fills this in — list responses would need
    # one extra broker call per item.
    body_html: Optional[str] = None


class NewsPageResponse(BaseModel):
    """A page of the broker's feed, plus how many stories match in total."""
    items: list[NewsItemResponse]
    total: int
    limit: int
    offset: int


class PriceBar(BaseModel):
    """One daily OHLCV bar, for the company research page's mini price chart."""
    date: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[float] = None


class CompanyProfileResponse(BaseModel):
    """Company / instrument research snapshot from a market-data provider."""
    symbol: str
    name: Optional[str] = None
    short_name: Optional[str] = None
    exchange: Optional[str] = None
    quote_type: Optional[str] = None
    currency: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    summary: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    employees: Optional[int] = None
    market_cap: Optional[float] = None
    trailing_pe: Optional[float] = None
    forward_pe: Optional[float] = None
    dividend_yield: Optional[float] = None
    beta: Optional[float] = None
    fifty_two_week_high: Optional[float] = None
    fifty_two_week_low: Optional[float] = None
    previous_close: Optional[float] = None
    open: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    volume: Optional[float] = None
    average_volume: Optional[float] = None
    current_price: Optional[float] = None
    day_change_pct: Optional[float] = None
    target_mean_price: Optional[float] = None
    recommendation: Optional[str] = None

    # Valuation (stocks)
    price_to_book: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    ev_to_sales: Optional[float] = None
    fcf_yield: Optional[float] = None
    roe: Optional[float] = None
    debt_to_equity: Optional[float] = None
    gross_margin: Optional[float] = None
    revenue_growth: Optional[float] = None
    payout_ratio: Optional[float] = None
    book_value: Optional[float] = None
    earnings_growth: Optional[float] = None

    # Fund-specific (ETF / mutual fund)
    expense_ratio: Optional[float] = None
    aum: Optional[float] = None
    category: Optional[str] = None
    yield_: Optional[float] = Field(None, alias="yield", serialization_alias="yield")

    # Crypto-specific
    circulating_supply: Optional[float] = None
    volume_24h: Optional[float] = None

    # Price history + computed performance/risk (1y)
    price_history: Optional[list[PriceBar]] = None
    one_year_return: Optional[float] = None
    one_year_volatility: Optional[float] = None
    max_drawdown_1y: Optional[float] = None
    sharpe_1y: Optional[float] = None

    model_config = {"populate_by_name": True}


class InvestmentSyncResult(BaseModel):
    account_id: int
    sync_status: str
    sync_error: Optional[str] = None
    balance: float
    last_synced_at: Optional[datetime] = None

    @field_serializer("last_synced_at")
    def _serialize_last_synced_at(self, value: Optional[datetime]) -> Optional[datetime]:
        return ensure_utc(value)


class SavedWatchCreate(BaseModel):
    symbol: str
    name: Optional[str] = None
    notes: Optional[str] = None


class SavedWatchResponse(BaseModel):
    id: int
    symbol: str
    name: Optional[str] = None
    last_price: Optional[float] = None
    day_change_pct: Optional[float] = None
    last_updated: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    @field_serializer("last_updated", "created_at")
    def _serialize_dt(self, value: Optional[datetime]) -> Optional[datetime]:
        return ensure_utc(value)
