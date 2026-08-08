"""Tests for app.services.analytics.indicators -- pure functions, no I/O, no DB, no network.

Fixture is a deterministic 300-bar synthetic OHLCV DataFrame (np.random.default_rng seed),
never live data. See backend/app/services/analytics/indicators.py for the formulas each
test pins.
"""

import numpy as np
import pandas as pd
import pytest

from app.services.analytics import indicators as I


def _dates(n, start="2020-01-01"):
    return pd.date_range(start, periods=n, freq="D")


@pytest.fixture()
def ohlcv():
    rng = np.random.default_rng(7)
    n = 300
    idx = _dates(n)
    steps = rng.normal(loc=0.05, scale=1.0, size=n)
    close = 100 + np.cumsum(steps)
    close = pd.Series(close, index=idx)

    daily_range = np.abs(rng.normal(loc=1.5, scale=0.5, size=n)) + 0.1
    high = close + daily_range / 2
    low = close - daily_range / 2
    volume = pd.Series(rng.integers(1000, 10000, size=n).astype(float), index=idx)

    return pd.DataFrame({"high": high, "low": low, "close": close, "volume": volume}, index=idx)


def _leading_nan_count(s: pd.Series) -> int:
    count = 0
    for v in s:
        if pd.isna(v):
            count += 1
        else:
            break
    return count


# ---------------------------------------------------------------------------
# Wilder smoothing
# ---------------------------------------------------------------------------


class TestWilderSmooth:
    def test_differs_from_span_ewm(self, ohlcv):
        x = ohlcv["close"]
        wilder = I.wilder_smooth(x, 14)
        span_ewm = x.ewm(span=14).mean()
        # Compare on the overlapping non-NaN region.
        valid = wilder.notna()
        assert not np.allclose(wilder[valid], span_ewm[valid], atol=1e-6)

    def test_matches_seeded_alpha_ewm_after_warmup(self, ohlcv):
        x = ohlcv["close"]
        n = 14
        wilder = I.wilder_smooth(x, n)

        # Reproduce with ewm(alpha=1/n, adjust=False), seeded manually at bar n-1 with the
        # same seed value (ewm's own natural start would differ from our explicit seed).
        seed = x.iloc[:n].mean()
        tail = x.iloc[n - 1 :].copy()
        tail.iloc[0] = seed
        alpha_ewm_tail = tail.ewm(alpha=1 / n, adjust=False).mean()

        np.testing.assert_allclose(
            wilder.iloc[n - 1 :].to_numpy(),
            alpha_ewm_tail.to_numpy(),
            rtol=1e-9,
            atol=1e-9,
        )

    def test_leading_nan_count(self, ohlcv):
        wilder = I.wilder_smooth(ohlcv["close"], 14)
        assert _leading_nan_count(wilder) == 13
        assert wilder.index.equals(ohlcv.index)


# ---------------------------------------------------------------------------
# RSI
# ---------------------------------------------------------------------------


class TestRSI:
    def test_monotonic_rising_settles_at_100(self):
        close = pd.Series(np.arange(100, 200, dtype="float64"), index=_dates(100))
        r = I.rsi(close, 14)
        assert r.iloc[-1] == pytest.approx(100.0, abs=1e-9)
        assert r.iloc[-10:].apply(lambda v: v == pytest.approx(100.0, abs=1e-9)).all()

    def test_monotonic_falling_settles_at_0(self):
        close = pd.Series(np.arange(200, 100, -1, dtype="float64"), index=_dates(100))
        r = I.rsi(close, 14)
        assert r.iloc[-1] == pytest.approx(0.0, abs=1e-9)
        assert r.iloc[-10:].apply(lambda v: v == pytest.approx(0.0, abs=1e-9)).all()

    def test_alternating_settles_near_50(self):
        values = 100 + np.array([((-1) ** i) for i in range(120)], dtype="float64").cumsum() * 0 + 100
        # Build a pure alternating +1/-1 delta series: 100, 101, 100, 101, ...
        base = [100.0]
        for i in range(119):
            base.append(base[-1] + (1 if i % 2 == 0 else -1))
        close = pd.Series(base, index=_dates(120))
        r = I.rsi(close, 14)
        assert r.iloc[-1] == pytest.approx(50.0, abs=5.0)

    def test_leading_nan_count_is_14(self, ohlcv):
        r = I.rsi(ohlcv["close"], 14)
        assert _leading_nan_count(r) == 14
        assert r.index.equals(ohlcv.index)

    def test_zero_loss_guard_no_inf(self):
        close = pd.Series(np.arange(1, 50, dtype="float64"), index=_dates(49))
        r = I.rsi(close, 14)
        assert not np.isinf(r.dropna()).any()
        assert (r.dropna() <= 100).all()
        assert (r.dropna() >= 0).all()


# ---------------------------------------------------------------------------
# MACD
# ---------------------------------------------------------------------------


class TestMACD:
    def test_line_equals_ema_diff(self, ohlcv):
        close = ohlcv["close"]
        result = I.macd(close, 12, 26, 9)
        expected_line = I.ema(close, 12) - I.ema(close, 26)
        pd.testing.assert_series_equal(result.line, expected_line, check_names=False)

    def test_hist_equals_line_minus_signal(self, ohlcv):
        close = ohlcv["close"]
        result = I.macd(close, 12, 26, 9)
        expected_hist = result.line - result.signal
        pd.testing.assert_series_equal(result.hist, expected_hist, check_names=False)

    def test_leading_nan_counts(self, ohlcv):
        result = I.macd(ohlcv["close"], 12, 26, 9)
        assert _leading_nan_count(result.line) == 25  # ema(26) warm-up
        assert _leading_nan_count(result.signal) == 33  # 25 + 9 - 1
        assert _leading_nan_count(result.hist) == 33
        assert result.line.index.equals(ohlcv.index)
        assert result.signal.index.equals(ohlcv.index)


# ---------------------------------------------------------------------------
# Bollinger Bands
# ---------------------------------------------------------------------------


class TestBollinger:
    def test_ddof0_population_std(self, ohlcv):
        close = ohlcv["close"]
        result = I.bollinger(close, 20, 2)

        window = close.iloc[0:20]
        pop_std = float(np.sqrt(((window - window.mean()) ** 2).mean()))  # ddof=0 by hand
        expected_mid = float(window.mean())
        expected_upper = expected_mid + 2 * pop_std
        expected_lower = expected_mid - 2 * pop_std
        expected_bandwidth = (expected_upper - expected_lower) / expected_mid

        idx19 = close.index[19]
        assert result.mid.loc[idx19] == pytest.approx(expected_mid, rel=1e-9)
        assert result.upper.loc[idx19] == pytest.approx(expected_upper, rel=1e-9)
        assert result.lower.loc[idx19] == pytest.approx(expected_lower, rel=1e-9)
        assert result.bandwidth.loc[idx19] == pytest.approx(expected_bandwidth, rel=1e-9)

    def test_ddof0_differs_from_ddof1(self, ohlcv):
        close = ohlcv["close"]
        window = close.iloc[0:20]
        pop_std = window.std(ddof=0)
        sample_std = window.std(ddof=1)
        assert pop_std != pytest.approx(sample_std, rel=1e-6)

    def test_pct_b_nan_when_flat(self):
        close = pd.Series([100.0] * 25, index=_dates(25))
        result = I.bollinger(close, 20, 2)
        # Flat series -> sd == 0 -> upper == lower -> pct_b NaN, bandwidth 0 (not NaN, mid != 0)
        assert result.pct_b.iloc[19:].isna().all()

    def test_leading_nan_counts(self, ohlcv):
        result = I.bollinger(ohlcv["close"], 20, 2)
        assert _leading_nan_count(result.mid) == 19
        assert _leading_nan_count(result.upper) == 19
        assert _leading_nan_count(result.bandwidth) == 19
        assert result.mid.index.equals(ohlcv.index)


class TestBollingerSqueeze:
    def test_percentile_rank_within_lookback(self, ohlcv):
        bw = I.bollinger(ohlcv["close"], 20, 2).bandwidth
        pct = I.bollinger_squeeze(bw, lookback=120)
        assert pct.index.equals(ohlcv.index)
        valid = pct.dropna()
        assert ((valid >= 0) & (valid <= 1)).all()
        # Where bandwidth is NaN, percentile must also be NaN.
        assert pct[bw.isna()].isna().all()


# ---------------------------------------------------------------------------
# ATR
# ---------------------------------------------------------------------------


class TestATR:
    def test_first_tr_uses_high_low_only(self):
        high = pd.Series([110.0, 120.0], index=_dates(2))
        low = pd.Series([95.0, 100.0], index=_dates(2))
        close = pd.Series([100.0, 115.0], index=_dates(2))
        tr = I.true_range(high, low, close)
        assert tr.iloc[0] == pytest.approx(15.0)  # H-L only, no prior close

    def test_gap_up_uses_high_minus_prev_close(self):
        # Day 0 closes far below day 1's H/L range (a gap up).
        high = pd.Series([50.0, 200.0], index=_dates(2))
        low = pd.Series([45.0, 190.0], index=_dates(2))
        close = pd.Series([48.0, 195.0], index=_dates(2))
        tr = I.true_range(high, low, close)
        expected_day1 = abs(200.0 - 48.0)  # H - C_prev dominates H-L (10) and |L-C_prev|
        assert tr.iloc[1] == pytest.approx(expected_day1)
        assert tr.iloc[1] > (high.iloc[1] - low.iloc[1])

    def test_leading_nan_count(self, ohlcv):
        result = I.atr(ohlcv["high"], ohlcv["low"], ohlcv["close"], 14)
        assert _leading_nan_count(result.atr) == 13
        assert result.atr.index.equals(ohlcv.index)
        assert result.atr_pct.index.equals(ohlcv.index)

    def test_atr_pct_matches_ratio(self, ohlcv):
        result = I.atr(ohlcv["high"], ohlcv["low"], ohlcv["close"], 14)
        close = ohlcv["close"]
        valid = result.atr.notna()
        ratio = result.atr[valid] / close[valid]
        pd.testing.assert_series_equal(result.atr_pct[valid], ratio, check_names=False)


# ---------------------------------------------------------------------------
# ADX
# ---------------------------------------------------------------------------


class TestADX:
    def test_di_non_negative_and_adx_in_range(self, ohlcv):
        result = I.adx(ohlcv["high"], ohlcv["low"], ohlcv["close"], 14)
        assert (result.plus_di.dropna() >= 0).all()
        assert (result.minus_di.dropna() >= 0).all()
        adx_valid = result.adx.dropna()
        assert ((adx_valid >= 0) & (adx_valid <= 100)).all()

    def test_first_2n_values_are_nan(self, ohlcv):
        result = I.adx(ohlcv["high"], ohlcv["low"], ohlcv["close"], 14)
        assert result.adx.iloc[:28].isna().all()
        assert result.adx.index.equals(ohlcv.index)


# ---------------------------------------------------------------------------
# OBV / divergence
# ---------------------------------------------------------------------------


class TestOBV:
    def test_none_when_volume_missing(self, ohlcv):
        assert I.obv(ohlcv["close"], None) is None

    def test_unchanged_close_contributes_zero(self):
        close = pd.Series([100.0, 100.0, 105.0, 105.0], index=_dates(4))
        volume = pd.Series([1000.0, 2000.0, 3000.0, 4000.0], index=_dates(4))
        result = I.obv(close, volume)
        # day0: sign(NaN)*vol -> fillna(0) -> 0; day1: sign(0)*2000 == 0 -> cumsum unchanged
        assert result.iloc[0] == 0.0
        assert result.iloc[1] == 0.0  # unchanged close contributes 0
        assert result.iloc[2] == 3000.0  # close rose -> +volume
        assert result.iloc[3] == 3000.0  # unchanged again -> contributes 0
        assert result.index.equals(close.index)

    def test_no_leading_nan(self, ohlcv):
        result = I.obv(ohlcv["close"], ohlcv["volume"])
        assert result.notna().all()
        assert result.index.equals(ohlcv.index)


class TestOBVDivergence:
    def test_output_aligned_and_warmup(self, ohlcv):
        obv_series = I.obv(ohlcv["close"], ohlcv["volume"])
        div = I.obv_divergence(ohlcv["close"], obv_series, window=60)
        assert div.index.equals(ohlcv.index)
        assert pd.isna(div.iloc[:59]).all()
        # After warm-up, values should be actual booleans (or NaN if a window had gaps).
        for v in div.iloc[59:]:
            assert v is True or v is False or pd.isna(v)

    def test_no_divergence_when_trends_agree(self):
        # Strongly, significantly co-trending close & obv -> never flagged as diverging.
        idx = _dates(80)
        close = pd.Series(100 + np.arange(80, dtype="float64"), index=idx)
        volume = pd.Series(1000 + np.arange(80, dtype="float64") * 10, index=idx)
        obv_series = I.obv(close, volume)
        div = I.obv_divergence(close, obv_series, window=60)
        assert (div.iloc[59:] == False).all()  # noqa: E712


# ---------------------------------------------------------------------------
# Stochastic
# ---------------------------------------------------------------------------


class TestStochastic:
    def test_flat_range_is_nan_not_50(self):
        high = pd.Series([100.0] * 20, index=_dates(20))
        low = pd.Series([100.0] * 20, index=_dates(20))
        close = pd.Series([100.0] * 20, index=_dates(20))
        result = I.stochastic(high, low, close, k=14, d=3)
        assert result.k.iloc[13:].isna().all()
        assert result.d.iloc[13:].isna().all()

    def test_bounds_when_not_flat(self, ohlcv):
        result = I.stochastic(ohlcv["high"], ohlcv["low"], ohlcv["close"], 14, 3)
        k_valid = result.k.dropna()
        assert ((k_valid >= 0) & (k_valid <= 100)).all()

    def test_leading_nan_counts(self, ohlcv):
        result = I.stochastic(ohlcv["high"], ohlcv["low"], ohlcv["close"], 14, 3)
        assert _leading_nan_count(result.k) == 13
        assert _leading_nan_count(result.d) == 15
        assert result.k.index.equals(ohlcv.index)


# ---------------------------------------------------------------------------
# MA crossovers
# ---------------------------------------------------------------------------


class TestMACrossovers:
    def test_golden_and_death_cross_detected(self):
        idx = _dates(6)
        # fast below slow, crosses above (golden), then crosses below (death).
        fast = pd.Series([1.0, 2.0, 4.0, 5.0, 3.0, 1.0], index=idx)
        slow = pd.Series([3.0, 3.0, 3.0, 3.0, 3.0, 3.0], index=idx)
        events = I.ma_crossovers(fast, slow)
        kinds = [e["kind"] for e in events]
        assert kinds == ["golden", "death"]
        assert events[0]["date"] == idx[2]
        assert events[1]["date"] == idx[5]

    def test_nan_adjacent_crossings_ignored(self):
        idx = _dates(5)
        fast = pd.Series([1.0, np.nan, 4.0, 5.0, 1.0], index=idx)
        slow = pd.Series([3.0, 3.0, 3.0, 3.0, 3.0], index=idx)
        events = I.ma_crossovers(fast, slow)
        # transition at index1->2 involves a NaN on one side and must be ignored;
        # only the 3->4 death cross (5.0 -> 1.0, both non-NaN) should register.
        assert len(events) == 1
        assert events[0]["kind"] == "death"
        assert events[0]["date"] == idx[4]


# ---------------------------------------------------------------------------
# Warm-up alignment sweep across every indicator
# ---------------------------------------------------------------------------


class TestWarmupAlignment:
    def test_sma_variants(self, ohlcv):
        for n in (20, 50, 200):
            s = I.sma(ohlcv["close"], n)
            assert s.index.equals(ohlcv.index)
            assert _leading_nan_count(s) == n - 1

    def test_ema_variants(self, ohlcv):
        for n in (12, 26, 20, 50):
            s = I.ema(ohlcv["close"], n)
            assert s.index.equals(ohlcv.index)
            assert _leading_nan_count(s) == n - 1
