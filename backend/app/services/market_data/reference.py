import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger("app")

DEFAULT_BENCHMARK = "^GSPC"

BENCHMARKS = [
    {"symbol": "^GSPC", "label": "S&P 500"},
    {"symbol": "^STOXX50E", "label": "Euro Stoxx 50"},
    {"symbol": "URTH", "label": "MSCI World (URTH)"},
    {"symbol": "AGG", "label": "US Aggregate Bonds (AGG)"},
    {"symbol": "BTC-USD", "label": "Bitcoin"},
    {"symbol": "^IXIC", "label": "Nasdaq Composite"},
]

RISK_FREE_SYMBOL = "^IRX"


def periods_per_year(quote_type: Optional[str]) -> int:
    if (quote_type or "").lower() in ("crypto", "currency"):
        return 365
    return 252


def get_risk_free_rate(
    db: Session, start: date, end: date, *, override_annual: Optional[float] = None
) -> tuple[pd.Series, str]:
    """Daily annualised risk-free rate series, reindexed onto [start, end], plus provenance."""
    if override_annual is not None:
        idx = pd.date_range(start, end, freq="D")
        return pd.Series(override_annual, index=idx), "user_override"

    try:
        # Imported lazily to avoid a circular import (prices.py -> this module).
        from app.services.market_data.prices import get_price_history

        history = get_price_history([RISK_FREE_SYMBOL], start, end, db=db)
        series = history[RISK_FREE_SYMBOL]["close"] / 100.0
        idx = pd.date_range(start, end, freq="D")
        series = series.reindex(series.index.union(idx)).sort_index().ffill().reindex(idx).ffill().bfill()
        if series.isna().all():
            raise ValueError("empty risk-free series")
        return series, "irx"
    except Exception:  # noqa: BLE001 - fall back to the configured constant, never fail the request
        logger.warning("Falling back to constant risk-free rate (^IRX unavailable)", exc_info=True)
        idx = pd.date_range(start, end, freq="D")
        return pd.Series(settings.ANALYTICS_RISK_FREE_ANNUAL, index=idx), "fallback_constant"


def to_currency(
    prices: pd.DataFrame, from_ccy: Optional[str], to_ccy: Optional[str], db: Session
) -> tuple[pd.DataFrame, bool]:
    """Convert a price frame's OHLC columns from from_ccy to to_ccy. Returns (frame, fx_applied)."""
    if not from_ccy or not to_ccy or from_ccy.upper() == to_ccy.upper():
        return prices, False

    from app.services.market_data.prices import get_price_history

    start = prices.index.min().date()
    end = prices.index.max().date() + timedelta(days=1)

    pair = f"{from_ccy.upper()}{to_ccy.upper()}=X"
    inverse_pair = f"{to_ccy.upper()}{from_ccy.upper()}=X"

    try:
        history = get_price_history([pair], start, end, db=db)
        fx = history[pair]["close"]
        invert = False
    except Exception:  # noqa: BLE001
        try:
            history = get_price_history([inverse_pair], start, end, db=db)
            fx = history[inverse_pair]["close"]
            invert = True
        except Exception:  # noqa: BLE001
            logger.warning("FX conversion %s->%s unavailable; leaving prices in native currency", from_ccy, to_ccy)
            return prices, False

    fx = fx.reindex(prices.index).ffill().bfill()
    if invert:
        fx = 1.0 / fx

    converted = prices.copy()
    for col in ("open", "high", "low", "close"):
        if col in converted.columns:
            converted[col] = converted[col] * fx
    return converted, True
