"""Support/resistance clustering. Pure functions, no I/O.

Formulas follow docs/investments/00-research-foundations.md Part 2.4 — see the docstring
of `find_levels` for the paragraph it implements.
"""

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from scipy.signal import argrelextrema
from sklearn.cluster import AgglomerativeClustering

try:
    from app.services.analytics.indicators import atr as _atr
except ImportError:  # sibling module not built yet in this feature
    _atr = None


@dataclass
class LevelZone:
    low: float
    high: float
    centre: float
    touches: int
    last_touch: object
    score: float
    kind: str
    distance_pct: float


def _local_atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """Minimal ATR fallback (Wilder-smoothed true range) used only if indicators.atr is absent."""
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    tr.iloc[0] = (high.iloc[0] - low.iloc[0])
    out = pd.Series(np.nan, index=tr.index, dtype="float64")
    if len(tr) < n:
        return out
    out.iloc[n - 1] = tr.iloc[:n].mean()
    prev = out.iloc[n - 1]
    for i in range(n, len(tr)):
        prev = prev + (tr.iloc[i] - prev) / n
        out.iloc[i] = prev
    return out


def _find_pivots(high: pd.Series, low: pd.Series, order: int) -> tuple:
    """Fractal highs/lows with order k: pivot at i iff it is the strict max/min of the
    2k+1-wide window centred at i. Last k bars are excluded (not yet confirmable)."""
    n = len(high)
    if n == 0:
        return np.array([], dtype=int), np.array([], dtype=int)

    h = high.to_numpy(dtype="float64")
    l = low.to_numpy(dtype="float64")

    high_idx = argrelextrema(h, np.greater_equal, order=order)[0]
    low_idx = argrelextrema(l, np.less_equal, order=order)[0]

    # argrelextrema with >=/<= can flag plateaus; enforce strict local extremum over the
    # full 2k+1 window (matches "high[i] is the max of high[i-k:i+k+1]") and drop the
    # last k bars, which cannot yet be confirmed.
    def _confirm(idx_arr, series, cmp):
        out = []
        for i in idx_arr:
            if i < order or i >= n - order:
                continue
            window = series[i - order : i + order + 1]
            if cmp == "max":
                if series[i] == window.max() and series[i] >= window.max():
                    out.append(i)
            else:
                if series[i] == window.min():
                    out.append(i)
        return np.array(out, dtype=int)

    high_idx = _confirm(high_idx, h, "max")
    low_idx = _confirm(low_idx, l, "min")
    return high_idx, low_idx


def _cluster_pivots(
    prices: np.ndarray,
    dates: pd.Index,
    volumes: Optional[np.ndarray],
    tau: float,
) -> list:
    """Agglomerative-cluster a set of pivot prices with distance_threshold=tau."""
    if len(prices) < 2:
        return []
    if tau <= 0 or not np.isfinite(tau):
        return []

    clustering = AgglomerativeClustering(
        n_clusters=None, distance_threshold=tau, linkage="average"
    )
    labels = clustering.fit_predict(prices.reshape(-1, 1))

    clusters = []
    for label in np.unique(labels):
        mask = labels == label
        cluster_prices = prices[mask]
        cluster_dates = dates[mask]
        cluster_volumes = volumes[mask] if volumes is not None else None
        clusters.append(
            {
                "prices": cluster_prices,
                "dates": cluster_dates,
                "volumes": cluster_volumes,
            }
        )
    return clusters


def find_levels(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    volume: Optional[pd.Series],
    *,
    order: int = 5,
    top_n: int = 6,
) -> list:
    """2.4: fractal pivots -> ATR-scaled agglomerative clustering -> touch/recency/volume
    score. Returns the top `top_n` zones by score, or [] if there isn't enough data or no
    cluster survives the touches >= 2 filter."""
    n = len(close)
    if n < 4 * order or n == 0:
        return []

    high_idx, low_idx = _find_pivots(high, low, order)
    if len(high_idx) + len(low_idx) < 2:
        return []

    if _atr is not None:
        atr_result = _atr(high, low, close, 14)
        atr_series = atr_result.atr if hasattr(atr_result, "atr") else atr_result
    else:
        atr_series = _local_atr(high, low, close, 14)
    atr_median = float(atr_series.dropna().median()) if atr_series.dropna().size > 0 else np.nan
    if not np.isfinite(atr_median) or atr_median <= 0:
        return []
    tau = 1.5 * atr_median

    pivot_idx = np.concatenate([high_idx, low_idx])
    if len(pivot_idx) == 0:
        return []
    pivot_prices = np.concatenate([high.to_numpy()[high_idx], low.to_numpy()[low_idx]])
    pivot_dates = close.index[pivot_idx]

    if volume is not None:
        vol_arr = volume.to_numpy(dtype="float64")
        pivot_volumes = vol_arr[pivot_idx]
        period_mean_vol = float(np.nanmean(vol_arr)) if len(vol_arr) else np.nan
    else:
        pivot_volumes = None
        period_mean_vol = np.nan

    clusters = _cluster_pivots(pivot_prices, pivot_dates, pivot_volumes, tau)
    if not clusters:
        return []

    last_date = close.index[-1]
    current_price = float(close.iloc[-1])

    zones = []
    for c in clusters:
        touches = len(c["prices"])
        if touches < 2:
            continue

        cluster_low = float(c["prices"].min())
        cluster_high = float(c["prices"].max())
        centre = float(c["prices"].mean())
        last_touch = c["dates"].max()

        try:
            age_days = np.array([(last_date - d).days for d in c["dates"]], dtype="float64")
        except TypeError:
            age_days = np.array(
                [(pd.Timestamp(last_date) - pd.Timestamp(d)).days for d in c["dates"]],
                dtype="float64",
            )
        recency_weight = float(np.exp(-age_days / 365.0).sum())

        if c["volumes"] is not None and period_mean_vol and np.isfinite(period_mean_vol) and period_mean_vol > 0:
            volume_weight = float(np.nanmean(c["volumes"])) / period_mean_vol
            if not np.isfinite(volume_weight):
                volume_weight = 1.0
        else:
            volume_weight = 1.0

        score = touches * recency_weight * volume_weight
        kind = "support" if current_price > centre else "resistance"
        distance_pct = (centre - current_price) / current_price if current_price != 0 else 0.0

        zones.append(
            LevelZone(
                low=cluster_low,
                high=cluster_high,
                centre=centre,
                touches=touches,
                last_touch=last_touch,
                score=score,
                kind=kind,
                distance_pct=float(distance_pct),
            )
        )

    if not zones:
        return []

    zones.sort(key=lambda z: z.score, reverse=True)
    return zones[:top_n]
