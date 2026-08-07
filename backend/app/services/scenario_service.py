"""CRUD, live recomputation, nightly valuation and track-record aggregation for the
backtesting / forward sandbox. Orchestrates I/O (price fetch, FX, persistence) around the
pure `app.services.backtest_service` engine.

Contract: docs/investments/02-backtesting-sandbox.md Part 3-4.
"""

import logging
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from scipy.stats import binomtest
from sqlalchemy.orm import Session

from app.config import settings
from app.models.scenario import Scenario, ScenarioValuation
from app.models.user import User
from app.services.analytics.returns import DrawdownStats
from app.services.analytics.risk import SharpeResult
from app.services.backtest_service import (
    BacktestResult,
    LegResult,
    ScenarioSpec,
    ScenarioSymbolError,
    ScenarioValidationError,
    run_backtest,
)
from app.services.market_data import get_price_history, get_risk_free_rate, get_symbol_meta, periods_per_year, to_currency
from app.services.market_data.errors import MarketDataUnavailable, SymbolNotFound

logger = logging.getLogger("app")

SENSITIVITY_BUFFER_DAYS = 35


class ScenarioNotFoundError(Exception):
    def __init__(self, scenario_id: int):
        self.scenario_id = scenario_id
        super().__init__(f"Scenario {scenario_id} not found")


# ---------------------------------------------------------------------------
# Spec <-> ORM
# ---------------------------------------------------------------------------


def _to_spec(data, *, max_contributions: Optional[int] = None) -> ScenarioSpec:
    return ScenarioSpec(
        symbol=data.symbol.strip().upper(),
        start_date=data.start_date,
        end_date=data.end_date,
        initial_amount=data.initial_amount,
        currency=data.currency.upper(),
        contribution_amount=data.contribution_amount,
        contribution_freq=data.contribution_freq,
        benchmark=(data.benchmark.strip().upper() if data.benchmark else None),
        cost_bps=data.cost_bps,
        cost_flat=data.cost_flat,
        dividend_treatment=data.dividend_treatment,
        dividend_withholding_pct=data.dividend_withholding_pct,
        kind=data.kind,
        max_contributions=max_contributions or settings.SCENARIO_MAX_CONTRIBUTIONS,
    )


def _spec_from_row(row: Scenario) -> ScenarioSpec:
    return ScenarioSpec(
        symbol=row.symbol,
        start_date=row.start_date,
        end_date=row.end_date,
        initial_amount=row.initial_amount,
        currency=row.currency,
        contribution_amount=row.contribution_amount or 0.0,
        contribution_freq=row.contribution_freq or "none",
        benchmark=row.benchmark,
        cost_bps=row.cost_bps or 0.0,
        cost_flat=row.cost_flat or 0.0,
        dividend_treatment=row.dividend_treatment or "reinvest",
        dividend_withholding_pct=row.dividend_withholding_pct or 0.0,
        kind=row.kind,
        max_contributions=settings.SCENARIO_MAX_CONTRIBUTIONS,
    )


# ---------------------------------------------------------------------------
# Price fetch / FX
# ---------------------------------------------------------------------------


def _fetch_frames(db: Session, spec: ScenarioSpec, *, today: date):
    fetch_start = spec.start_date - timedelta(days=SENSITIVITY_BUFFER_DAYS)
    fetch_end = spec.end_date or today
    symbols = [spec.symbol]
    if spec.benchmark:
        symbols.append(spec.benchmark)

    history = get_price_history(symbols, fetch_start, fetch_end, db=db)

    meta = get_symbol_meta(db, spec.symbol)
    price_frame = history[spec.symbol][["close"]].sort_index()
    native_ccy = (meta.currency or spec.currency).upper()
    fx_applied = False
    if native_ccy != spec.currency:
        price_frame, fx_applied = to_currency(price_frame, native_ccy, spec.currency, db)

    benchmark_frame = None
    bench_meta = None
    if spec.benchmark:
        bench_meta = get_symbol_meta(db, spec.benchmark)
        benchmark_frame = history[spec.benchmark][["close"]].sort_index()
        bench_ccy = (bench_meta.currency or spec.currency).upper()
        if bench_ccy != spec.currency:
            benchmark_frame, _ = to_currency(benchmark_frame, bench_ccy, spec.currency, db)

    a = periods_per_year(meta.quote_type)
    b_a = periods_per_year(bench_meta.quote_type) if bench_meta is not None else a
    return price_frame, benchmark_frame, a, b_a, fx_applied


def _risk_free_annual(db: Session, spec: ScenarioSpec, today: date) -> float:
    start = spec.start_date - timedelta(days=SENSITIVITY_BUFFER_DAYS)
    end = spec.end_date or today
    try:
        series, _source = get_risk_free_rate(db, start, end)
        if len(series):
            return float(series.iloc[-1])
    except Exception:  # noqa: BLE001
        logger.warning("risk-free rate fetch failed; using configured fallback", exc_info=True)
    return settings.ANALYTICS_RISK_FREE_ANNUAL


# ---------------------------------------------------------------------------
# Serialization (dataclasses -> plain dicts, matching app.schemas.scenario)
# ---------------------------------------------------------------------------


def _sharpe_dict(s: Optional[SharpeResult]) -> Optional[dict]:
    if s is None:
        return None
    return {"value": s.value, "ci_low": s.ci_low, "ci_high": s.ci_high, "n": s.n}


def _dd_dict(dd: Optional[DrawdownStats]) -> Optional[dict]:
    if dd is None:
        return None

    def _d(x):
        return x.date() if hasattr(x, "date") else x

    return {
        "depth": dd.depth,
        "peak_date": _d(dd.peak_date),
        "trough_date": _d(dd.trough_date),
        "recovery_date": _d(dd.recovery_date) if dd.recovery_date is not None else None,
        "days_under_water": dd.days_under_water,
    }


def _leg_dict(leg: Optional[LegResult]) -> Optional[dict]:
    if leg is None:
        return None
    return {
        "final_value": leg.final_value,
        "total_invested": leg.total_invested,
        "profit": leg.profit,
        "total_return_pct": leg.total_return_pct,
        "twr_cagr": leg.twr_cagr,
        "mwr_irr": leg.mwr_irr,
        "annualized_vol": leg.annualized_vol,
        "sharpe": _sharpe_dict(leg.sharpe),
        "sortino": leg.sortino,
        "calmar": leg.calmar,
        "max_drawdown": _dd_dict(leg.max_drawdown),
        "best_month": leg.best_month,
        "worst_month": leg.worst_month,
        "cumulative_costs": leg.cumulative_costs,
        "dividends_received": leg.dividends_received,
        "hypothetical_exit_cost": leg.hypothetical_exit_cost,
    }


def _combine_and_downsample(result: BacktestResult) -> list[dict]:
    scenario = result.scenario
    idx = scenario.value.index
    if len(idx) == 0:
        return []
    dd = scenario.unit_value / scenario.unit_value.cummax() - 1
    df = pd.DataFrame({"value": scenario.value, "invested": scenario.invested, "drawdown": dd})
    if result.benchmark is not None:
        df["benchmark_value"] = result.benchmark.value.reindex(idx).ffill()

    n = len(df)
    if n > 2600:
        freq = "ME"
    elif n > 750:
        freq = "W"
    else:
        freq = None
    if freq:
        agg = {"value": "last", "invested": "last", "drawdown": "min"}
        if "benchmark_value" in df.columns:
            agg["benchmark_value"] = "last"
        df = df.resample(freq).agg(agg).dropna(subset=["value"])

    out = []
    for d, row in df.iterrows():
        point = {
            "date": (d.date() if hasattr(d, "date") else d).isoformat(),
            "value": float(row["value"]),
            "invested": float(row["invested"]),
            "drawdown": float(row["drawdown"]) if pd.notna(row.get("drawdown")) else None,
        }
        if "benchmark_value" in row.index and pd.notna(row["benchmark_value"]):
            point["benchmark_value"] = float(row["benchmark_value"])
        out.append(point)
    return out


def _serialize(result: BacktestResult) -> dict:
    sr = result.spec_resolved
    return {
        "spec_resolved": {
            "resolved_start": sr.resolved_start,
            "resolved_end": sr.resolved_end,
            "start_note": sr.start_note,
            "end_note": sr.end_note,
            "trading_days": sr.trading_days,
            "fx_applied": sr.fx_applied,
            "data_gaps": sr.data_gaps,
            "stale_data": sr.stale_data,
            "period_too_short": sr.period_too_short,
        },
        "scenario": _leg_dict(result.scenario),
        "benchmark": _leg_dict(result.benchmark),
        "comparison": (
            {
                "excess_return_pct": result.comparison.excess_return_pct,
                "excess_cagr": result.comparison.excess_cagr,
                "beat_benchmark": result.comparison.beat_benchmark,
                "rolling_1y_win_rate": result.comparison.rolling_1y_win_rate,
                "worst_rolling_1y": result.comparison.worst_rolling_1y,
                "alpha_annual": result.comparison.alpha_annual,
                "beta": result.comparison.beta,
                "r_squared": result.comparison.r_squared,
            }
            if result.comparison
            else None
        ),
        "sensitivity": (
            {
                "entry_dates": result.sensitivity.entry_dates,
                "min": result.sensitivity.min,
                "p25": result.sensitivity.p25,
                "median": result.sensitivity.median,
                "p75": result.sensitivity.p75,
                "max": result.sensitivity.max,
                "chosen_percentile": result.sensitivity.chosen_percentile,
            }
            if result.sensitivity
            else None
        ),
        "deflated": (
            {
                "n_trials": result.deflated.n_trials,
                "expected_max_sharpe": result.deflated.expected_max_sharpe,
                "sharpe": result.deflated.sharpe,
                "dsr": result.deflated.dsr,
            }
            if result.deflated
            else None
        ),
        "costs": {
            "cumulative": result.costs.cumulative,
            "pct_of_final_value": result.costs.pct_of_final_value,
            "series": result.costs.series,
        },
        "series": _combine_and_downsample(result),
    }


# ---------------------------------------------------------------------------
# Core run (shared by preview / create / detail)
# ---------------------------------------------------------------------------


def _run(db: Session, user: User, spec: ScenarioSpec, *, n_trials_override: Optional[int] = None) -> dict:
    today = date.today()
    try:
        price_frame, benchmark_frame, a, b_a, fx_applied = _fetch_frames(db, spec, today=today)
    except SymbolNotFound as exc:
        raise ScenarioSymbolError(f"Unknown symbol: {exc.symbol}") from exc

    risk_free_annual = _risk_free_annual(db, spec, today)
    n_trials = n_trials_override
    if n_trials is None:
        n_trials = (
            db.query(Scenario)
            .filter(Scenario.user_id == user.id, Scenario.kind == "backtest")
            .count()
            + 1
        )

    result = run_backtest(
        spec,
        price_frame,
        benchmark_frame,
        risk_free_annual=risk_free_annual,
        annualization_factor=a,
        benchmark_annualization_factor=b_a,
        n_trials=n_trials,
        fx_applied=fx_applied,
        today=today,
    )
    return _serialize(result), result


def run_preview(db: Session, user: User, data) -> dict:
    spec = _to_spec(data)
    serialized, _result = _run(db, user, spec)
    return serialized


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def _get_owned(db: Session, user: User, scenario_id: int) -> Scenario:
    row = (
        db.query(Scenario)
        .filter(Scenario.id == scenario_id, Scenario.user_id == user.id)
        .first()
    )
    if row is None:
        raise ScenarioNotFoundError(scenario_id)
    return row


def create_scenario(db: Session, user: User, data) -> Scenario:
    count = db.query(Scenario).filter(Scenario.user_id == user.id).count()
    if count >= settings.SCENARIO_MAX_PER_USER:
        raise ScenarioValidationError(
            f"You've reached the {settings.SCENARIO_MAX_PER_USER}-scenario limit."
        )
    spec = _to_spec(data)
    _run(db, user, spec)  # validates: raises on a bad spec or unknown symbol

    row = Scenario(
        user_id=user.id,
        name=data.name,
        note=data.note,
        kind=spec.kind,
        symbol=spec.symbol,
        start_date=spec.start_date,
        end_date=spec.end_date,
        initial_amount=spec.initial_amount,
        currency=spec.currency,
        contribution_amount=spec.contribution_amount,
        contribution_freq=spec.contribution_freq,
        benchmark=spec.benchmark,
        cost_bps=spec.cost_bps,
        cost_flat=spec.cost_flat,
        dividend_treatment=spec.dividend_treatment,
        dividend_withholding_pct=spec.dividend_withholding_pct,
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if row.kind == "forward":
        try:
            _revalue_forward_scenario(db, row, today=date.today())
        except Exception:  # noqa: BLE001
            logger.exception("Initial valuation of scenario %s failed", row.id)
    return row


def list_scenarios(
    db: Session, user: User, *, kind: Optional[str] = None, status_: Optional[str] = None, sort: str = "newest"
) -> list[Scenario]:
    q = db.query(Scenario).filter(Scenario.user_id == user.id)
    if kind:
        q = q.filter(Scenario.kind == kind)
    if status_:
        q = q.filter(Scenario.status == status_)
    if sort == "best":
        q = q.order_by(Scenario.last_return_pct.desc().nullslast())
    elif sort == "worst":
        q = q.order_by(Scenario.last_return_pct.asc().nullsfirst())
    else:
        q = q.order_by(Scenario.created_at.desc())
    return q.all()


def _apply_denormalised(row: Scenario, result: BacktestResult) -> None:
    row.last_valued_on = result.spec_resolved.resolved_end
    row.last_value = result.scenario.final_value
    row.last_return_pct = result.scenario.total_return_pct
    if result.benchmark is not None:
        row.last_benchmark_return_pct = result.benchmark.total_return_pct


def get_scenario_detail(db: Session, user: User, scenario_id: int) -> tuple[Scenario, dict]:
    row = _get_owned(db, user, scenario_id)
    spec = _spec_from_row(row)
    serialized, result = _run(db, user, spec)
    _apply_denormalised(row, result)
    db.commit()
    db.refresh(row)
    return row, serialized


def patch_scenario(db: Session, user: User, scenario_id: int, data) -> Scenario:
    row = _get_owned(db, user, scenario_id)
    if data.name is not None:
        row.name = data.name
    if data.note is not None:
        row.note = data.note
    if data.status is not None:
        if data.status not in ("active", "closed"):
            raise ScenarioValidationError("status must be 'active' or 'closed'")
        row.status = data.status
    db.commit()
    db.refresh(row)
    return row


def delete_scenario(db: Session, user: User, scenario_id: int) -> None:
    row = _get_owned(db, user, scenario_id)
    db.delete(row)
    db.commit()


def rebuild_scenario(db: Session, user: User, scenario_id: int) -> Scenario:
    row = _get_owned(db, user, scenario_id)
    if row.kind != "forward":
        raise ScenarioValidationError("Only forward scenarios can be rebuilt.")
    _revalue_forward_scenario(db, row, today=date.today(), force=True)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Forward-scenario valuation (nightly tick + on-demand rebuild)
# ---------------------------------------------------------------------------


def _revalue_forward_scenario(
    db: Session, row: Scenario, *, today: Optional[date] = None, force: bool = False
) -> None:
    today = today or date.today()
    spec = _spec_from_row(row)
    price_frame, benchmark_frame, a, b_a, fx_applied = _fetch_frames(db, spec, today=today)
    risk_free_annual = _risk_free_annual(db, spec, today)

    result = run_backtest(
        spec,
        price_frame,
        benchmark_frame,
        risk_free_annual=risk_free_annual,
        annualization_factor=a,
        benchmark_annualization_factor=b_a,
        n_trials=1,
        fx_applied=fx_applied,
        today=today,
    )

    if force:
        db.query(ScenarioValuation).filter(ScenarioValuation.scenario_id == row.id).delete()
        existing_dates: set = set()
    else:
        existing_dates = {
            v.date
            for v in db.query(ScenarioValuation.date)
            .filter(ScenarioValuation.scenario_id == row.id)
            .all()
        }

    scenario_leg = result.scenario
    bench_leg = result.benchmark
    for ts in scenario_leg.value.index:
        d = ts.date()
        if d in existing_dates:
            continue
        db.add(
            ScenarioValuation(
                scenario_id=row.id,
                date=d,
                value=float(scenario_leg.value.loc[ts]),
                invested=float(scenario_leg.invested.loc[ts]),
                benchmark_value=(
                    float(bench_leg.value.loc[ts])
                    if bench_leg is not None and ts in bench_leg.value.index
                    else None
                ),
                price=float(price_frame["close"].loc[ts]) if ts in price_frame.index else None,
            )
        )

    _apply_denormalised(row, result)
    db.flush()


def run_scenario_valuation_tick(session_factory) -> dict:
    """One session, closed in `finally`. Idempotent and self-healing (Part 3.3)."""
    db = session_factory()
    revalued = 0
    failed = 0
    try:
        active = (
            db.query(Scenario)
            .filter(Scenario.kind == "forward", Scenario.status.in_(["active", "error"]))
            .all()
        )
        today = date.today()
        for row in active:
            try:
                _revalue_forward_scenario(db, row, today=today)
                row.consecutive_error_days = 0
                row.last_error = None
                row.status = "active"
                db.commit()
                revalued += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception("Scenario %s valuation failed", row.id)
                db.rollback()
                fresh = db.query(Scenario).get(row.id)
                if fresh is not None:
                    fresh.last_error = str(exc)[:500]
                    fresh.consecutive_error_days = (fresh.consecutive_error_days or 0) + 1
                    fresh.status = "closed" if fresh.consecutive_error_days >= 5 else "error"
                    db.commit()
                failed += 1
    except Exception:  # noqa: BLE001
        logger.exception("Scenario valuation tick failed")
    finally:
        db.close()
    return {"revalued": revalued, "failed": failed}


# ---------------------------------------------------------------------------
# Track record
# ---------------------------------------------------------------------------


def get_track_record(db: Session, user: User) -> dict:
    all_rows = db.query(Scenario).filter(Scenario.user_id == user.id).all()
    today = date.today()
    matured = []
    for r in all_rows:
        if r.status == "closed":
            matured.append(r)
        elif r.kind == "forward" and r.status == "active" and (today - r.start_date).days >= 30:
            matured.append(r)

    n = len(matured)
    pairs = [
        (r, r.last_return_pct - r.last_benchmark_return_pct)
        for r in matured
        if r.last_return_pct is not None and r.last_benchmark_return_pct is not None
    ]
    count_beating = sum(1 for _r, excess in pairs if excess > 0)
    hit_rate = count_beating / n if n else None
    excess_values = [excess for _r, excess in pairs]
    mean_excess = float(np.mean(excess_values)) if excess_values else None
    median_excess = float(np.median(excess_values)) if excess_values else None

    best = worst = None
    if pairs:
        best_row, best_val = max(pairs, key=lambda p: p[1])
        worst_row, worst_val = min(pairs, key=lambda p: p[1])
        best = {"id": best_row.id, "name": best_row.name, "excess_return_pct": best_val}
        worst = {"id": worst_row.id, "name": worst_row.name, "excess_return_pct": worst_val}

    p_value = float(binomtest(count_beating, n, 0.5).pvalue) if n > 0 else None

    if n < 10:
        verdict_key = "too_few"
    elif p_value is not None and p_value > 0.1:
        verdict_key = "no_evidence_of_skill"
    else:
        verdict_key = "some_evidence"

    return {
        "count": n,
        "count_beating_benchmark": count_beating,
        "hit_rate": hit_rate,
        "mean_excess_return": mean_excess,
        "median_excess_return": median_excess,
        "best": best,
        "worst": worst,
        "hit_rate_p_value": p_value,
        "verdict_key": verdict_key,
        "scenarios": [
            {
                "id": r.id,
                "name": r.name,
                "symbol": r.symbol,
                "excess_return_pct": (
                    r.last_return_pct - r.last_benchmark_return_pct
                    if r.last_return_pct is not None and r.last_benchmark_return_pct is not None
                    else None
                ),
            }
            for r in matured
        ],
    }
