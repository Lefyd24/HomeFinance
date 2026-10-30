"""Flow-adjusted portfolio performance: Modified Dietz TWR, XIRR, risk stats, P&L breakdown.

The first half is pure (no DB, no network) so it can be unit tested directly; the
second half loads data and wires in market data. Benchmark returns are the index's
own price return in its own currency (no FX conversion to the account currency).
"""

import logging
from bisect import bisect_left
from datetime import date, timedelta
from typing import Callable, Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models import (
    Account,
    InvestmentProviderSettings,
    InvestmentTransaction,
    PortfolioPosition,
    PortfolioSnapshot,
)
from app.schemas.investment_performance import (
    DayReturn,
    PerformanceBenchmark,
    PerformanceBreakdown,
    PerformancePoint,
    PerformanceResponse,
    PerformanceSummary,
)
from app.services.analytics.returns import annualized_vol, cumulative_return, drawdown_series, max_drawdown
from app.services.analytics.risk import sharpe
from app.services.market_data.prices import get_price_history
from app.services.position_history_service import renamed_symbol_map

logger = logging.getLogger(__name__)

STABLECOINS = {"USDT", "USDC", "BUSD", "FDUSD", "DAI"}
FIAT = {"USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY"}
INFER_TYPES = {"buy", "sell", "fee", "dividend", "tax", "fx"}
FLOW_TYPES = {"deposit", "withdrawal"}
NOISE_PCT = 0.005
MIN_RETURNS = 20
DEFAULT_BENCHMARK = "^GSPC"

# (amount, currency, day) -> amount in the account currency, or None if unconvertible.
Convert = Callable[[float, Optional[str], date], Optional[float]]


# ---------------------------------------------------------------- pure functions


def convert_amount(amount, currency, acct_ccy, day, fx, coin_px) -> Optional[float]:
    """fx(from, to, day) and coin_px(coin, day) return None when no rate is known."""
    cur = (currency or acct_ccy).upper()
    acct = acct_ccy.upper()
    if cur == acct:
        return amount
    if acct in STABLECOINS:
        acct = "USD"
    if cur in STABLECOINS:
        cur = "USD"
    elif cur not in FIAT:
        px = coin_px(cur, day)
        if px is None:
            return None
        amount, cur = amount * px, "USD"
    if cur == acct:
        return amount
    rate = fx(cur, acct, day)
    return None if rate is None else amount * rate


def _convert_or_raw(convert: Convert, amount, currency, day) -> float:
    out = convert(amount, currency, day)
    return amount if out is None else out


def account_flows(snaps, txns, convert: Convert):
    """snaps: [(date, value, cash)] ascending. Returns (flows aligned to snaps, source, net_external).

    flows[0] never feeds a return (no prior value); it only counts toward net_external.
    """
    dates = [s[0] for s in snaps]
    n = len(dates)
    buckets: list[list] = [[] for _ in range(n)]
    for t in txns:
        i = bisect_left(dates, t.date.date())
        if i < n:  # activity after the last snapshot is not in any value yet
            buckets[i].append(t)

    def infer(i: int) -> float:
        spent = sum(
            _convert_or_raw(convert, t.amount, t.currency, dates[i]) for t in buckets[i] if t.type in INFER_TYPES
        )
        f = (snaps[i][2] - snaps[i - 1][2]) - spent
        return 0.0 if abs(f) < max(NOISE_PCT * snaps[i - 1][1], 1.0) else f

    flows = [0.0] * n
    if any(t.type in FLOW_TYPES for b in buckets for t in b):
        unresolved = set()
        for i, b in enumerate(buckets):
            for t in b:
                if t.type not in FLOW_TYPES:
                    continue
                amt = convert(t.amount, t.currency, dates[i])
                if amt is None and i == 0:
                    amt = t.amount  # day 0 can't be inferred (no prior snapshot); the raw amount beats dropping it
                if amt is None:
                    unresolved.add(i)
                else:
                    flows[i] += amt
        for i in unresolved:
            flows[i] = infer(i)
        return flows, ("mixed" if unresolved else "reported"), sum(flows)

    for i in range(1, n):
        flows[i] = infer(i)
    return flows, "inferred", (snaps[0][1] if n else 0.0) + sum(flows)


def xirr(flows: list[tuple[date, float]]) -> Optional[float]:
    """Annual rate r with sum(cf * (1+r)^-(days/365)) = 0, by bisection on [-0.9999, 10]."""
    flows = [f for f in flows if f[1] != 0]
    if len(flows) < 2:
        return None
    d0 = min(d for d, _ in flows)

    def npv(r: float) -> float:
        return sum(cf * (1 + r) ** (-(d - d0).days / 365) for d, cf in flows)

    lo, hi = -0.9999, 10.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo == 0:
        return lo
    if f_hi == 0:
        return hi
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if f_mid == 0 or (hi - lo) < 1e-12:
            return mid
        if f_lo * f_mid < 0:
            hi = mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


def build_series(dates, values, cash, flows):
    """Modified Dietz (flows at start of day). Returns None when no day is investable.

    The series starts at the first day t with V[t-1] + F[t] > 0.
    """
    n = len(dates)
    s = next((i for i in range(1, n) if values[i - 1] + flows[i] > 0), None)
    if s is None:
        return None
    rets: dict[date, float] = {}
    for i in range(s, n):
        denom = values[i - 1] + flows[i]
        if denom > 0:
            rets[dates[i]] = (values[i] - values[i - 1] - flows[i]) / denom
    ret_series = pd.Series(rets, dtype=float)
    ret_series.index = pd.to_datetime(ret_series.index)
    dd = drawdown_series(ret_series)

    points = []
    twr, net_invested, last_dd = 1.0, values[s - 1], 0.0
    for i in range(s, n):
        r = rets.get(dates[i])
        if r is not None:
            twr *= 1 + r
            last_dd = float(dd.loc[pd.Timestamp(dates[i])])
        net_invested += flows[i]
        points.append(
            {
                "date": dates[i],
                "value": values[i],
                "cash": cash[i],
                "flow": flows[i],
                "net_invested": net_invested,
                "daily_return": r,
                "twr": twr - 1,
                "drawdown": last_dd,
            }
        )
    return {"points": points, "returns": ret_series, "base_index": s - 1}


def summarize(dates, values, flows, built) -> PerformanceSummary:
    s = built["base_index"]
    rets: pd.Series = built["returns"]
    start_value, end_value = values[s], values[-1]
    net_flows = sum(flows[s + 1 :])
    twr = cumulative_return(rets)
    span = (dates[-1] - dates[s]).days

    mwr = None
    if span >= 30:
        mwr = xirr(
            [(dates[s], -start_value)]
            + [(dates[i], -flows[i]) for i in range(s + 1, len(dates))]
            + [(dates[-1], end_value)]
        )
    vol = annualized_vol(rets, 252)
    dd = max_drawdown(rets) if len(rets) >= MIN_RETURNS else None
    sh = sharpe(rets, 0.0, 252) if len(rets) >= MIN_RETURNS else None
    return PerformanceSummary(
        start_value=start_value,
        end_value=end_value,
        net_flows=net_flows,
        gain=end_value - start_value - net_flows,
        twr=twr,
        twr_annualized=(1 + twr) ** (365 / span) - 1 if span >= 365 else None,
        mwr=mwr,
        volatility=vol,
        max_drawdown=dd.depth if dd else None,
        sharpe=sh.value if sh else None,
        best_day=DayReturn(date=rets.idxmax().date(), return_=float(rets.max())) if len(rets) else None,
        worst_day=DayReturn(date=rets.idxmin().date(), return_=float(rets.min())) if len(rets) else None,
    )


def _fee(settings, prefix: str, base: float) -> float:
    fixed = getattr(settings, f"{prefix}_fixed", None) or 0.0
    pct = getattr(settings, f"{prefix}_pct", None) or 0.0
    return -(fixed + pct / 100 * abs(base))


def account_breakdown(txns, positions, dates, flows, convert: Convert, settings, renamed=None) -> dict:
    """Per-account P&L parts in account currency. `settings` may be None.

    `renamed` maps a predecessor ticker to its successor so both share one tape.
    """
    renamed = renamed or {}
    sym = lambda s: renamed.get(s, s)  # noqa: E731
    unrealized = sum(
        (p.market_value_base or 0.0) - (p.cost_basis_base or 0.0)
        for p in positions
        if p.market_value_base is not None and p.cost_basis_base is not None
    )
    txns = sorted(txns, key=lambda t: t.date)
    fee_days = {(sym(t.symbol), t.date.date()) for t in txns if t.type == "fee"}

    realized = dividends = taxes = fees = fees_est = 0.0
    partial = False
    held: dict[str, tuple[float, float]] = {}  # symbol -> (quantity, invested)
    flow_idx: set[int] = set()  # snapshot indexes that carry a reported deposit/withdrawal row
    for t in txns:
        day = t.date.date()
        amt = _convert_or_raw(convert, t.amount, t.currency, day)
        if t.type in ("buy", "sell"):
            key = sym(t.symbol)
            qty, invested = held.get(key, (0.0, 0.0))
            tq, cash = abs(t.quantity or 0.0), abs(amt)
            if t.type == "buy":
                qty, invested = qty + tq, invested + cash
            else:
                sold = min(tq, qty)
                avg = invested / qty if qty else 0.0
                if tq - sold > 1e-9:
                    # Part of this sale predates the tape: leave its proceeds in fx_and_other.
                    partial = True
                    realized += cash * sold / tq - avg * sold
                else:
                    realized += cash - avg * sold
                qty, invested = qty - sold, max(invested - avg * sold, 0.0)
            held[key] = (qty, invested)
            # Open question: whether Freedom24's trade `amount` already includes commission.
            if settings and (key, day) not in fee_days:
                fees_est += _fee(settings, "commission", cash)
        elif t.type == "dividend":
            dividends += amt
        elif t.type == "tax":
            taxes += amt
        elif t.type == "fee":
            fees += amt
        elif t.type in FLOW_TYPES and settings and (not dates or day <= dates[-1]):
            flow_idx.add(bisect_left(dates, day))
            fees_est += _fee(settings, "deposit_fee" if amt > 0 else "withdrawal_fee", amt)
    if settings:
        # Inferred flow days have no rows, so charge once per day there.
        for i, f in enumerate(flows):
            if f and i not in flow_idx:
                fees_est += _fee(settings, "deposit_fee" if f > 0 else "withdrawal_fee", f)
    return {
        "unrealized": unrealized,
        "realized": realized,
        "dividends": dividends,
        "taxes": taxes,
        "fees": fees + fees_est,
        "fees_estimated": fees_est,
        "partial_history": partial,
    }


def build_breakdown(parts: list[dict], v_now: float, net_invested: float) -> PerformanceBreakdown:
    total = {k: sum(p[k] for p in parts) for k in ("unrealized", "realized", "dividends", "taxes", "fees", "fees_estimated")}
    total_gain = v_now - net_invested
    explained = sum(total[k] for k in ("unrealized", "realized", "dividends", "taxes", "fees"))
    return PerformanceBreakdown(
        **total,
        fx_and_other=total_gain - explained,
        total_gain=total_gain,
        net_invested=net_invested,
        partial_history=any(p.get("partial_history") for p in parts),
    )


# ---------------------------------------------------------------- loading


def _close_on(frame: Optional[pd.DataFrame], day: date) -> Optional[float]:
    if frame is None or frame.empty:
        return None
    closes = frame["close"].loc[: pd.Timestamp(day)]
    return float(closes.iloc[-1]) if len(closes) else None


class _MarketLookup:
    """Lazy, cached Yahoo closes. Any failure degrades to None, never raises."""

    def __init__(self, db: Session, start: date, end: date):
        self.db, self.start, self.end = db, start - timedelta(days=7), end
        self._frames: dict[str, Optional[pd.DataFrame]] = {}

    def frame(self, symbol: str) -> Optional[pd.DataFrame]:
        if symbol not in self._frames:
            try:
                self._frames[symbol] = get_price_history([symbol], self.start, self.end, db=self.db)[symbol]
            except Exception:
                logger.warning("market data unavailable for %s", symbol, exc_info=True)
                self._frames[symbol] = None
        return self._frames[symbol]

    def close(self, symbol: str, day: date) -> Optional[float]:
        return _close_on(self.frame(symbol), day)


def _make_convert(acct_ccy: str, positions, market: _MarketLookup) -> Convert:
    pos_rates = {p.currency.upper(): p.fx_rate for p in positions if p.currency and p.fx_rate}

    def fx(src, dst, day):
        # The day's own rate first; today's position rate only when there is no history.
        rate = market.close(f"{src}{dst}=X", day)
        if rate is None and src in pos_rates and dst == acct_ccy.upper():
            return pos_rates[src]
        return rate

    def coin_px(coin, day):
        return market.close(f"{coin}-USD", day)

    return lambda amount, currency, day: convert_amount(amount, currency, acct_ccy, day, fx, coin_px)


def _benchmark_series(market: _MarketLookup, symbol: str, base_day: date, days: list[date]) -> Optional[list[float]]:
    frame = market.frame(symbol)
    if frame is None or frame.empty:
        return None
    idx = pd.DatetimeIndex([pd.Timestamp(d) for d in [base_day] + days])
    closes = frame["close"]
    aligned = closes.reindex(closes.index.union(idx)).ffill().reindex(idx).bfill()
    base = aligned.iloc[0]
    if pd.isna(base) or base <= 0:
        return None
    return [float(v / base - 1) for v in aligned.iloc[1:]]


def compute_performance(
    db: Session,
    accounts: list[Account],
    start_date: Optional[date],
    end_date: Optional[date],
    benchmark: str = DEFAULT_BENCHMARK,
) -> PerformanceResponse:
    """All accounts must share one currency (the caller enforces it)."""
    if not accounts:
        return PerformanceResponse()
    ccy = accounts[0].currency or "USD"
    ids = [a.id for a in accounts]

    snap_rows = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.account_id.in_(ids))
        .order_by(PortfolioSnapshot.date)
        .all()
    )
    by_acct: dict[int, dict[date, PortfolioSnapshot]] = {i: {} for i in ids}
    for r in snap_rows:
        by_acct[r.account_id][r.date] = r
    common = sorted(set.intersection(*(set(m) for m in by_acct.values())))
    if len(common) < 2:
        return PerformanceResponse(currency=ccy)

    txns = db.query(InvestmentTransaction).filter(InvestmentTransaction.account_id.in_(ids)).all()
    positions = db.query(PortfolioPosition).filter(PortfolioPosition.account_id.in_(ids)).all()
    settings = {
        (s.provider): s
        for s in db.query(InvestmentProviderSettings)
        .filter(InvestmentProviderSettings.user_id == accounts[0].user_id)
        .all()
    }
    market = _MarketLookup(db, common[0], common[-1])

    n = len(common)
    values, cash, flows = [0.0] * n, [0.0] * n, [0.0] * n
    sources, net_invested, parts = set(), 0.0, []
    for a in accounts:
        a_pos = [p for p in positions if p.account_id == a.id]
        a_txns = [t for t in txns if t.account_id == a.id]
        convert = _make_convert(a.currency or ccy, a_pos, market)
        snaps = [(d, by_acct[a.id][d].total_value, by_acct[a.id][d].cash_balance or 0.0) for d in common]
        a_flows, source, net_ext = account_flows(snaps, a_txns, convert)
        sources.add(source)
        net_invested += net_ext
        for i in range(n):
            values[i] += snaps[i][1]
            cash[i] += snaps[i][2]
            flows[i] += a_flows[i]
        renamed = renamed_symbol_map(db, a_pos)
        parts.append(account_breakdown(a_txns, a_pos, common, a_flows, convert, settings.get(a.provider), renamed))

    breakdown = build_breakdown(parts, values[-1], net_invested)
    flows_source = sources.pop() if len(sources) == 1 else "mixed"

    # One leading day is the base so the start day's own move is part of the return.
    lo = max(bisect_left(common, start_date) - 1, 0) if start_date else 0
    hi = n if not end_date else sum(1 for d in common if d <= end_date)
    dates, v, c, f = common[lo:hi], values[lo:hi], cash[lo:hi], flows[lo:hi]
    built = build_series(dates, v, c, f) if len(dates) >= 2 else None
    if built is None:
        return PerformanceResponse(currency=ccy, flows_source=flows_source, breakdown=breakdown)

    points = built["points"]
    bench = None
    bench_resp = None
    if benchmark:
        bench = _benchmark_series(market, benchmark, dates[built["base_index"]], [p["date"] for p in points])
        if bench is not None:
            bench_resp = PerformanceBenchmark(symbol=benchmark, twr=bench[-1])
    return PerformanceResponse(
        currency=ccy,
        start_date=points[0]["date"],
        end_date=points[-1]["date"],
        flows_source=flows_source,
        series=[
            PerformancePoint(**p, benchmark=bench[i] if bench else None) for i, p in enumerate(points)
        ],
        summary=summarize(dates, v, f, built),
        breakdown=breakdown,
        benchmark=bench_resp,
    )
