"""backend/app/services/backtest_service.py — pure engine, synthetic frames, no network.

Per docs/investments/02-backtesting-sandbox.md Part 7. The engine takes already-fetched
price frames, so no monkeypatching of get_price_history is needed here (unlike the API
tests, which do exercise that path).
"""

from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.services.backtest_service import (
    ScenarioSpec,
    ScenarioValidationError,
    run_backtest,
)


def _frame(prices, start="2022-01-03", periods=None):
    idx = pd.bdate_range(start, periods=periods or len(prices))
    return idx, pd.DataFrame({"close": prices}, index=idx)


def test_lump_sum_flat_price_no_costs():
    idx, frame = _frame([100.0] * 300)
    spec = ScenarioSpec(
        symbol="TST",
        start_date=idx[0].date(),
        end_date=idx[-1].date(),
        initial_amount=1000.0,
        cost_bps=0.0,
        cost_flat=0.0,
        kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=idx[-1].date())
    assert result.scenario.final_value == pytest.approx(1000.0)
    assert result.scenario.total_return_pct == pytest.approx(0.0, abs=1e-9)
    assert result.scenario.sharpe is None


def test_lump_sum_doubling_over_exactly_one_year():
    start = date(2022, 1, 3)
    end = date(2023, 1, 3)  # exactly 365 calendar days later
    idx = pd.bdate_range(start, end)
    prices = [100.0 * 2 ** (((d.date() - start).days) / 365) for d in idx]
    frame = pd.DataFrame({"close": prices}, index=idx)
    spec = ScenarioSpec(
        symbol="TST", start_date=start, end_date=end, initial_amount=1000.0,
        cost_bps=0.0, cost_flat=0.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=end)
    assert result.scenario.total_return_pct == pytest.approx(1.0, rel=1e-6)
    assert result.scenario.twr_cagr == pytest.approx(1.0, rel=0.01)
    assert result.scenario.mwr_irr == pytest.approx(result.scenario.twr_cagr, rel=1e-3)


def test_dca_rising_then_flat_mwr_below_twr():
    idx = pd.bdate_range("2022-01-03", periods=504)
    half = len(idx) // 2
    prices = []
    for i in range(len(idx)):
        prices.append(100.0 * (2.0 ** (i / half)) if i <= half else 200.0)
    frame = pd.DataFrame({"close": prices}, index=idx)
    end = idx[-1].date()
    spec = ScenarioSpec(
        symbol="TST", start_date=idx[0].date(), end_date=end, initial_amount=100.0,
        contribution_amount=100.0, contribution_freq="monthly",
        cost_bps=0.0, cost_flat=0.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=end)
    assert result.scenario.mwr_irr is not None
    assert result.scenario.twr_cagr is not None
    assert result.scenario.mwr_irr < result.scenario.twr_cagr


def test_dca_falling_then_recovering_mwr_above_twr():
    idx = pd.bdate_range("2022-01-03", periods=504)
    half = len(idx) // 2
    prices = []
    for i in range(len(idx)):
        if i <= half:
            prices.append(100.0 - 50.0 * (i / half))
        else:
            prices.append(50.0 + 50.0 * ((i - half) / (len(idx) - 1 - half)))
    frame = pd.DataFrame({"close": prices}, index=idx)
    end = idx[-1].date()
    spec = ScenarioSpec(
        symbol="TST", start_date=idx[0].date(), end_date=end, initial_amount=100.0,
        contribution_amount=100.0, contribution_freq="monthly",
        cost_bps=0.0, cost_flat=0.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=end)
    assert result.scenario.mwr_irr is not None
    assert result.scenario.twr_cagr is not None
    assert result.scenario.mwr_irr > result.scenario.twr_cagr


def test_costs_twelve_monthly_events_exact():
    start = date(2022, 1, 3)
    end = date(2022, 12, 13)  # 11 monthly nominal dates after start, none at 12 months
    idx = pd.bdate_range(start, end)
    frame = pd.DataFrame({"close": [100.0] * len(idx)}, index=idx)
    spec = ScenarioSpec(
        symbol="TST", start_date=start, end_date=end, initial_amount=200.0,
        contribution_amount=200.0, contribution_freq="monthly",
        cost_bps=10.0, cost_flat=0.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=end)
    assert result.scenario.cumulative_costs == pytest.approx(2.40, abs=1e-9)


def test_weekend_start_resolves_forward():
    idx = pd.bdate_range("2022-01-03", periods=100)
    frame = pd.DataFrame({"close": [100.0] * 100}, index=idx)
    spec = ScenarioSpec(
        symbol="TST", start_date=date(2022, 1, 15), end_date=idx[-1].date(),
        initial_amount=1000.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=idx[-1].date())
    assert result.spec_resolved.start_note is not None
    assert result.spec_resolved.resolved_start == date(2022, 1, 17)


def test_start_before_first_bar_raises():
    idx = pd.bdate_range("2022-06-01", periods=50)
    frame = pd.DataFrame({"close": [100.0] * 50}, index=idx)
    spec = ScenarioSpec(
        symbol="TST", start_date=date(2022, 1, 1), end_date=idx[-1].date(),
        initial_amount=1000.0, kind="backtest",
    )
    with pytest.raises(ScenarioValidationError):
        run_backtest(spec, frame, None, today=idx[-1].date())


def test_contribution_on_holiday_resolves_forward_no_double_count():
    idx = pd.bdate_range("2022-01-03", periods=60)
    idx = idx.delete(idx.get_loc(pd.Timestamp("2022-02-03")))  # simulated holiday
    frame = pd.DataFrame({"close": [100.0] * len(idx)}, index=idx)
    end = idx[-1].date()
    spec = ScenarioSpec(
        symbol="TST", start_date=date(2022, 1, 3), end_date=end, initial_amount=100.0,
        contribution_amount=100.0, contribution_freq="monthly",
        cost_bps=0.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=end)
    increments = result.scenario.invested.diff().dropna()
    nonzero = increments[increments != 0]
    assert set(nonzero.round(6).unique()) == {100.0}


def test_benchmark_parity_identical_symbol_zero_excess():
    idx = pd.bdate_range("2022-01-03", periods=300)
    prices = [100.0 * (1.0005 ** i) for i in range(300)]
    frame = pd.DataFrame({"close": prices}, index=idx)
    end = idx[-1].date()
    spec = ScenarioSpec(
        symbol="TST", start_date=idx[0].date(), end_date=end, initial_amount=1000.0,
        contribution_amount=100.0, contribution_freq="monthly", benchmark="TST",
        kind="backtest",
    )
    result = run_backtest(spec, frame, frame, today=end)
    assert result.comparison is not None
    assert result.comparison.excess_return_pct == pytest.approx(0.0, abs=1e-9)


def test_drawdown_scripted_path_exact():
    n_flat, n_decline, n_recover, n_tail = 20, 30, 30, 10
    prices = (
        [100.0] * n_flat
        + [100.0 - (i + 1) for i in range(n_decline)]
        + [70.0 + (i + 1) for i in range(n_recover)]
        + [100.0] * n_tail
    )
    idx = pd.bdate_range("2022-01-03", periods=len(prices))
    frame = pd.DataFrame({"close": prices}, index=idx)
    end = idx[-1].date()
    spec = ScenarioSpec(
        symbol="TST", start_date=idx[0].date(), end_date=end, initial_amount=1000.0,
        cost_bps=0.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=end)
    dd = result.scenario.max_drawdown
    assert dd is not None
    assert dd.depth == pytest.approx(-0.30, abs=0.005)
    expected_trough_date = idx[n_flat + n_decline - 1].date()
    assert dd.trough_date.date() == expected_trough_date
    assert dd.recovery_date is not None
    assert dd.peak_date is not None
    assert dd.peak_date <= dd.trough_date


def test_entry_sensitivity_chosen_percentile():
    idx = pd.bdate_range("2022-01-03", periods=400)
    prices = [100.0 * (1.001 ** i) for i in range(400)]
    frame = pd.DataFrame({"close": prices}, index=idx)
    end = idx[-1].date()
    start = date(2022, 3, 1)
    spec = ScenarioSpec(
        symbol="TST", start_date=start, end_date=end, initial_amount=1000.0,
        cost_bps=0.0, kind="backtest",
    )
    result = run_backtest(spec, frame, None, today=end)
    sens = result.sensitivity
    assert sens is not None
    assert 2 <= len(sens.entry_dates) <= 9
    assert sens.min <= result.scenario.final_value <= sens.max
    assert 0 <= sens.chosen_percentile <= 100
    matching = [e for e in sens.entry_dates if e["date"] == start.isoformat()]
    assert matching
    assert matching[0]["final_value"] == pytest.approx(result.scenario.final_value, rel=1e-9)
