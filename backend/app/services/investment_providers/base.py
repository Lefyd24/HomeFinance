from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional


@dataclass
class ProviderBalance:
    """Account totals, all expressed in `currency` (the account's base currency).

    `cash_by_currency` keeps the untouched per-currency cash rows so the UI can
    show what the broker actually holds, while `cash_balance` is the single
    converted figure the account's balance is set from.
    """
    total_value: float
    cash_balance: float
    currency: str
    positions_value: float = 0.0
    cash_by_currency: dict[str, float] = field(default_factory=dict)


@dataclass
class ProviderPosition:
    """One open holding.

    Prices and `market_value`/`cost_basis` are in the position's own `currency`;
    `*_base` values are the same figures converted to the account's base
    currency using `fx_rate`, so account-level sums stay coherent for a
    portfolio holding EUR, USD and GBP instruments at once.
    """
    symbol: str
    name: Optional[str]
    quantity: float
    avg_price: Optional[float]
    current_price: Optional[float]
    market_value: float
    currency: str
    cost_basis: Optional[float] = None
    fx_rate: float = 1.0
    market_value_base: Optional[float] = None
    cost_basis_base: Optional[float] = None
    # Intraday move of the instrument itself, from the broker's quote feed.
    previous_close: Optional[float] = None
    day_change: Optional[float] = None
    day_change_pct: Optional[float] = None
    exchange: Optional[str] = None


@dataclass
class ProviderTransaction:
    external_id: str
    type: str  # buy, sell, fx, dividend, fee, deposit, withdrawal, tax
    symbol: Optional[str]
    quantity: Optional[float]
    price: Optional[float]
    amount: float
    currency: str
    date: datetime
    raw_payload: dict[str, Any]


@dataclass
class ProviderSymbol:
    symbol: str
    name: Optional[str]
    exchange: Optional[str]
    instrument_type: Optional[str]
    currency: Optional[str]
    isin: Optional[str] = None
    # Live quote, populated only when the provider can fill it cheaply.
    last_price: Optional[float] = None
    day_change_pct: Optional[float] = None


@dataclass
class ProviderNewsItem:
    story_id: str
    title: str
    summary: Optional[str]
    url: Optional[str]
    source: Optional[str]
    published_at: Optional[datetime]
    sentiment: Optional[str] = None  # positive | negative | neutral
    image_url: Optional[str] = None
    symbols: list[str] = field(default_factory=list)
    # Full article body (HTML). Only the single-story fetch fills this in;
    # list responses leave it None to keep one request per page of news.
    body_html: Optional[str] = None


@dataclass
class ProviderNewsPage:
    items: list[ProviderNewsItem]
    total: int


@dataclass
class ProviderCandle:
    """One daily (or other timeframe) OHLC bar for a symbol."""

    date: date
    open: float
    high: float
    low: float
    close: float


@dataclass
class ProviderEarnPosition:
    """One yield-bearing balance held outside the regular spot position list.

    Live-fetched, never persisted — same treatment as company-research data.
    """

    asset: str
    amount: float
    kind: str  # "flexible" | "locked"
    apr: Optional[float] = None
    accrued_yield: Optional[float] = None
    lock_end_time: Optional[datetime] = None


class InvestmentProvider(ABC):
    """Adapter interface a brokerage integration implements.

    Keeps broker-specific request/response shapes out of the sync service, so
    adding a second broker later is a new subclass registered in
    app/services/investment_providers/__init__.py — not a change to the sync
    logic or the API routes.

    `base_currency` is the account's own currency: every provider converts its
    multi-currency figures into it so the app never sums across currencies.
    """

    def __init__(self, public_key: str, private_key: str, base_currency: str = "USD"):
        self.public_key = public_key
        self.private_key = private_key
        self.base_currency = (base_currency or "USD").upper()

    @abstractmethod
    def get_balance(self) -> ProviderBalance:
        ...

    @abstractmethod
    def get_positions(self) -> list[ProviderPosition]:
        ...

    @abstractmethod
    def get_transactions(self, since: Optional[datetime] = None) -> list[ProviderTransaction]:
        ...

    def search_symbols(self, query: str) -> list[ProviderSymbol]:
        """Ticker/instrument search. Optional — providers without a search API raise."""
        raise NotImplementedError(f"{type(self).__name__} does not support symbol search")

    def get_news(
        self,
        query: str = "",
        symbol: Optional[str] = None,
        limit: int = 30,
        offset: int = 0,
        language: Optional[str] = None,
    ) -> ProviderNewsPage:
        """News feed, optionally scoped to one symbol. Optional — see search_symbols."""
        raise NotImplementedError(f"{type(self).__name__} does not support news")

    def get_news_story(self, story_id: str) -> ProviderNewsItem:
        """One story including its body. Optional — see search_symbols."""
        raise NotImplementedError(f"{type(self).__name__} does not support news")

    def get_candles(
        self, symbol: str, start: date, end: date
    ) -> list[ProviderCandle]:
        """Daily OHLC bars for `symbol`. Optional — used to backfill portfolio charts."""
        raise NotImplementedError(f"{type(self).__name__} does not support candles")

    def get_earn_positions(self) -> list[ProviderEarnPosition]:
        """Yield-bearing balances (staking, savings/earn products). Optional — see search_symbols."""
        raise NotImplementedError(f"{type(self).__name__} does not support earn positions")
