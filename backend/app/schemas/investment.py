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
    # `day_change` is money (what the holding's value moved by today) in the
    # position's own currency; `day_change_base` restates it in the account's.
    day_change: Optional[float] = None
    day_change_base: Optional[float] = None
    day_change_pct: Optional[float] = None
    exchange: Optional[str] = None
    weight_pct: Optional[float] = None
    # Commission actually charged on the trades that built this position, in
    # the account's currency — brokers routinely bill a fee in the account
    # currency for a trade in another, so there is no single native figure.
    fees_paid_base: Optional[float] = None
    fee_count: int = 0

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


class PositionHistoryPoint(BaseModel):
    """One day of a real holding, all money figures in the account's currency.

    `value`/`invested` are null on days outside ownership (before the first buy,
    after a full sale) so the chart leaves a gap instead of drawing a zero;
    `price` spans the whole window either way.
    """
    date: date
    quantity: float
    price: Optional[float] = None
    value: Optional[float] = None
    # Net cash actually paid in for the units still held on this date — the
    # real-money equivalent of a scenario's invested-capital line.
    invested: Optional[float] = None
    fees: float


class PositionHistoryResponse(BaseModel):
    symbol: str
    name: Optional[str] = None
    currency: str
    # How the series was produced. "reconstructed" = the account's own trades
    # marked to a real daily price series; see position_history_service.
    basis: str = "reconstructed"
    # Which price series that was: "yahoo:<ticker>" once the broker ticker has
    # been mapped and confirmed, "broker" when it fell back to the broker's own
    # candles, "none" when neither could price it.
    price_source: str = "none"
    # The window charted, and the ticker mapping behind it — returned so the
    # page can show its working rather than ask to be believed.
    range: str = "entry"
    start: Optional[date] = None
    end: Optional[date] = None
    mapped_symbol: Optional[str] = None
    mapped_currency: Optional[str] = None
    native_currency: Optional[str] = None
    # (candidate ticker, outcome, currency Yahoo reports) per attempt.
    mapping_checked: list[tuple[str, str, Optional[str]]] = Field(default_factory=list)
    opened_on: Optional[date] = None
    quantity: float = 0
    market_value: float = 0
    cost_basis: float = 0
    fees_paid: float = 0
    realized_pnl: float = 0
    unrealized_pnl: float = 0
    unrealized_return_pct: Optional[float] = None
    buy_dates: list[date] = Field(default_factory=list)
    series: list[PositionHistoryPoint] = Field(default_factory=list)


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
    """One daily OHLCV bar with optional moving-average overlays, for the research chart."""
    date: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[float] = None
    sma50: Optional[float] = None
    sma200: Optional[float] = None


class HorizonStats(BaseModel):
    """Risk/return over one fixed lookback. Independent of the chart's selected range."""
    horizon: str  # "1y" | "3y" | "5y"
    annualized_return: Optional[float] = None
    volatility: Optional[float] = None
    sharpe: Optional[float] = None
    sortino: Optional[float] = None
    max_drawdown: Optional[float] = None
    days_under_water: Optional[int] = None
    beta: Optional[float] = None
    alpha: Optional[float] = None
    up_capture: Optional[float] = None
    down_capture: Optional[float] = None


class RollingPoint(BaseModel):
    date: str
    value: Optional[float] = None


class HistogramBin(BaseModel):
    """One bucket of the daily-return distribution. Bounds are decimal returns."""
    lower: float
    upper: float
    count: int


class CompanyHistoryResponse(BaseModel):
    """Price bars plus range-scoped analytics, served from the cached market-data layer."""
    symbol: str
    period: str
    currency: Optional[str] = None
    benchmark_symbol: str
    bars: list[PriceBar] = Field(default_factory=list)
    horizons: list[HorizonStats] = Field(default_factory=list)
    rolling_volatility: list[RollingPoint] = Field(default_factory=list)
    rolling_beta: list[RollingPoint] = Field(default_factory=list)
    rolling_sharpe: list[RollingPoint] = Field(default_factory=list)
    return_histogram: list[HistogramBin] = Field(default_factory=list)
    return_observations: int = 0


class EarningsSurprise(BaseModel):
    """One quarter of actual-vs-estimate EPS, for the research page's earnings block."""
    quarter: str
    eps_actual: Optional[float] = None
    eps_estimate: Optional[float] = None
    surprise_pct: Optional[float] = None


class EtfHolding(BaseModel):
    """One constituent of an ETF/mutual fund's top holdings, per yfinance's `funds_data`."""
    symbol: str
    name: Optional[str] = None
    weight: Optional[float] = None


class SectorWeight(BaseModel):
    sector: str
    weight: float


class AssetClassMix(BaseModel):
    """Stock/bond/cash split of a fund's portfolio. Fractions, not percentages."""
    stock: Optional[float] = None
    bond: Optional[float] = None
    cash: Optional[float] = None
    preferred: Optional[float] = None
    other: Optional[float] = None


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
    first_trade_date: Optional[str] = None

    # Valuation (stocks)
    price_to_book: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    ev_to_sales: Optional[float] = None
    peg_ratio: Optional[float] = None
    price_to_sales: Optional[float] = None
    fcf_yield: Optional[float] = None
    # Profitability
    roe: Optional[float] = None
    return_on_assets: Optional[float] = None
    gross_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    profit_margin: Optional[float] = None
    revenue_growth: Optional[float] = None
    earnings_growth: Optional[float] = None
    payout_ratio: Optional[float] = None
    # Balance sheet
    debt_to_equity: Optional[float] = None
    debt_to_ebitda: Optional[float] = None
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    total_cash: Optional[float] = None
    total_debt: Optional[float] = None
    book_value: Optional[float] = None
    # Earnings & estimates
    total_revenue: Optional[float] = None
    ebitda: Optional[float] = None
    trailing_eps: Optional[float] = None
    forward_eps: Optional[float] = None
    analyst_count: Optional[int] = None
    earnings_history: list[EarningsSurprise] = Field(default_factory=list)

    # Fund-specific (ETF / mutual fund)
    expense_ratio: Optional[float] = None
    aum: Optional[float] = None
    category: Optional[str] = None
    yield_: Optional[float] = Field(None, alias="yield", serialization_alias="yield")
    fund_family: Optional[str] = None
    top_holdings: list[EtfHolding] = Field(default_factory=list)
    sector_weightings: list[SectorWeight] = Field(default_factory=list)
    asset_classes: Optional[AssetClassMix] = None

    # Crypto-specific
    circulating_supply: Optional[float] = None
    volume_24h: Optional[float] = None

    model_config = {"populate_by_name": True}


class EarnPositionResponse(BaseModel):
    """A yield-bearing balance held outside the regular position list (e.g. Binance Simple Earn)."""
    asset: str
    amount: float
    kind: str  # "flexible" | "locked"
    apr: Optional[float] = None
    accrued_yield: Optional[float] = None
    lock_end_time: Optional[datetime] = None


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
