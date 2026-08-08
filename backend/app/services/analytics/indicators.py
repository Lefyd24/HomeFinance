"""Technical indicators. Pure functions over numpy/pandas — no I/O, no DB, no HTTP.

Every function returns a series/frame the SAME LENGTH as its input, index-aligned, with
NaN for the warm-up period (never dropped/re-indexed). Multi-output indicators return
either a `@dataclass` of `pd.Series` (matching risk.py's `SharpeResult` style) or a list
of dicts, whichever composes cleanest for the shape of the output.
"""

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats


def wilder_smooth(x: pd.Series, n: int) -> pd.Series:
    """Wilder's smoothing (alpha=1/n): seed with the simple mean of the first n values,
    then recursive smoothing. NOT the same as pandas.ewm(span=n) (alpha=2/(n+1))."""
    out = pd.Series(np.nan, index=x.index, dtype="float64")
    if len(x) < n:
        return out
    out.iloc[n - 1] = x.iloc[:n].mean()
    prev = out.iloc[n - 1]
    for i in range(n, len(x)):
        prev = prev + (x.iloc[i] - prev) / n
        out.iloc[i] = prev
    return out


def sma(close: pd.Series, n: int) -> pd.Series:
    """Simple moving average over n bars; NaN until n bars are available."""
    return close.rolling(n).mean()


def ema(close: pd.Series, n: int) -> pd.Series:
    """Exponential moving average: seeded with SMA(n) at bar n-1, then alpha=2/(n+1),
    adjust=False (matches TradingView/StockCharts seeding convention)."""
    out = pd.Series(np.nan, index=close.index, dtype="float64")
    if len(close) < n:
        return out
    seed = close.iloc[:n].mean()
    out.iloc[n - 1] = seed
    alpha = 2.0 / (n + 1)
    prev = seed
    for i in range(n, len(close)):
        prev = prev + alpha * (close.iloc[i] - prev)
        out.iloc[i] = prev
    return out


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """Wilder's RSI(n). loss == 0 (with gain > 0) -> RSI = 100, divide guarded (no inf).

    close.diff() has a structural NaN at bar 0 (no prior close). wilder_smooth needs its
    first n inputs to all be real deltas to land the seed at the correct bar (n deltas
    require n+1 closes, i.e. RSI(14) needs 15 closes -> 14 leading NaN). So gain/loss are
    smoothed with the leading NaN dropped, then reindexed back onto close.index -- smoothing
    directly over the NaN-containing series would silently average fewer than n values
    (pandas .mean() skips NaN) and land the seed one bar too early.
    """
    delta = close.diff()
    gain = delta.clip(lower=0).dropna()
    loss = (-delta).clip(lower=0).dropna()
    avg_gain = wilder_smooth(gain, n).reindex(close.index)
    avg_loss = wilder_smooth(loss, n).reindex(close.index)

    out = pd.Series(np.nan, index=close.index, dtype="float64")
    valid = avg_gain.notna() & avg_loss.notna()
    zero_loss = valid & (avg_loss == 0)
    normal = valid & (avg_loss != 0)

    out.loc[zero_loss] = 100.0
    rs = avg_gain.loc[normal] / avg_loss.loc[normal]
    out.loc[normal] = 100.0 - 100.0 / (1.0 + rs)
    return out


@dataclass
class MACDResult:
    line: pd.Series
    signal: pd.Series
    hist: pd.Series


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> MACDResult:
    """MACD line = EMA(fast) - EMA(slow); signal = EMA(line, signal); hist = line - signal."""
    ema_fast = ema(close, fast)
    ema_slow = ema(close, slow)
    line = ema_fast - ema_slow
    signal_line = ema(line.dropna(), signal).reindex(close.index)
    hist = line - signal_line
    return MACDResult(line=line, signal=signal_line, hist=hist)


@dataclass
class BollingerResult:
    mid: pd.Series
    upper: pd.Series
    lower: pd.Series
    pct_b: pd.Series
    bandwidth: pd.Series


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0) -> BollingerResult:
    """Bollinger Bands. ddof=0 (population std) is mandatory -- Bollinger's original
    definition; ddof=1 is a common, visible bug. pct_b is NaN when upper == lower."""
    mid = sma(close, n)
    sd = close.rolling(n).std(ddof=0)
    upper = mid + k * sd
    lower = mid - k * sd

    band_range = upper - lower
    pct_b = pd.Series(np.nan, index=close.index, dtype="float64")
    valid = band_range.notna() & (band_range != 0)
    pct_b.loc[valid] = (close.loc[valid] - lower.loc[valid]) / band_range.loc[valid]

    bandwidth = pd.Series(np.nan, index=close.index, dtype="float64")
    valid_bw = mid.notna() & (mid != 0)
    bandwidth.loc[valid_bw] = band_range.loc[valid_bw] / mid.loc[valid_bw]

    return BollingerResult(mid=mid, upper=upper, lower=lower, pct_b=pct_b, bandwidth=bandwidth)


def bollinger_squeeze(bandwidth: pd.Series, lookback: int = 120) -> pd.Series:
    """Rolling percentile rank of the current bandwidth within the trailing `lookback`
    window (fraction of bandwidth[t-lookback+1:t+1] <= bandwidth[t]). Caller decides the
    squeeze flag (typically below the 10th percentile)."""

    def _pct_rank(window: np.ndarray) -> float:
        last = window[-1]
        if np.isnan(last):
            return np.nan
        valid = window[~np.isnan(window)]
        if len(valid) == 0:
            return np.nan
        return float((valid <= last).sum() / len(valid))

    return bandwidth.rolling(lookback, min_periods=1).apply(_pct_rank, raw=True)


@dataclass
class ATRResult:
    atr: pd.Series
    atr_pct: pd.Series


def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    """TR = max(H-L, |H-C_prev|, |L-C_prev|). First bar (index 0) uses H-L only."""
    prev_close = close.shift(1)
    hl = high - low
    hc = (high - prev_close).abs()
    lc = (low - prev_close).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    tr.iloc[0] = hl.iloc[0]
    return tr


def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> ATRResult:
    """Wilder's ATR(n). First TR (index 0) uses H-L only (no prior close)."""
    tr = true_range(high, low, close)
    atr_series = wilder_smooth(tr, n)
    atr_pct = pd.Series(np.nan, index=close.index, dtype="float64")
    valid = atr_series.notna() & (close != 0)
    atr_pct.loc[valid] = atr_series.loc[valid] / close.loc[valid]
    return ATRResult(atr=atr_series, atr_pct=atr_pct)


def obv(close: pd.Series, volume: Optional[pd.Series]) -> Optional[pd.Series]:
    """On-balance volume. Zero-volume days contribute nothing (sign*0=0). Returns None
    if volume is entirely missing."""
    if volume is None:
        return None
    if volume.isna().all():
        return None
    return (np.sign(close.diff()) * volume).fillna(0).cumsum()


def _rolling_slope_sign_and_tstat(z: pd.Series) -> tuple[float, float]:
    """OLS slope sign and t-stat of z vs. a 0..n-1 trend index."""
    n = len(z)
    x = np.arange(n, dtype="float64")
    result = stats.linregress(x, z.to_numpy())
    return float(np.sign(result.slope)), float(result.slope / result.stderr) if result.stderr else np.nan


def obv_divergence(close: pd.Series, obv_series: pd.Series, window: int = 60) -> pd.Series:
    """Flags divergence between price and OBV trend: sign of the OLS slope over the
    trailing `window` (on z-scored values) differs between close and OBV, AND both
    slopes are significant (|t-stat| > 2). Requires the significance test -- a sign
    mismatch alone is not sufficient."""
    out = pd.Series(np.nan, index=close.index, dtype="object")

    for i in range(window - 1, len(close)):
        c_win = close.iloc[i - window + 1 : i + 1]
        o_win = obv_series.iloc[i - window + 1 : i + 1]
        if c_win.isna().any() or o_win.isna().any():
            out.iloc[i] = np.nan
            continue
        c_std = c_win.std(ddof=0)
        o_std = o_win.std(ddof=0)
        if c_std == 0 or o_std == 0:
            out.iloc[i] = False
            continue
        c_z = (c_win - c_win.mean()) / c_std
        o_z = (o_win - o_win.mean()) / o_std
        c_sign, c_t = _rolling_slope_sign_and_tstat(c_z)
        o_sign, o_t = _rolling_slope_sign_and_tstat(o_z)
        if np.isnan(c_t) or np.isnan(o_t):
            out.iloc[i] = False
            continue
        diverges = (c_sign != o_sign) and (abs(c_t) > 2) and (abs(o_t) > 2)
        out.iloc[i] = bool(diverges)

    return out


@dataclass
class ADXResult:
    adx: pd.Series
    plus_di: pd.Series
    minus_di: pd.Series


def adx(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> ADXResult:
    """Wilder's ADX(n). Needs ~2n bars to stabilise: the first 2n ADX values are
    explicitly forced to NaN even where the recursive computation would produce a
    number there."""
    up_move = high.diff()
    down_move = -low.diff()

    plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0.0), index=high.index)
    minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0.0), index=high.index)

    atr_result = atr(high, low, close, n)
    atr_series = atr_result.atr

    smoothed_plus_dm = wilder_smooth(plus_dm, n)
    smoothed_minus_dm = wilder_smooth(minus_dm, n)

    plus_di = pd.Series(np.nan, index=high.index, dtype="float64")
    minus_di = pd.Series(np.nan, index=high.index, dtype="float64")
    valid = atr_series.notna() & (atr_series != 0)
    plus_di.loc[valid] = 100.0 * smoothed_plus_dm.loc[valid] / atr_series.loc[valid]
    minus_di.loc[valid] = 100.0 * smoothed_minus_dm.loc[valid] / atr_series.loc[valid]

    di_sum = plus_di + minus_di
    dx = pd.Series(np.nan, index=high.index, dtype="float64")
    valid_dx = di_sum.notna() & (di_sum != 0)
    dx.loc[valid_dx] = 100.0 * (plus_di.loc[valid_dx] - minus_di.loc[valid_dx]).abs() / di_sum.loc[valid_dx]

    adx_series = wilder_smooth(dx, n)
    cutoff = 2 * n
    if len(adx_series) > 0:
        adx_series.iloc[: min(cutoff, len(adx_series))] = np.nan

    return ADXResult(adx=adx_series, plus_di=plus_di, minus_di=minus_di)


@dataclass
class StochasticResult:
    k: pd.Series
    d: pd.Series


def stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k: int = 14, d: int = 3) -> StochasticResult:
    """Stochastic oscillator. Flat range (maxH == minL) -> NaN, NOT 50."""
    lowest_low = low.rolling(k).min()
    highest_high = high.rolling(k).max()
    band_range = highest_high - lowest_low

    pct_k = pd.Series(np.nan, index=close.index, dtype="float64")
    valid = band_range.notna() & (band_range != 0)
    pct_k.loc[valid] = 100.0 * (close.loc[valid] - lowest_low.loc[valid]) / band_range.loc[valid]

    pct_d = pct_k.rolling(d).mean()
    return StochasticResult(k=pct_k, d=pct_d)


def ma_crossovers(fast: pd.Series, slow: pd.Series) -> list[dict]:
    """Dates where sign(fast-slow) changes: 'golden' (fast crosses above slow) or
    'death' (fast crosses below). Crossings where either MA is NaN on either side of
    the transition are ignored."""
    diff = fast - slow
    sign = diff.apply(lambda v: np.sign(v) if pd.notna(v) else np.nan)

    events: list[dict] = []
    for i in range(1, len(sign)):
        prev_sign = sign.iloc[i - 1]
        cur_sign = sign.iloc[i]
        if pd.isna(prev_sign) or pd.isna(cur_sign):
            continue
        if prev_sign == cur_sign:
            continue
        if prev_sign <= 0 and cur_sign > 0:
            events.append({"date": sign.index[i], "kind": "golden"})
        elif prev_sign >= 0 and cur_sign < 0:
            events.append({"date": sign.index[i], "kind": "death"})
    return events
