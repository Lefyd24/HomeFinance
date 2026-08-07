import logging
import math
import re
import threading
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Optional, Sequence

import pandas as pd
import yfinance as yf
from sqlalchemy import and_
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import MarketPriceBar, MarketSymbolMeta
from app.services.market_data.errors import MarketDataUnavailable, SymbolNotFound

logger = logging.getLogger("app")

_SYMBOL_RE = re.compile(r"^[A-Za-z0-9.\-^=&/]{1,50}$")

# Yahoo symbols include things like ^GSPC, BTC-USD, EURUSD=X, VWCE.DE — this lock keyed by
# symbol prevents two simultaneous requests for the same ticker from both hitting Yahoo.
_symbol_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()

_UPSERT_CHUNK_SIZE = 500
_QUOTE_TYPE_MAP = {
    "EQUITY": "stock",
    "ETF": "etf",
    "MUTUALFUND": "mutual_fund",
    "CRYPTOCURRENCY": "crypto",
    "INDEX": "index",
    "CURRENCY": "currency",
}


def _symbol_lock(symbol: str) -> threading.Lock:
    with _locks_guard:
        return _symbol_locks[symbol]


def _normalize_symbol(symbol: str) -> str:
    normalized = (symbol or "").strip().upper()
    if not _SYMBOL_RE.match(normalized):
        raise SymbolNotFound(symbol)
    return normalized


def _safe_float(value: Any) -> Optional[float]:
    """Coerce to a JSON/DB-safe finite float, or None (mirrors yahoo.py's _safe_float)."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _cached_range(db: Session, symbol: str) -> tuple[Optional[date], Optional[date]]:
    row = (
        db.query(MarketPriceBar.date)
        .filter(MarketPriceBar.symbol == symbol)
        .order_by(MarketPriceBar.date.asc())
        .first()
    )
    last = (
        db.query(MarketPriceBar.date)
        .filter(MarketPriceBar.symbol == symbol)
        .order_by(MarketPriceBar.date.desc())
        .first()
    )
    return (row[0] if row else None, last[0] if last else None)


def _coverage_sufficient(
    cached_first: Optional[date], cached_last: Optional[date], start: date, end: date
) -> bool:
    if cached_first is None or cached_last is None:
        return False
    if cached_first > start:
        return False
    today = date.today()
    stale_cutoff = min(end, today) - timedelta(days=4)
    return cached_last >= stale_cutoff


def _fetch_start(
    cached_first: Optional[date], cached_last: Optional[date], start: date
) -> date:
    if cached_first is not None and cached_first > start:
        return min(start, cached_first) - timedelta(days=5)
    if cached_last is not None:
        return cached_last - timedelta(days=5)
    return start - timedelta(days=5)


def _download_one(symbol: str, fetch_start: date, fetch_end: date) -> pd.DataFrame:
    try:
        frame = yf.download(
            symbol,
            start=fetch_start.isoformat(),
            end=(fetch_end + timedelta(days=1)).isoformat(),
            interval="1d",
            auto_adjust=True,
            actions=False,
            progress=False,
            threads=False,
            timeout=20,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to caller as a typed error
        logger.exception("yfinance download failed for %s", symbol)
        raise MarketDataUnavailable(symbol, str(exc)) from exc

    if frame is None or frame.empty:
        return pd.DataFrame()

    if isinstance(frame.columns, pd.MultiIndex):
        try:
            frame = frame.xs(symbol, axis=1, level=-1)
        except KeyError:
            frame.columns = frame.columns.get_level_values(0)

    frame = frame.rename(columns=str.lower)
    return frame


def _upsert_bars(db: Session, symbol: str, frame: pd.DataFrame, currency: Optional[str]) -> None:
    if frame.empty:
        return

    rows: list[dict] = []
    for idx, row in frame.iterrows():
        close = _safe_float(row.get("close"))
        if close is None:
            continue
        bar_date = idx.date() if hasattr(idx, "date") else idx
        rows.append(
            {
                "symbol": symbol,
                "date": bar_date,
                "open": _safe_float(row.get("open")) or close,
                "high": _safe_float(row.get("high")) or close,
                "low": _safe_float(row.get("low")) or close,
                "close": close,
                "volume": _safe_float(row.get("volume")),
                "currency": currency,
            }
        )

    if not rows:
        return

    table = MarketPriceBar.__table__
    for i in range(0, len(rows), _UPSERT_CHUNK_SIZE):
        chunk = rows[i : i + _UPSERT_CHUNK_SIZE]
        stmt = sqlite_insert(table).values(chunk)
        update_cols = {c: stmt.excluded[c] for c in ("open", "high", "low", "close", "volume", "currency")}
        stmt = stmt.on_conflict_do_update(
            index_elements=["symbol", "date"], set_=update_cols
        )
        db.execute(stmt)
    db.commit()


def _read_window(db: Session, symbol: str, start: date, end: date) -> pd.DataFrame:
    rows = (
        db.query(MarketPriceBar)
        .filter(
            and_(
                MarketPriceBar.symbol == symbol,
                MarketPriceBar.date >= start,
                MarketPriceBar.date <= end,
            )
        )
        .order_by(MarketPriceBar.date.asc())
        .all()
    )
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume", "currency"])
    frame = pd.DataFrame(
        {
            "date": [r.date for r in rows],
            "open": [r.open for r in rows],
            "high": [r.high for r in rows],
            "low": [r.low for r in rows],
            "close": [r.close for r in rows],
            "volume": [r.volume for r in rows],
            "currency": [r.currency for r in rows],
        }
    )
    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.set_index("date").sort_index()
    frame = frame[~frame.index.duplicated(keep="last")]
    return frame


def get_symbol_meta(db: Session, symbol: str, *, refresh: bool = False) -> MarketSymbolMeta:
    normalized = _normalize_symbol(symbol)
    row = db.query(MarketSymbolMeta).filter(MarketSymbolMeta.symbol == normalized).first()
    stale = row is None or row.refreshed_at is None or (
        datetime.utcnow() - row.refreshed_at > timedelta(days=7)
    )
    if row is not None and not stale and not refresh:
        return row

    try:
        ticker = yf.Ticker(normalized)
        info = ticker.info or {}
    except Exception:  # noqa: BLE001 - best-effort enrichment, fall back to prior/defaults
        logger.debug("Yahoo symbol meta fetch failed for %s", normalized, exc_info=True)
        info = {}

    quote_type = _QUOTE_TYPE_MAP.get(str(info.get("quoteType", "")).upper(), None)
    currency = info.get("currency")
    periods = 365 if quote_type in ("crypto", "currency") else 252

    if row is None:
        row = MarketSymbolMeta(symbol=normalized)
        db.add(row)

    row.name = info.get("shortName") or info.get("longName") or row.name
    row.quote_type = quote_type or row.quote_type
    row.currency = currency or row.currency
    row.exchange = info.get("exchange") or row.exchange
    row.periods_per_year = periods
    row.refreshed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def get_price_history(
    symbols: Sequence[str],
    start: date,
    end: date,
    *,
    db: Session,
    refresh: bool = False,
) -> dict[str, pd.DataFrame]:
    """Adjusted daily OHLCV per symbol, indexed by date, ascending, no duplicate dates."""
    result: dict[str, pd.DataFrame] = {}
    to_bulk_fetch: list[str] = []

    normalized_symbols = [_normalize_symbol(s) for s in symbols]

    for symbol in normalized_symbols:
        with _symbol_lock(symbol):
            cached_first, cached_last = _cached_range(db, symbol)
            if refresh or not _coverage_sufficient(cached_first, cached_last, start, end):
                to_bulk_fetch.append(symbol)

    if len(to_bulk_fetch) >= 3:
        _bulk_fetch_and_store(db, to_bulk_fetch, start, end)
    else:
        for symbol in to_bulk_fetch:
            _fetch_and_store_one(db, symbol, start, end)

    for symbol in normalized_symbols:
        frame = _read_window(db, symbol, start, end)
        if frame.empty:
            raise SymbolNotFound(symbol)
        result[symbol] = frame

    return result


def _fetch_and_store_one(db: Session, symbol: str, start: date, end: date) -> None:
    with _symbol_lock(symbol):
        cached_first, cached_last = _cached_range(db, symbol)
        fstart = _fetch_start(cached_first, cached_last, start)
        frame = _download_one(symbol, fstart, end)
        meta = db.query(MarketSymbolMeta).filter(MarketSymbolMeta.symbol == symbol).first()
        currency = meta.currency if meta else None
        _upsert_bars(db, symbol, frame, currency)


def _bulk_fetch_and_store(db: Session, symbols: list[str], start: date, end: date) -> None:
    earliest_start = start
    for symbol in symbols:
        cached_first, cached_last = _cached_range(db, symbol)
        fstart = _fetch_start(cached_first, cached_last, start)
        earliest_start = min(earliest_start, fstart)

    try:
        frame = yf.download(
            symbols,
            start=earliest_start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
            interval="1d",
            auto_adjust=True,
            actions=False,
            progress=False,
            threads=False,
            timeout=30,
            group_by="ticker",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("yfinance bulk download failed for %s", symbols)
        # Fall back to per-symbol fetches rather than failing the whole batch.
        for symbol in symbols:
            _fetch_and_store_one(db, symbol, start, end)
        return

    if frame is None or frame.empty:
        for symbol in symbols:
            _fetch_and_store_one(db, symbol, start, end)
        return

    for symbol in symbols:
        try:
            if isinstance(frame.columns, pd.MultiIndex):
                sub = frame[symbol] if symbol in frame.columns.get_level_values(0) else pd.DataFrame()
            else:
                sub = frame
            sub = sub.rename(columns=str.lower)
        except Exception:  # noqa: BLE001
            sub = pd.DataFrame()

        if sub.empty:
            _fetch_and_store_one(db, symbol, start, end)
            continue

        meta = db.query(MarketSymbolMeta).filter(MarketSymbolMeta.symbol == symbol).first()
        currency = meta.currency if meta else None
        _upsert_bars(db, symbol, sub, currency)
