"""The journey of one real holding: what it was worth, day by day, since it was opened.

There is no stored per-position history to read back. `PortfolioPosition` rows
are replaced wholesale on every sync (see the model's docstring) and
`PortfolioSnapshot` records the account total, not its parts. So the *quantity*
line comes from the account's own trade tape — which says how many units were
held on any given day and what was actually paid for them — and the *price*
line comes from the market.

Prices are Yahoo's, through the shared `market_data` cache the research and
comparison pages already use: a real, complete daily series for the instrument,
independent of how far back a particular broker's own candle endpoint happens
to reach. That requires mapping the broker's ticker onto Yahoo's, which is a
heuristic and therefore verified before use (`market_data.broker_symbols`); a
symbol that cannot be resolved and confirmed falls back to the broker's own
`get_candles`, and the response reports which of the two priced the series
(`price_source`).

The last point is overwritten with the live synced valuation, so the chart ends
on the same number the rest of the page shows.

Everything is expressed in the account's own currency. Instrument prices are
converted with the position's current `fx_rate`, which means historical points
are marked at today's exchange rate — the app has no rate history to do better,
and inventing one would be worse than a documented simplification.
"""
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Account,
    InvestmentTransaction,
    MarketPriceBar,
    PortfolioPosition,
)
from app.services.investment_sync_service import get_provider_for_account
from app.services.market_data import (
    MarketDataUnavailable,
    SymbolNotFound,
    YahooListing,
    get_price_history,
    resolve_yahoo_listing,
)

logger = logging.getLogger("app.investments.position_history")

# Broker candles live in the shared bar cache under a provider-suffixed symbol,
# so Freedom24's "INUV.US" can never collide with a Yahoo series for the same
# ticker (or with `prices.py`'s own "-RAW" suffix).
_CACHE_SUFFIX = {"freedom24": "-F24", "binance": "-BNB"}

# How stale the cached tail may be before the broker is asked again. One day:
# a daily bar for today only exists once the session closes anyway.
_CACHE_MAX_AGE = timedelta(days=1)

# Windows the page offers. "entry" is the default and the only one anchored to
# the position rather than to today — with a lead-in, because a chart that
# begins on the purchase gives no sense of what the price was doing when the
# decision was made. The rest are ordinary lookbacks and may start well before
# the position existed, which is the point: the pre-entry stretch is context.
ENTRY_LEAD_IN = timedelta(days=30)
RANGE_DAYS: dict[str, Optional[int]] = {
    "1m": 30,
    "3m": 90,
    "6m": 182,
    "1y": 365,
    "5y": 365 * 5,
    "max": None,
}
DEFAULT_RANGE = "entry"
RANGES = (DEFAULT_RANGE, *RANGE_DAYS)


@dataclass
class PositionHistoryPoint:
    """One day on the chart.

    `value` and `invested` are None on days the position did not exist — before
    the first buy, or after it was sold out. Null rather than zero: a zero
    would draw a line along the floor and read as "this was worth nothing",
    when the honest statement is "there was nothing here yet". `price` is
    populated across the whole window regardless, since the instrument had a
    price long before anyone bought it.
    """

    date: date
    quantity: float
    price: Optional[float]
    value: Optional[float]
    invested: Optional[float]
    fees: float


@dataclass
class PositionHistory:
    symbol: str
    name: Optional[str]
    currency: str
    opened_on: Optional[date]
    basis: str
    # "yahoo:<ticker>" when the mapping resolved and was confirmed, "broker"
    # when it fell back to the broker's own candles, "none" when neither had
    # anything to price with.
    price_source: str
    quantity: float
    market_value: float
    cost_basis: float
    fees_paid: float
    realized_pnl: float
    unrealized_pnl: float
    unrealized_return_pct: Optional[float]
    # The window actually charted, and the ticker mapping that priced it —
    # both surfaced so the page can show them rather than assert them.
    range: str = DEFAULT_RANGE
    start: Optional[date] = None
    end: Optional[date] = None
    mapped_symbol: Optional[str] = None
    mapped_currency: Optional[str] = None
    native_currency: Optional[str] = None
    mapping_checked: list[tuple[str, str, Optional[str]]] = field(default_factory=list)
    buy_dates: list[date] = field(default_factory=list)
    series: list[PositionHistoryPoint] = field(default_factory=list)


def _cache_symbol(provider: str, symbol: str) -> str:
    return f"{symbol}{_CACHE_SUFFIX.get(provider, '-BRK')}"


def _cached_closes(db: Session, cache_symbol: str) -> dict[date, float]:
    rows = (
        db.query(MarketPriceBar.date, MarketPriceBar.close)
        .filter(MarketPriceBar.symbol == cache_symbol)
        .all()
    )
    return {row[0]: row[1] for row in rows if row[1]}


def _store_closes(db: Session, cache_symbol: str, candles, currency: Optional[str]) -> None:
    existing = {
        row[0]
        for row in db.query(MarketPriceBar.date)
        .filter(MarketPriceBar.symbol == cache_symbol)
        .all()
    }
    for candle in candles:
        if candle.date in existing:
            continue
        db.add(
            MarketPriceBar(
                symbol=cache_symbol,
                date=candle.date,
                open=candle.open,
                high=candle.high,
                low=candle.low,
                close=candle.close,
                currency=currency,
            )
        )
    db.commit()


def _yahoo_closes(
    db: Session, symbol: str, provider: Optional[str], currency: Optional[str], start: date, end: date
) -> tuple[dict[date, float], YahooListing]:
    """(closes, the mapping attempt) — closes are empty if nothing could be confirmed.

    The mapping is verified against the price cache and the instrument's
    currency before anything is drawn (see `broker_symbols`), because pricing a
    position off a same-named company on the wrong exchange is worse than
    showing no chart at all.
    """
    listing = resolve_yahoo_listing(
        db, symbol, provider, currency=currency, start=start, end=end
    )
    if not listing.resolved:
        return {}, listing

    try:
        frames = get_price_history([listing.symbol], start, end, db=db)
    except (SymbolNotFound, MarketDataUnavailable):
        return {}, listing
    except Exception:  # noqa: BLE001 - a chart is never worth failing a request over
        logger.warning("Yahoo price history failed for %s", listing.symbol, exc_info=True)
        return {}, listing

    frame = frames.get(listing.symbol)
    if frame is None or frame.empty or "close" not in frame:
        return {}, listing

    closes = {
        (index.date() if hasattr(index, "date") else index): float(value)
        for index, value in frame["close"].items()
        if value == value  # NaN check
    }
    return closes, listing


def _broker_closes(
    db: Session, account: Account, symbol: str, start: date, end: date, currency: Optional[str]
) -> dict[date, float]:
    """Daily closes from the broker itself, cached — the fallback when Yahoo can't be mapped.

    A broker failure is not fatal: whatever is already cached still draws a
    chart, and an empty result leaves the caller to say so honestly.
    """
    cache_symbol = _cache_symbol(account.provider or "", symbol)
    closes = _cached_closes(db, cache_symbol)
    covered_from = min(closes) if closes else None
    covered_to = max(closes) if closes else None
    stale = (
        covered_to is None
        or covered_to < end - _CACHE_MAX_AGE
        or (covered_from is not None and covered_from > start)
    )
    if not stale:
        return closes

    try:
        provider = get_provider_for_account(account)
        candles = provider.get_candles(symbol, start, end)
    except Exception:  # noqa: BLE001 - a chart is never worth failing a request over
        logger.warning("Candle fetch failed for %s; using cached bars", symbol, exc_info=True)
        return closes

    if candles:
        _store_closes(db, cache_symbol, candles, currency)
        closes.update({c.date: c.close for c in candles if c.close})
    return closes


def _to_base(amount: float, currency: str, account_currency: str, fx_rate: float) -> float:
    """A transaction amount in the account's currency.

    Rows already booked in the account's currency pass through; rows in the
    instrument's currency use the position's own rate. Same best-effort rule
    (and same reason) as the fee attribution in routers/investments.py.
    """
    if (currency or account_currency).upper() == account_currency.upper():
        return amount
    return amount * (fx_rate or 1.0)


def _window_start(range_key: str, opened_on: Optional[date], today: date) -> date:
    """The first day to chart.

    "entry" backs up a month before the first buy so the purchase lands inside
    the picture instead of at its left edge — you cannot judge an entry against
    a chart that begins at the entry. Fixed lookbacks are measured from today
    and are free to start long before the position existed; "max" reaches back
    to whichever is earlier, the opening or five years.
    """
    if range_key == DEFAULT_RANGE:
        return (opened_on - ENTRY_LEAD_IN) if opened_on else today - timedelta(days=180)
    days = RANGE_DAYS.get(range_key, RANGE_DAYS["1y"])
    if days is None:  # "max"
        earliest = today - timedelta(days=365 * 5)
        return min(earliest, opened_on - ENTRY_LEAD_IN) if opened_on else earliest
    return today - timedelta(days=days)


def build_position_history(
    db: Session,
    account: Account,
    symbol: str,
    *,
    position: Optional[PortfolioPosition] = None,
    range_key: str = DEFAULT_RANGE,
) -> PositionHistory:
    """Assemble one holding's day-by-day story. See the module docstring."""
    range_key = range_key if range_key in RANGES else DEFAULT_RANGE
    account_currency = (account.currency or "USD").upper()
    if position is None:
        position = (
            db.query(PortfolioPosition)
            .filter(
                PortfolioPosition.account_id == account.id,
                PortfolioPosition.symbol == symbol,
            )
            .first()
        )
    fx_rate = (position.fx_rate if position and position.fx_rate else 1.0) or 1.0

    txns = (
        db.query(InvestmentTransaction)
        .filter(
            InvestmentTransaction.account_id == account.id,
            InvestmentTransaction.symbol == symbol,
        )
        .order_by(InvestmentTransaction.date.asc())
        .all()
    )
    trades = [t for t in txns if t.type in ("buy", "sell") and t.date]
    fees = [t for t in txns if t.type == "fee" and t.date]

    buy_dates = sorted({t.date.date() for t in trades if t.type == "buy"})
    opened_on = buy_dates[0] if buy_dates else None

    if position is None and not trades:
        # Nothing was ever held and nothing was ever traded under this ticker;
        # there is no story to tell, and the caller turns this into a 404
        # rather than drawing a flat line at zero.
        return PositionHistory(
            symbol=symbol,
            name=None,
            currency=account_currency,
            opened_on=None,
            basis="reconstructed",
            price_source="none",
            range=range_key,
            quantity=0.0,
            market_value=0.0,
            cost_basis=0.0,
            fees_paid=0.0,
            realized_pnl=0.0,
            unrealized_pnl=0.0,
            unrealized_return_pct=None,
        )

    market_value = (
        position.market_value_base
        if position and position.market_value_base is not None
        else (position.market_value if position else 0.0)
    )
    cost_basis = 0.0
    if position is not None:
        if position.cost_basis_base is not None:
            cost_basis = position.cost_basis_base
        elif position.cost_basis is not None:
            cost_basis = position.cost_basis * fx_rate
        elif position.avg_price is not None:
            cost_basis = position.avg_price * position.quantity * fx_rate

    fees_paid = sum(
        abs(_to_base(t.amount or 0.0, t.currency, account_currency, fx_rate)) for t in fees
    )

    today = date.today()
    start = _window_start(range_key, opened_on, today)
    native_currency = position.currency if position else None
    closes, listing = _yahoo_closes(
        db, symbol, account.provider, native_currency, start, today
    )
    price_source = f"yahoo:{listing.symbol}" if listing.resolved else "broker"
    if not closes:
        closes = _broker_closes(db, account, symbol, start, today, native_currency)

    # Every day something happened, plus every day the market printed a close.
    # Trades from *before* the window are included deliberately: a one-month
    # view of a holding bought a year ago has to start from the quantity that
    # was already there, not replay from zero and draw an empty position.
    # They are walked into the running state below and then not emitted.
    days: set[date] = {t.date.date() for t in trades if t.date.date() <= today}
    days |= {d for d in closes if start <= d <= today}
    days.add(today)

    trades_by_day: dict[date, list] = {}
    for txn in trades:
        trades_by_day.setdefault(txn.date.date(), []).append(txn)
    fees_by_day: dict[date, float] = {}
    for txn in fees:
        day = txn.date.date()
        fees_by_day[day] = fees_by_day.get(day, 0.0) + abs(
            _to_base(txn.amount or 0.0, txn.currency, account_currency, fx_rate)
        )

    quantity = 0.0
    invested = 0.0  # net cash paid in for this holding, in account currency
    fees_running = 0.0
    realized = 0.0
    avg_cost = 0.0  # per unit, account currency — for the realised split
    last_price: Optional[float] = None
    series: list[PositionHistoryPoint] = []

    for day in sorted(days):
        for txn in trades_by_day.get(day, []):
            qty = abs(txn.quantity or 0.0)
            cash = abs(_to_base(txn.amount or 0.0, txn.currency, account_currency, fx_rate))
            if txn.type == "buy":
                quantity += qty
                invested += cash
                avg_cost = invested / quantity if quantity else 0.0
            else:
                sold = min(qty, quantity)
                realized += cash - avg_cost * sold
                invested = max(invested - avg_cost * sold, 0.0)
                quantity = max(quantity - sold, 0.0)
        fees_running += fees_by_day.get(day, 0.0)

        if day < start:
            continue  # state carried forward; the window has not opened yet

        if day in closes:
            last_price = closes[day] * fx_rate
        price = last_price
        # Held or not decides whether this day has a position at all. Before
        # the first buy the window is showing the instrument's price only, and
        # a value of 0 there would be a line along the axis claiming the
        # holding was worthless rather than absent.
        held = quantity > 0
        series.append(
            PositionHistoryPoint(
                date=day,
                quantity=round(quantity, 8),
                price=round(price, 4) if price is not None else None,
                value=(
                    round(quantity * price, 2) if held and price is not None else None
                ),
                invested=round(invested, 2) if held else None,
                fees=round(fees_running, 2),
            )
        )

    # End on the figure the rest of the page shows, rather than on a close that
    # may be a session behind the broker's live valuation.
    if series and position is not None and position.quantity:
        series[-1].value = round(market_value, 2)
        series[-1].quantity = position.quantity
        series[-1].price = round(market_value / position.quantity, 4)

    unrealized = market_value - cost_basis
    return PositionHistory(
        symbol=symbol,
        name=position.name if position else None,
        currency=account_currency,
        opened_on=opened_on,
        basis="reconstructed",
        price_source=price_source if closes else "none",
        range=range_key,
        start=series[0].date if series else start,
        end=series[-1].date if series else today,
        mapped_symbol=listing.symbol,
        mapped_currency=listing.currency,
        native_currency=native_currency,
        mapping_checked=[(c.symbol, c.outcome, c.currency) for c in listing.checked],
        quantity=position.quantity if position else 0.0,
        market_value=round(market_value, 2),
        cost_basis=round(cost_basis, 2),
        fees_paid=round(fees_paid, 2),
        realized_pnl=round(realized, 2),
        unrealized_pnl=round(unrealized, 2),
        unrealized_return_pct=(
            round(unrealized / cost_basis * 100, 2) if cost_basis else None
        ),
        buy_dates=buy_dates,
        series=series,
    )
