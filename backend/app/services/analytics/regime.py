"""Regime context — is this indicator context even valid here? Pure functions, no I/O.

Formulas follow docs/investments/00-research-foundations.md Part C / Part 2.3 — see each
function's docstring for the paragraph it implements.
"""

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats


@dataclass
class VRResult:
    vr: float
    z_stat: float
    p_value: float
    q: int


def variance_ratio(log_returns: pd.Series, q: int = 5) -> Optional[VRResult]:
    """2.3: Lo-MacKinlay (1988) variance ratio test with heteroskedasticity-robust SE.

    VR(q) = Var(q-period return) / (q * Var(1-period return)), using the overlapping
    q-period sums estimator. VR > 1 with |z| > 1.96 -> trending; VR < 1 -> mean-reverting;
    otherwise indistinguishable from a random walk.
    """
    n = len(log_returns)
    if q < 2 or n < 3 * q:
        return None

    r = log_returns.to_numpy(dtype="float64")
    nq = n  # number of 1-period observations used below (nq+1 prices -> nq returns)
    mu = r.mean()

    # 1-period variance (unbiased-ish, matches Lo-MacKinlay's m = nq - 1 divisor convention)
    m1 = nq - 1
    var_1 = ((r - mu) ** 2).sum() / m1

    # overlapping q-period sums
    cumsum = np.concatenate([[0.0], np.cumsum(r)])
    # q-period return ending at index i (1-based over cumsum) = cumsum[i] - cumsum[i-q]
    qsum = cumsum[q:] - cumsum[:-q]
    nq_obs = len(qsum)
    m2 = q * (nq - q + 1) * (1 - q / nq)
    if m2 <= 0:
        return None
    var_q = ((qsum - q * mu) ** 2).sum() / m2

    vr = float(var_q / var_1) if var_1 != 0 else np.nan
    if not np.isfinite(vr):
        return None

    # heteroskedasticity-robust asymptotic variance (Lo-MacKinlay 1988, eq. for theta)
    delta = r - mu
    theta = 0.0
    for j in range(1, q):
        num = 0.0
        for t in range(j + 1, nq + 1):  # t = j+1..nq (1-indexed), delta indexed 0-based below
            num += (delta[t - 1] ** 2) * (delta[t - 1 - j] ** 2)
        denom = (np.sum(delta**2)) ** 2
        weight = (2 * (q - j) / q) ** 2
        theta += weight * (num / denom) if denom != 0 else 0.0

    if theta <= 0 or not np.isfinite(theta):
        return None

    z_stat = float((vr - 1) / np.sqrt(theta))
    p_value = float(2 * (1 - stats.norm.cdf(abs(z_stat))))
    return VRResult(vr=vr, z_stat=z_stat, p_value=p_value, q=q)


def variance_ratio_battery(log_returns: pd.Series, qs: Optional[list] = None) -> list:
    """2.3: run variance_ratio at each q, omitting entries that can't be computed."""
    if qs is None:
        qs = [2, 5, 10, 20]
    results = []
    for q in qs:
        res = variance_ratio(log_returns, q=q)
        if res is not None:
            results.append(res)
    return results


def ewma_volatility(returns: pd.Series, lam: float = 0.94, annualization_factor: int = 252) -> pd.Series:
    """2.3: RiskMetrics EWMA volatility, sigma_t^2 = lam*sigma_{t-1}^2 + (1-lam)*r_{t-1}^2.

    Seeded with the sample variance of the first ~20 observations (or all if fewer).
    Returns the annualised vol series, NaN before the seed point.
    """
    n = len(returns)
    out = pd.Series(np.nan, index=returns.index, dtype="float64")
    if n == 0:
        return out

    r = returns.to_numpy(dtype="float64")
    seed_n = min(20, n)
    if seed_n < 2:
        return out

    var = np.var(r[:seed_n], ddof=1)
    out.iloc[seed_n - 1] = np.sqrt(var) * np.sqrt(annualization_factor)

    for i in range(seed_n, n):
        var = lam * var + (1 - lam) * r[i - 1] ** 2
        out.iloc[i] = np.sqrt(var) * np.sqrt(annualization_factor)

    return out


def parkinson_volatility(
    high: pd.Series,
    low: pd.Series,
    annualization_factor: int = 252,
    window: int = 20,
) -> pd.Series:
    """2.3: Parkinson high-low range volatility estimator, rolling over `window` bars.

    sigma = sqrt( (1/(4*ln2*n)) * sum ln(H/L)^2 ) * sqrt(A) — ~5x more efficient than
    close-to-close since it exploits the daily range.
    """
    log_hl2 = (np.log(high / low)) ** 2
    factor = 1.0 / (4.0 * np.log(2.0))
    mean_log_hl2 = log_hl2.rolling(window).mean()
    return np.sqrt(factor * mean_log_hl2) * np.sqrt(annualization_factor)


def volatility_percentile(current: float, history: pd.Series, lookback: int = 756) -> Optional[float]:
    """2.3: percentile rank (0-100) of `current` within the trailing `lookback` observations."""
    usable = history.dropna()
    if len(usable) < 60:
        return None
    window = usable.iloc[-lookback:]
    if len(window) < 60 or current is None or not np.isfinite(current):
        return None
    rank = float((window <= current).sum()) / len(window)
    return float(rank * 100.0)
