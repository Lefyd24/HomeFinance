from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Text,
    DateTime,
    Date,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from datetime import datetime

from app.database import Base


class MarketPriceBar(Base):
    """One adjusted daily bar per (symbol, date). Split/dividend-adjusted at write time.

    Yahoo restates the whole adjusted history when a split or dividend occurs, so a
    refresh rewrites overlapping rows rather than only appending — see market_data/prices.py.
    """

    __tablename__ = "market_price_bars"
    __table_args__ = (
        UniqueConstraint("symbol", "date", name="uq_market_bar_symbol_date"),
        Index("ix_market_bar_symbol_date", "symbol", "date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), nullable=False)
    date = Column(Date, nullable=False)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)  # adjusted close (auto_adjust=True)
    volume = Column(Float, nullable=True)  # Float: crypto volumes exceed int32 and are fractional
    currency = Column(String(10), nullable=True)


class MarketSymbolMeta(Base):
    """Per-symbol facts that decide how its series is treated. Refreshed lazily (TTL 7d)."""

    __tablename__ = "market_symbol_meta"

    symbol = Column(String(50), primary_key=True)
    name = Column(String(200), nullable=True)
    quote_type = Column(String(20), nullable=True)  # stock|etf|crypto|index|mutual_fund|…
    currency = Column(String(10), nullable=True)
    exchange = Column(String(30), nullable=True)
    periods_per_year = Column(Integer, default=252)  # 365 for crypto
    first_bar_date = Column(Date, nullable=True)
    last_bar_date = Column(Date, nullable=True)
    refreshed_at = Column(DateTime, default=datetime.utcnow)


class SavedComparison(Base):
    """A user's saved ticker-comparison configuration (symbols/benchmark/period), not results."""

    __tablename__ = "saved_comparisons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    symbols = Column(Text, nullable=False)  # JSON list, order preserved
    benchmark = Column(String(50), nullable=True)
    period = Column(String(10), nullable=False, default="3y")
    created_at = Column(DateTime, default=datetime.utcnow)


class SavedWatch(Base):
    """A ticker a user is tracking on the company research page ("watchlist").

    `last_price`/`day_change_pct` are a best-effort cache refreshed on read (see
    routers/investments.py) so the watchlist can render without a Yahoo call per view.
    """

    __tablename__ = "saved_watches"
    __table_args__ = (UniqueConstraint("user_id", "symbol", name="uq_saved_watch_user_symbol"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String(50), nullable=False)
    name = Column(String(200), nullable=True)
    last_price = Column(Float, nullable=True)
    day_change_pct = Column(Float, nullable=True)
    last_updated = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
