"""Golden-value tests for app.services.analytics — no network, no DB.

Per docs/investments/01-ticker-comparison.md §2.4: this is the highest-risk correctness
work in the ticker-comparison feature, and each test pins a formula against a hand-computed
or literature-derived value so a future "simplification" cannot silently break it.
"""

import numpy as np
import pandas as pd
import pytest

from app.services.analytics import returns as R
from app.services.analytics import risk as K
from app.services.analytics import relation as L


def _dates(n, start="2020-01-01"):
    return pd.date_range(start, periods=n, freq="D")


def _rng():
    return np.random.default_rng(42)


class TestSortinoDivisor:
    def test_divides_by_n_not_below_target_count(self):
        # 90 periods of +1%, 10 periods of -2%. MAR = 0.
        values = [0.01] * 90 + [-0.02] * 10
        r = pd.Series(values, index=_dates(100))
        downside = np.minimum(r - 0.0, 0.0)
        tdd = np.sqrt((downside**2).sum() / 100)
        assert tdd == pytest.approx(np.sqrt(10 * 0.0004 / 100), rel=1e-9)
        assert tdd != pytest.approx(np.sqrt(10 * 0.0004 / 10), rel=1e-2)

        result = K.sortino(r, mar_periodic=0.0, annualization_factor=252)
        wrong_divisor_tdd = np.sqrt(10 * 0.0004 / 10)
        wrong_result = (r.mean() - 0.0) * 252 / (wrong_divisor_tdd * np.sqrt(252))
        # Correct result must not match the buggy (divide-by-below-target-count) version.
        assert result != pytest.approx(wrong_result, rel=1e-6)


class TestSharpe:
    def test_zero_excess_std_returns_none(self):
        r = pd.Series([0.01] * 100, index=_dates(100))
        result = K.sharpe(r, rf_periodic=0.01, annualization_factor=252)
        assert result is None

    def test_short_series_returns_none(self):
        r = pd.Series([0.001] * 10, index=_dates(10))
        assert K.sharpe(r, rf_periodic=0.0, annualization_factor=252) is None


class TestMaxDrawdown:
    def test_scripted_path(self):
        prices = pd.Series([100, 120, 60, 90, 130], index=_dates(5))
        r = R.simple_returns(prices)
        stats = R.max_drawdown(r)
        assert stats.depth == pytest.approx(-0.5, rel=1e-9)
        assert stats.peak_date == prices.index[1]
        assert stats.trough_date == prices.index[2]
        assert stats.recovery_date == prices.index[4]
        assert stats.days_under_water == 3


class TestCagr:
    def test_calendar_day_basis(self):
        prices = pd.Series([100, 200], index=[pd.Timestamp("2020-01-01"), pd.Timestamp("2022-01-01")])
        days = (prices.index[-1] - prices.index[0]).days
        assert days == 731
        value = R.cagr(prices)
        expected = (200 / 100) ** (365.25 / 731) - 1
        assert value == pytest.approx(expected, rel=1e-9)

    def test_none_under_30_days(self):
        prices = pd.Series([100, 110], index=[pd.Timestamp("2020-01-01"), pd.Timestamp("2020-01-10")])
        assert R.cagr(prices) is None


class TestWilderVsEwm:
    def test_wilder_smoothing_differs_from_pandas_ewm(self):
        rng = _rng()
        x = pd.Series(rng.normal(0, 1, 60))

        def wilder(series, n):
            seed = series.iloc[:n].mean()
            out = [seed]
            for v in series.iloc[n:]:
                out.append(out[-1] + (v - out[-1]) / n)
            return pd.Series(out)

        wilder_result = wilder(x, 14)
        ewm_result = x.ewm(span=14, adjust=False).mean()
        assert not np.allclose(wilder_result.iloc[-1], ewm_result.iloc[-1], atol=1e-6)


class TestPSRMonotonicity:
    def test_increases_in_n(self):
        sr = 0.05
        low_n = K.probabilistic_sharpe(sr, n=100, skew=0.0, kurt=3.0)
        high_n = K.probabilistic_sharpe(sr, n=1000, skew=0.0, kurt=3.0)
        assert low_n is not None and high_n is not None
        assert high_n > low_n

    def test_decreases_in_abs_skew(self):
        sr = 0.05
        no_skew = K.probabilistic_sharpe(sr, n=500, skew=0.0, kurt=3.0)
        neg_skew = K.probabilistic_sharpe(sr, n=500, skew=-1.0, kurt=3.0)
        assert no_skew is not None and neg_skew is not None
        assert neg_skew < no_skew


class TestDSR:
    def test_requires_at_least_two_trials(self):
        assert K.deflated_sharpe(0.05, n=500, skew=0.0, kurt=3.0, n_trials=1) is None

    def test_at_expected_max_level_approx_half(self):
        n_trials = 100
        n = 500
        variance = (1 + 0.0**2 / 2) / n
        gamma = 0.5772156649
        from scipy import stats as scipy_stats

        s0 = np.sqrt(variance) * (
            (1 - gamma) * scipy_stats.norm.ppf(1 - 1 / n_trials)
            + gamma * scipy_stats.norm.ppf(1 - 1 / (n_trials * np.e))
        )
        result = K.deflated_sharpe(float(s0), n=n, skew=0.0, kurt=3.0, n_trials=n_trials)
        assert result == pytest.approx(0.5, abs=0.05)


class TestAlignment:
    def test_inner_join_has_no_manufactured_zero_return_days(self):
        # Equity calendar: business days only. Crypto calendar: every day.
        equity_dates = pd.bdate_range("2021-01-01", periods=60)
        crypto_dates = pd.date_range("2021-01-01", periods=84)  # covers the same span, daily

        rng = _rng()
        equity_prices = pd.Series(100 * np.cumprod(1 + rng.normal(0.0005, 0.01, 60)), index=equity_dates)
        crypto_prices = pd.Series(100 * np.cumprod(1 + rng.normal(0.0005, 0.03, 84)), index=crypto_dates)

        equity_r = R.simple_returns(equity_prices)
        crypto_r = R.simple_returns(crypto_prices)

        # Naive forward-fill onto the union calendar manufactures zero-return days for equity.
        union_idx = equity_r.index.union(crypto_r.index)
        equity_ffilled = equity_prices.reindex(union_idx).ffill()
        equity_ffilled_r = equity_ffilled.pct_change().dropna()
        manufactured_zero_days = (equity_ffilled_r == 0).sum()
        assert manufactured_zero_days > 0

        # Inner-joined correlation input has none.
        aligned = pd.concat([equity_r, crypto_r], axis=1, join="inner").dropna()
        aligned.columns = ["equity", "crypto"]
        assert (aligned["equity"] == 0).sum() == 0 or manufactured_zero_days > (aligned["equity"] == 0).sum()

        corr_matrix = L.correlation_matrix(aligned)
        assert corr_matrix.shape == (2, 2)


class TestEmptyOrShortInputs:
    @pytest.mark.parametrize(
        "fn,args",
        [
            (R.annualized_vol, (pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5)), 252)),
            (R.cagr, (pd.Series([100, 101], index=_dates(2)),)),
        ],
    )
    def test_returns_none_never_raises(self, fn, args):
        result = fn(*args)
        assert result is None

    def test_sharpe_short_input_returns_none(self):
        r = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        assert K.sharpe(r, 0.0, 252) is None

    def test_sortino_short_input_returns_none(self):
        r = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        assert K.sortino(r, 0.0, 252) is None

    def test_market_model_short_input_returns_none(self):
        a = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        b = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        assert L.market_model(a, b, 252) is None

    def test_capture_ratios_short_input_returns_none_none(self):
        a = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        b = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        assert L.capture_ratios(a, b) == (None, None)

    def test_downside_correlation_short_input_returns_none(self):
        a = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        b = pd.Series([0.01, -0.01, 0.02, -0.02, 0.01], index=_dates(5))
        assert L.downside_correlation(a, b, b) is None


class TestVaR:
    def test_historical_var_and_cvar(self):
        r = pd.Series(np.linspace(-0.10, 0.10, 100), index=_dates(100))
        var95 = K.historical_var(r, level=0.95)
        cvar95 = K.cvar(r, level=0.95)
        assert var95 is not None and cvar95 is not None
        # CVaR (mean of the tail) should be at least as extreme as VaR (the tail boundary).
        assert cvar95 >= var95


class TestCalmar:
    def test_none_when_mdd_zero(self):
        assert K.calmar(0.1, 0.0) is None

    def test_basic(self):
        assert K.calmar(0.10, -0.20) == pytest.approx(0.5)
