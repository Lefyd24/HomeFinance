"""Price history and range-scoped analytics for the company research page.

Split out of the company profile endpoint so switching the chart range never
re-fetches `ticker.info` (the slow part). Prices come from the DB-cached
`market_data` layer, not raw yfinance, so repeat range switches hit SQLite and
the numbers agree with the comparison page.

Convention, per docs/investments/03-technical-analysis.md Part 1: adjusted
prices for every return/risk metric, unadjusted prices for the drawn chart.
"""

import logging
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.schemas.investment import (
    CompanyHistoryResponse,
    HistogramBin,
    HorizonStats,
    PriceBar,
    RollingPoint,
)
from app.services.analytics import relation, returns as R, risk as K
from app.services.market_data import (
    get_price_history,
    get_price_history_raw,
    get_risk_free_rate,
    get_symbol_meta,
    periods_per_year,
)
from app.services.market_data.reference import DEFAULT_BENCHMARK

logger = logging.getLogger("app")

# Chart ranges the endpoint accepts. Values are lookback days; None means
# "anchor to something other than a fixed offset" (ytd/max).
PERIODS: dict[str, Optional[int]] = {
    "1m": 30,
    "3m": 91,
    "6m": 182,
    "ytd": None,
    "1y": 365,
    "5y": 1825,
    "max": None,
}

# Fixed lookbacks for the horizon table. Deliberately NOT tied to the selected
# chart range — these must not move when the user switches ranges.
HORIZONS: list[tuple[str, int]] = [("1y", 365), ("3y", 1095), ("5y", 1825)]

# Extra calendar days fetched before the window start so SMA200 and the rolling
# windows are already warmed up at the left edge of a short range.
WARMUP_DAYS = 400

ROLLING_VOL_WINDOW = 30
ROLLING_BETA_WINDOW = 60
ROLLING_SHARPE_WINDOW = 60
HISTOGRAM_BINS = 25

# The longest lookback anything needs: 5y horizon + warmup.
_MAX_LOOKBACK_DAYS = 1825 + WARMUP_DAYS


def _window_start(period: str, end: date, first_available: Optional[date]) -> date:
    if period == "ytd":
        return date(end.year, 1, 1)
    days = PERIODS.get(period)
    if period == "max" or days is None:
        return first_available or (end - timedelta(days=_MAX_LOOKBACK_DAYS))
    return end - timedelta(days=days)


def _iso(value) -> str:
    return pd.Timestamp(value).date().isoformat()


def _f(value) -> Optional[float]:
    """Floats only — never nan/inf, which are not valid JSON."""
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if np.isfinite(out) else None


def _bars(raw: pd.DataFrame, window_start: pd.Timestamp) -> list[PriceBar]:
    """Chart bars with SMA overlays computed on the warmed-up frame, then sliced."""
    sma50 = raw["close"].rolling(50, min_periods=50).mean()
    sma200 = raw["close"].rolling(200, min_periods=200).mean()
    sliced = raw.loc[raw.index >= window_start]
    return [
        PriceBar(
            date=_iso(index),
            open=_f(row.get("open")),
            high=_f(row.get("high")),
            low=_f(row.get("low")),
            close=_f(row.get("close")),
            volume=_f(row.get("volume")),
            sma50=_f(sma50.get(index)),
            sma200=_f(sma200.get(index)),
        )
        for index, row in sliced.iterrows()
    ]


def _horizon(
    label: str,
    days: int,
    adj_close: pd.Series,
    bench_close: pd.Series,
    rf_series: pd.Series,
    ppy: int,
    end: pd.Timestamp,
) -> HorizonStats:
    start = end - pd.Timedelta(days=days)
    prices = adj_close.loc[adj_close.index >= start]
    if len(prices) < 2:
        return HorizonStats(horizon=label)

    own = R.simple_returns(prices)
    rf_annual = rf_series.reindex(own.index).ffill().bfill()
    rf_periodic = (1 + rf_annual) ** (1 / ppy) - 1
    rf_ann_avg = float(rf_series.mean())
    mar = (1 + rf_ann_avg) ** (1 / ppy) - 1

    dd = R.max_drawdown(own)
    sharpe_res = K.sharpe(own, rf_periodic, ppy)

    bench_prices = bench_close.loc[bench_close.index >= start]
    beta = alpha = up_cap = down_cap = None
    if len(bench_prices) >= 2:
        bench_ret = R.simple_returns(bench_prices)
        model = relation.market_model(own - rf_periodic, bench_ret - rf_periodic, ppy)
        if model is not None:
            beta, alpha = model.beta, model.alpha_annual
        up_cap, down_cap = relation.capture_ratios(own, bench_ret)

    return HorizonStats(
        horizon=label,
        annualized_return=_f(R.cagr(prices)),
        volatility=_f(R.annualized_vol(own, ppy)),
        sharpe=_f(sharpe_res.value) if sharpe_res is not None else None,
        sortino=_f(K.sortino(own, mar, ppy)),
        max_drawdown=_f(dd.depth) if dd is not None else None,
        days_under_water=dd.days_under_water if dd is not None else None,
        beta=_f(beta),
        alpha=_f(alpha),
        up_capture=_f(up_cap),
        down_capture=_f(down_cap),
    )


def _rolling(series: pd.Series) -> list[RollingPoint]:
    return [
        RollingPoint(date=_iso(index), value=_f(value))
        for index, value in series.items()
        if _f(value) is not None
    ]


def _histogram(daily: pd.Series) -> tuple[list[HistogramBin], int]:
    clean = daily.dropna()
    if clean.empty:
        return [], 0
    counts, edges = np.histogram(clean.to_numpy(), bins=HISTOGRAM_BINS)
    bins = [
        HistogramBin(lower=float(edges[i]), upper=float(edges[i + 1]), count=int(counts[i]))
        for i in range(HISTOGRAM_BINS)
    ]
    return bins, int(counts.sum())


def build_company_history(
    db: Session,
    symbol: str,
    period: str = "1y",
    benchmark: str = DEFAULT_BENCHMARK,
) -> CompanyHistoryResponse:
    """Bars for `period`, plus fixed 1y/3y/5y horizon stats and range-scoped rolling series."""
    if period not in PERIODS:
        raise ValueError(f"period must be one of {sorted(PERIODS)}")

    normalized = (symbol or "").strip().upper()
    if not normalized:
        raise ValueError("Symbol is required")

    meta = get_symbol_meta(db, normalized)
    ppy = getattr(meta, "periods_per_year", None) or periods_per_year(
        getattr(meta, "quote_type", None)
    )

    end = date.today()
    fetch_start = end - timedelta(days=_MAX_LOOKBACK_DAYS)

    adj = get_price_history([normalized], fetch_start, end, db=db)[normalized].sort_index()
    try:
        raw = get_price_history_raw([normalized], fetch_start, end, db=db)[normalized].sort_index()
    except Exception:  # noqa: BLE001 - unadjusted series is a nicety, adjusted is the fallback
        logger.warning("Unadjusted history unavailable for %s; charting adjusted", normalized)
        raw = adj

    try:
        bench = get_price_history([benchmark], fetch_start, end, db=db)[benchmark].sort_index()
        bench_close = bench["close"]
    except Exception:  # noqa: BLE001 - beta/alpha degrade to None rather than failing the page
        logger.warning("Benchmark %s unavailable; beta and alpha will be null", benchmark)
        bench_close = pd.Series(dtype=float)

    first_available = adj.index.min().date() if not adj.empty else None
    last_index = pd.Timestamp(adj.index.max()) if not adj.empty else pd.Timestamp(end)
    # Anchor the window to the latest bar actually on hand, not the calendar
    # date — the cached series can lag "today" (weekends, provider delay), and
    # anchoring to "today" would slice every range down to nothing.
    window_start = pd.Timestamp(_window_start(period, last_index.date(), first_available))

    rf_series, _ = get_risk_free_rate(db, fetch_start, end)

    horizons = [
        _horizon(label, days, adj["close"], bench_close, rf_series, ppy, last_index)
        for label, days in HORIZONS
    ]

    # Rolling series and the histogram follow the SELECTED range.
    own_full = R.simple_returns(adj["close"]) if len(adj) >= 2 else pd.Series(dtype=float)
    in_window = own_full.loc[own_full.index >= window_start]

    rolling_vol = (
        own_full.rolling(ROLLING_VOL_WINDOW, min_periods=ROLLING_VOL_WINDOW).std(ddof=1)
        * np.sqrt(ppy)
    ).loc[lambda s: s.index >= window_start]

    if not bench_close.empty and len(own_full) >= 2:
        bench_ret = R.simple_returns(bench_close)
        aligned = pd.concat([own_full, bench_ret], axis=1, join="inner").dropna()
        aligned.columns = ["asset", "bench"]
        cov = aligned["asset"].rolling(ROLLING_BETA_WINDOW).cov(aligned["bench"])
        var = aligned["bench"].rolling(ROLLING_BETA_WINDOW).var()
        rolling_beta = (cov / var.replace(0, np.nan)).loc[lambda s: s.index >= window_start]
    else:
        rolling_beta = pd.Series(dtype=float)

    rf_annual_full = rf_series.reindex(own_full.index).ffill().bfill()
    rf_periodic_full = (1 + rf_annual_full) ** (1 / ppy) - 1
    excess = own_full - rf_periodic_full
    roll_mean = excess.rolling(ROLLING_SHARPE_WINDOW, min_periods=ROLLING_SHARPE_WINDOW).mean()
    roll_std = excess.rolling(ROLLING_SHARPE_WINDOW, min_periods=ROLLING_SHARPE_WINDOW).std(ddof=1)
    rolling_sharpe = (roll_mean * ppy / (roll_std.replace(0, np.nan) * np.sqrt(ppy))).loc[
        lambda s: s.index >= window_start
    ]

    histogram, observations = _histogram(in_window)

    return CompanyHistoryResponse(
        symbol=normalized,
        period=period,
        currency=getattr(meta, "currency", None),
        benchmark_symbol=benchmark,
        bars=_bars(raw, window_start),
        horizons=horizons,
        rolling_volatility=_rolling(rolling_vol),
        rolling_beta=_rolling(rolling_beta),
        rolling_sharpe=_rolling(rolling_sharpe),
        return_histogram=histogram,
        return_observations=observations,
    )
