"""Backtest / forward-scenario simulation engine.

Pure computation over price frames handed to it — no DB writes, no HTTP. The scenario
service owns persistence and I/O (fetching prices, dividends, FX). See
docs/investments/02-backtesting-sandbox.md Part 2 for the spec this implements, and
docs/investments/00-research-foundations.md Part C for the underlying formulas.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import brentq

from app.services.analytics.returns import (
    DrawdownStats,
    annualized_vol,
    cagr,
    max_drawdown,
    rolling_window_returns,
    simple_returns,
    ulcer_index,
)
from app.services.analytics.relation import market_model
from app.services.analytics.risk import (
    SharpeResult,
    calmar,
    deflated_sharpe,
    distribution_stats,
    probabilistic_sharpe,
    sharpe,
    sortino,
)

_EULER_MASCHERONI = 0.5772156649
CONTRIBUTION_FREQUENCIES = ("none", "weekly", "monthly", "quarterly")
DIVIDEND_TREATMENTS = ("reinvest", "cash", "ignore")


class ScenarioValidationError(Exception):
    """A user-facing validation problem. The router maps this to HTTP 422."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ScenarioSymbolError(Exception):
    """A user-facing 404: the symbol has no price history at all."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class ScenarioSpec:
    symbol: str
    start_date: date
    end_date: Optional[date]  # None = "to today" (backtest) or "ongoing" (forward)
    initial_amount: float
    currency: str = "EUR"
    contribution_amount: float = 0.0
    contribution_freq: str = "none"  # none|weekly|monthly|quarterly
    benchmark: Optional[str] = "^GSPC"
    cost_bps: float = 10.0
    cost_flat: float = 0.0
    dividend_treatment: str = "reinvest"  # reinvest|cash|ignore
    dividend_withholding_pct: float = 0.0
    kind: str = "backtest"  # backtest|forward
    max_contributions: int = 600


# ---------------------------------------------------------------------------
# Result shapes
# ---------------------------------------------------------------------------


@dataclass
class SpecResolved:
    resolved_start: date
    resolved_end: date
    start_note: Optional[str]
    end_note: Optional[str]
    trading_days: int
    fx_applied: bool
    data_gaps: list[dict]
    stale_data: bool
    period_too_short: bool


@dataclass
class LegResult:
    final_value: float
    total_invested: float
    profit: float
    total_return_pct: Optional[float]
    twr_cagr: Optional[float]
    mwr_irr: Optional[float]
    annualized_vol: Optional[float]
    sharpe: Optional[SharpeResult]
    sortino: Optional[float]
    calmar: Optional[float]
    max_drawdown: Optional[DrawdownStats]
    best_month: Optional[float]
    worst_month: Optional[float]
    cumulative_costs: float
    dividends_received: float
    hypothetical_exit_cost: float
    unit_value: pd.Series = field(repr=False)
    value: pd.Series = field(repr=False)
    invested: pd.Series = field(repr=False)


@dataclass
class Comparison:
    excess_return_pct: Optional[float]
    excess_cagr: Optional[float]
    beat_benchmark: Optional[bool]
    rolling_1y_win_rate: Optional[float]
    worst_rolling_1y: Optional[float]
    alpha_annual: Optional[float]
    beta: Optional[float]
    r_squared: Optional[float]


@dataclass
class SensitivityResult:
    entry_dates: list[dict]
    min: float
    p25: float
    median: float
    p75: float
    max: float
    chosen_percentile: float


@dataclass
class DeflatedResult:
    n_trials: int
    expected_max_sharpe: Optional[float]
    sharpe: Optional[float]
    dsr: Optional[float]


@dataclass
class CostBlock:
    cumulative: float
    pct_of_final_value: Optional[float]
    series: list[dict]


@dataclass
class BacktestResult:
    spec_resolved: SpecResolved
    scenario: LegResult
    benchmark: Optional[LegResult]
    comparison: Optional[Comparison]
    sensitivity: Optional[SensitivityResult]
    deflated: Optional[DeflatedResult]
    costs: CostBlock


# ---------------------------------------------------------------------------
# Trading-day resolution
# ---------------------------------------------------------------------------


def _resolve_forward(idx: pd.DatetimeIndex, target: date) -> Optional[pd.Timestamp]:
    """First trading day on or after `target`."""
    pos = idx.searchsorted(pd.Timestamp(target), side="left")
    if pos >= len(idx):
        return None
    return idx[pos]


def _resolve_backward(idx: pd.DatetimeIndex, target: date) -> Optional[pd.Timestamp]:
    """Last trading day on or before `target`."""
    pos = idx.searchsorted(pd.Timestamp(target), side="right") - 1
    if pos < 0:
        return None
    return idx[pos]


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _nominal_contribution_dates(start: date, end: date, freq: str) -> list[date]:
    """Nominal (calendar) contribution dates, one interval after `start`, up to `end`."""
    if freq == "none":
        return []
    dates: list[date] = []
    if freq == "weekly":
        d = start + timedelta(weeks=1)
        while d <= end:
            dates.append(d)
            d += timedelta(weeks=1)
    elif freq in ("monthly", "quarterly"):
        step = 1 if freq == "monthly" else 3
        d = _add_months(start, step)
        while d <= end:
            dates.append(d)
            d = _add_months(d, step)
    else:
        raise ScenarioValidationError(f"Unknown contribution frequency: {freq}")
    return dates


def _resolve_contribution_schedule(
    nominal_dates: list[date], amount: float, idx: pd.DatetimeIndex, end_ts: pd.Timestamp
) -> dict[pd.Timestamp, float]:
    """Resolve nominal dates onto trading days, summing collisions (Part 2.2 rule 4)."""
    schedule: dict[pd.Timestamp, float] = {}
    for nominal in nominal_dates:
        resolved = _resolve_forward(idx, nominal)
        if resolved is None or resolved > end_ts:
            continue
        schedule[resolved] = schedule.get(resolved, 0.0) + amount
    return schedule


# ---------------------------------------------------------------------------
# Leg simulation
# ---------------------------------------------------------------------------


@dataclass
class _RawLeg:
    value: pd.Series
    invested: pd.Series
    unit_value: pd.Series
    cash_from_dividends: pd.Series
    costs: pd.Series
    cashflows: list[tuple[pd.Timestamp, float]]
    total_invested: float
    dividends_received: float
    cumulative_costs: float
    final_value: float
    hypothetical_exit_cost: float


def _simulate_leg(
    price: pd.Series,
    *,
    initial_amount: float,
    contribution_schedule: dict[pd.Timestamp, float],
    start: pd.Timestamp,
    end: pd.Timestamp,
    cost_bps: float,
    cost_flat: float,
    dividends_per_share: Optional[pd.Series],
    charge_exit_fee: bool,
) -> _RawLeg:
    window = price.loc[start:end]
    idx = window.index

    events: dict[pd.Timestamp, float] = dict(contribution_schedule)
    events[start] = events.get(start, 0.0) + initial_amount

    shares = 0.0
    cash_in = 0.0
    cumulative_costs = 0.0
    cash_from_dividends = 0.0
    dividends_received = 0.0
    units = 0.0
    prev_unit_value = 100.0

    value_s = pd.Series(0.0, index=idx)
    invested_s = pd.Series(0.0, index=idx)
    unit_value_s = pd.Series(100.0, index=idx)
    costs_s = pd.Series(0.0, index=idx)
    cashflows: list[tuple[pd.Timestamp, float]] = []

    for t in idx:
        px = float(window.loc[t])
        gross = events.get(t, 0.0)
        net_contribution = 0.0
        if gross:
            fee = gross * cost_bps / 10_000 + cost_flat
            net = gross - fee
            shares += net / px
            cash_in += gross
            cumulative_costs += fee
            cashflows.append((t, -gross))
            net_contribution = net

        if dividends_per_share is not None and t in dividends_per_share.index:
            dps = float(dividends_per_share.loc[t])
            if dps:
                paid = shares * dps
                cash_from_dividends += paid
                dividends_received += paid

        portfolio_value = shares * px + cash_from_dividends

        if units == 0.0:
            units = net_contribution / 100.0 if net_contribution > 0 else 0.0
            unit_value = 100.0 if units > 0 else prev_unit_value
        else:
            units += net_contribution / prev_unit_value
            unit_value = portfolio_value / units if units > 0 else prev_unit_value

        value_s.loc[t] = portfolio_value
        invested_s.loc[t] = cash_in
        unit_value_s.loc[t] = unit_value
        costs_s.loc[t] = cumulative_costs
        prev_unit_value = unit_value

    final_value = float(value_s.iloc[-1]) if len(value_s) else 0.0
    hypothetical_exit_cost = final_value * cost_bps / 10_000 + cost_flat
    exit_cashflow = final_value - hypothetical_exit_cost if charge_exit_fee else final_value
    cashflows.append((end, exit_cashflow))

    return _RawLeg(
        value=value_s,
        invested=invested_s,
        unit_value=unit_value_s,
        cash_from_dividends=pd.Series(cash_from_dividends, index=[end]),
        costs=costs_s,
        cashflows=cashflows,
        total_invested=cash_in,
        dividends_received=dividends_received,
        cumulative_costs=cumulative_costs,
        final_value=final_value,
        hypothetical_exit_cost=hypothetical_exit_cost,
    )


def _irr(cashflows: list[tuple[pd.Timestamp, float]]) -> Optional[float]:
    """C.16: money-weighted return via brentq on the NPV of dated cashflows."""
    if len(cashflows) < 2:
        return None
    t0 = cashflows[0][0]

    def npv(rate: float) -> float:
        total = 0.0
        for t, cf in cashflows:
            years = (t - t0).days / 365.25
            total += cf / (1 + rate) ** years
        return total

    lo, hi = -0.9999, 10.0
    try:
        if npv(lo) * npv(hi) > 0:
            return None
        return float(brentq(npv, lo, hi))
    except (ValueError, ZeroDivisionError, OverflowError):
        return None


def _monthly_returns(unit_value: pd.Series) -> pd.Series:
    if len(unit_value) == 0:
        return pd.Series(dtype=float)
    monthly = unit_value.groupby(unit_value.index.to_period("M")).last()
    return monthly.pct_change().dropna()


def _build_leg_result(
    raw: _RawLeg,
    *,
    annualization_factor: int,
    risk_free_periodic: float,
) -> LegResult:
    returns = simple_returns(raw.unit_value)
    total_return_pct = (
        raw.final_value / raw.total_invested - 1 if raw.total_invested > 0 else None
    )
    twr_cagr_val = cagr(raw.unit_value)
    mwr = _irr(raw.cashflows)
    vol = annualized_vol(returns, annualization_factor)
    sharpe_res = sharpe(returns, risk_free_periodic, annualization_factor)
    sortino_val = sortino(returns, 0.0, annualization_factor)
    dd = max_drawdown(returns)
    calmar_val = calmar(twr_cagr_val, dd.depth if dd else None)
    monthly = _monthly_returns(raw.unit_value)
    best_month = float(monthly.max()) if len(monthly) else None
    worst_month = float(monthly.min()) if len(monthly) else None

    return LegResult(
        final_value=raw.final_value,
        total_invested=raw.total_invested,
        profit=raw.final_value - raw.total_invested,
        total_return_pct=total_return_pct,
        twr_cagr=twr_cagr_val,
        mwr_irr=mwr,
        annualized_vol=vol,
        sharpe=sharpe_res,
        sortino=sortino_val,
        calmar=calmar_val,
        max_drawdown=dd,
        best_month=best_month,
        worst_month=worst_month,
        cumulative_costs=raw.cumulative_costs,
        dividends_received=raw.dividends_received,
        hypothetical_exit_cost=raw.hypothetical_exit_cost,
        unit_value=raw.unit_value,
        value=raw.value,
        invested=raw.invested,
    )


# ---------------------------------------------------------------------------
# Gap detection
# ---------------------------------------------------------------------------


def _detect_gaps(idx: pd.DatetimeIndex, threshold_days: int = 14) -> list[dict]:
    gaps: list[dict] = []
    for i in range(1, len(idx)):
        delta = (idx[i] - idx[i - 1]).days
        if delta > threshold_days:
            gaps.append(
                {
                    "start": idx[i - 1].date().isoformat(),
                    "end": idx[i].date().isoformat(),
                    "days": delta,
                }
            )
    return gaps


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def run_backtest(
    spec: ScenarioSpec,
    price_frame: pd.DataFrame,
    benchmark_frame: Optional[pd.DataFrame] = None,
    *,
    dividends: Optional[pd.Series] = None,
    risk_free_annual: float = 0.02,
    annualization_factor: int = 252,
    benchmark_annualization_factor: int = 252,
    n_trials: int = 1,
    fx_applied: bool = False,
    today: Optional[date] = None,
) -> BacktestResult:
    """Run one scenario simulation. `price_frame`/`benchmark_frame` must have a `close`
    column, ascending DatetimeIndex, already resolved to the correct dividend treatment
    (adjusted closes for `reinvest`, raw closes otherwise) and currency.
    """
    if spec.contribution_freq not in CONTRIBUTION_FREQUENCIES:
        raise ScenarioValidationError(f"Unknown contribution frequency: {spec.contribution_freq}")
    if spec.dividend_treatment not in DIVIDEND_TREATMENTS:
        raise ScenarioValidationError(f"Unknown dividend treatment: {spec.dividend_treatment}")
    if spec.initial_amount <= 0 and spec.contribution_amount <= 0:
        raise ScenarioValidationError("Enter an initial amount or a recurring contribution.")

    today = today or date.today()
    if spec.start_date > today:
        raise ScenarioValidationError(
            "Start date is in the future — create a forward scenario instead."
        )
    if spec.end_date is not None and spec.start_date >= spec.end_date:
        raise ScenarioValidationError("Start date must be before end date.")

    if price_frame is None or len(price_frame) == 0:
        raise ScenarioSymbolError(f"No price history available for {spec.symbol}")

    idx = price_frame.index
    first_bar_date = idx[0].date()
    if spec.start_date < first_bar_date:
        raise ScenarioValidationError(
            f"{spec.symbol} price history starts on {first_bar_date.isoformat()}"
        )

    resolved_start_ts = _resolve_forward(idx, spec.start_date)
    if resolved_start_ts is None:
        raise ScenarioValidationError(f"No trading days available for {spec.symbol} on or after {spec.start_date.isoformat()}")
    start_note = None
    if resolved_start_ts.date() != spec.start_date:
        start_note = (
            f"{spec.start_date.isoformat()} was not a trading day; used the next "
            f"trading day, {resolved_start_ts.date().isoformat()}."
        )

    stale_data = False
    if spec.end_date is not None:
        resolved_end_ts = _resolve_backward(idx, spec.end_date)
        if resolved_end_ts is None or resolved_end_ts < resolved_start_ts:
            raise ScenarioValidationError("No trading days available in the requested window.")
        end_note = None
        if resolved_end_ts.date() != spec.end_date:
            end_note = (
                f"{spec.end_date.isoformat()} was not a trading day; used the prior "
                f"trading day, {resolved_end_ts.date().isoformat()}."
            )
    else:
        resolved_end_ts = idx[-1]
        end_note = None
        stale_data = (today - resolved_end_ts.date()).days > 4

    window_idx = idx[(idx >= resolved_start_ts) & (idx <= resolved_end_ts)]
    trading_days = len(window_idx)
    period_too_short = (resolved_end_ts - resolved_start_ts).days < 30
    data_gaps = _detect_gaps(window_idx)

    nominal_dates: list[date] = []
    if spec.contribution_amount > 0 and spec.contribution_freq != "none":
        nominal_dates = _nominal_contribution_dates(
            spec.start_date, resolved_end_ts.date(), spec.contribution_freq
        )
        if len(nominal_dates) > spec.max_contributions:
            raise ScenarioValidationError(
                f"That contribution schedule produces {len(nominal_dates)} events, "
                f"above the {spec.max_contributions} cap."
            )

    contribution_schedule = _resolve_contribution_schedule(
        nominal_dates, spec.contribution_amount, idx, resolved_end_ts
    )

    price_series = price_frame["close"]
    is_exit = spec.kind == "backtest" and spec.end_date is not None

    scenario_raw = _simulate_leg(
        price_series,
        initial_amount=spec.initial_amount,
        contribution_schedule=contribution_schedule,
        start=resolved_start_ts,
        end=resolved_end_ts,
        cost_bps=spec.cost_bps,
        cost_flat=spec.cost_flat,
        dividends_per_share=dividends if spec.dividend_treatment == "cash" else None,
        charge_exit_fee=is_exit,
    )

    rf_periodic = (1 + risk_free_annual) ** (1 / annualization_factor) - 1
    scenario_result = _build_leg_result(
        scenario_raw, annualization_factor=annualization_factor, risk_free_periodic=rf_periodic
    )

    benchmark_result: Optional[LegResult] = None
    comparison: Optional[Comparison] = None
    if benchmark_frame is not None and len(benchmark_frame) > 0:
        b_idx = benchmark_frame.index
        b_start = _resolve_forward(b_idx, spec.start_date) or b_idx[0]
        if spec.end_date is not None:
            b_end = _resolve_backward(b_idx, spec.end_date) or b_idx[-1]
        else:
            b_end = b_idx[-1]
        b_nominal = nominal_dates
        b_schedule = _resolve_contribution_schedule(
            b_nominal, spec.contribution_amount, b_idx, b_end
        )
        bench_raw = _simulate_leg(
            benchmark_frame["close"],
            initial_amount=spec.initial_amount,
            contribution_schedule=b_schedule,
            start=b_start,
            end=b_end,
            cost_bps=spec.cost_bps,
            cost_flat=spec.cost_flat,
            dividends_per_share=None,
            charge_exit_fee=is_exit,
        )
        b_rf_periodic = (1 + risk_free_annual) ** (1 / benchmark_annualization_factor) - 1
        benchmark_result = _build_leg_result(
            bench_raw,
            annualization_factor=benchmark_annualization_factor,
            risk_free_periodic=b_rf_periodic,
        )
        comparison = _build_comparison(
            scenario_result, benchmark_result, annualization_factor
        )

    sensitivity = None
    if spec.kind == "backtest":
        sensitivity = _entry_sensitivity(
            spec,
            price_series,
            idx,
            resolved_start_ts,
            resolved_end_ts,
            contribution_amount=spec.contribution_amount,
            contribution_freq=spec.contribution_freq,
            is_exit=is_exit,
            chosen_final_value=scenario_result.final_value,
        )

    deflated = None
    if n_trials >= 5:
        deflated = _deflated_sharpe_block(scenario_raw.unit_value, annualization_factor, n_trials)

    costs = CostBlock(
        cumulative=scenario_raw.cumulative_costs,
        pct_of_final_value=(
            scenario_raw.cumulative_costs / scenario_result.final_value
            if scenario_result.final_value
            else None
        ),
        series=_downsample_series(scenario_raw.costs, "cumulative"),
    )

    spec_resolved = SpecResolved(
        resolved_start=resolved_start_ts.date(),
        resolved_end=resolved_end_ts.date(),
        start_note=start_note,
        end_note=end_note,
        trading_days=trading_days,
        fx_applied=fx_applied,
        data_gaps=data_gaps,
        stale_data=stale_data,
        period_too_short=period_too_short,
    )

    return BacktestResult(
        spec_resolved=spec_resolved,
        scenario=scenario_result,
        benchmark=benchmark_result,
        comparison=comparison,
        sensitivity=sensitivity,
        deflated=deflated,
        costs=costs,
    )


def _build_comparison(
    scenario: LegResult, benchmark: LegResult, annualization_factor: int
) -> Comparison:
    excess_return_pct = None
    if scenario.total_return_pct is not None and benchmark.total_return_pct is not None:
        excess_return_pct = scenario.total_return_pct - benchmark.total_return_pct
    excess_cagr = None
    if scenario.twr_cagr is not None and benchmark.twr_cagr is not None:
        excess_cagr = scenario.twr_cagr - benchmark.twr_cagr
    beat_benchmark = excess_return_pct > 0 if excess_return_pct is not None else None

    rolling_win_rate = None
    worst_rolling_1y = None
    scenario_roll = rolling_window_returns(scenario.unit_value, months=12)
    bench_roll = rolling_window_returns(benchmark.unit_value, months=12)
    if len(scenario_roll) > 0 and len(bench_roll) > 0:
        aligned = pd.concat({"a": scenario_roll, "b": bench_roll}, axis=1, join="inner").dropna()
        if len(aligned) > 0:
            rolling_win_rate = float((aligned["a"] > aligned["b"]).mean())
            worst_rolling_1y = float(aligned["a"].min())

    alpha_annual = beta = r_squared = None
    a_returns = simple_returns(scenario.unit_value)
    b_returns = simple_returns(benchmark.unit_value)
    aligned_r = pd.concat({"a": a_returns, "b": b_returns}, axis=1, join="inner").dropna()
    if len(aligned_r) >= 30:
        model = market_model(aligned_r["a"], aligned_r["b"], annualization_factor)
        if model is not None:
            alpha_annual = model.alpha_annual
            beta = model.beta
            r_squared = model.r_squared

    return Comparison(
        excess_return_pct=excess_return_pct,
        excess_cagr=excess_cagr,
        beat_benchmark=beat_benchmark,
        rolling_1y_win_rate=rolling_win_rate,
        worst_rolling_1y=worst_rolling_1y,
        alpha_annual=alpha_annual,
        beta=beta,
        r_squared=r_squared,
    )


def _entry_sensitivity(
    spec: ScenarioSpec,
    price_series: pd.Series,
    idx: pd.DatetimeIndex,
    resolved_start_ts: pd.Timestamp,
    resolved_end_ts: pd.Timestamp,
    *,
    contribution_amount: float,
    contribution_freq: str,
    is_exit: bool,
    chosen_final_value: float,
) -> Optional[SensitivityResult]:
    offsets = [-30, -21, -14, -7, 0, 7, 14, 21, 30]
    entries: list[dict] = []
    final_values: list[float] = []
    first_bar_date = idx[0].date()

    for offset in offsets:
        candidate_date = spec.start_date + timedelta(days=offset)
        if candidate_date < first_bar_date or candidate_date > resolved_end_ts.date():
            continue
        candidate_start = _resolve_forward(idx, candidate_date)
        if candidate_start is None or candidate_start > resolved_end_ts:
            continue
        nominal = _nominal_contribution_dates(
            candidate_start.date(), resolved_end_ts.date(), contribution_freq
        ) if contribution_amount > 0 and contribution_freq != "none" else []
        schedule = _resolve_contribution_schedule(nominal, contribution_amount, idx, resolved_end_ts)
        raw = _simulate_leg(
            price_series,
            initial_amount=spec.initial_amount,
            contribution_schedule=schedule,
            start=candidate_start,
            end=resolved_end_ts,
            cost_bps=spec.cost_bps,
            cost_flat=spec.cost_flat,
            dividends_per_share=None,
            charge_exit_fee=is_exit,
        )
        return_pct = (
            raw.final_value / raw.total_invested - 1 if raw.total_invested > 0 else None
        )
        entries.append(
            {
                "date": candidate_date.isoformat(),
                "final_value": raw.final_value,
                "return_pct": return_pct,
            }
        )
        final_values.append(raw.final_value)

    if len(final_values) < 2:
        return None

    arr = np.array(final_values)
    chosen_percentile = float(stats.percentileofscore(arr, chosen_final_value, kind="mean"))

    return SensitivityResult(
        entry_dates=entries,
        min=float(arr.min()),
        p25=float(np.percentile(arr, 25)),
        median=float(np.median(arr)),
        p75=float(np.percentile(arr, 75)),
        max=float(arr.max()),
        chosen_percentile=chosen_percentile,
    )


def _deflated_sharpe_block(
    unit_value: pd.Series, annualization_factor: int, n_trials: int
) -> Optional[DeflatedResult]:
    returns = simple_returns(unit_value)
    n = len(returns)
    if n < 60:
        return None
    std = returns.std(ddof=1)
    if std == 0 or np.isnan(std):
        return None
    sr_periodic = float(returns.mean() / std)
    dist = distribution_stats(returns)
    if dist is None:
        return None
    dsr = deflated_sharpe(sr_periodic, n, dist.skew, dist.kurtosis, n_trials)
    variance = (1 + sr_periodic**2 / 2) / n
    s0 = np.sqrt(variance) * (
        (1 - _EULER_MASCHERONI) * stats.norm.ppf(1 - 1 / n_trials)
        + _EULER_MASCHERONI * stats.norm.ppf(1 - 1 / (n_trials * np.e))
    )
    a = annualization_factor
    return DeflatedResult(
        n_trials=n_trials,
        expected_max_sharpe=float(s0 * np.sqrt(a)),
        sharpe=float(sr_periodic * np.sqrt(a)),
        dsr=dsr,
    )


def _downsample_series(series: pd.Series, value_key: str, agg: str = "last") -> list[dict]:
    if len(series) == 0:
        return []
    if len(series) > 2600:
        grouped = series.groupby(series.index.to_period("M"))
        out = grouped.min() if agg == "min" else grouped.last()
        out.index = out.index.to_timestamp()
    elif len(series) > 750:
        out = series.resample("W").min() if agg == "min" else series.resample("W").last()
    else:
        out = series
    return [
        {"date": d.date().isoformat() if hasattr(d, "date") else str(d), value_key: float(v)}
        for d, v in out.dropna().items()
    ]
