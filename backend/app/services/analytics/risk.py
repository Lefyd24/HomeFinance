"""Risk and risk-adjusted-return metrics. Pure functions, no I/O.

Formulas follow docs/investments/00-research-foundations.md Part C exactly — see the
docstring of each function for the paragraph it implements.
"""

from dataclasses import dataclass
from typing import Optional, Union

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.stattools import jarque_bera


@dataclass
class SharpeResult:
    value: float
    se: float
    ci_low: float
    ci_high: float
    n: int


def sharpe(
    returns: pd.Series,
    rf_periodic: Union[pd.Series, float],
    annualization_factor: int,
) -> Optional[SharpeResult]:
    """C.4: Sharpe ratio with Lo (2002) standard error and 95% CI."""
    n = len(returns)
    if n < 60:
        return None

    if isinstance(rf_periodic, pd.Series):
        excess = returns - rf_periodic.reindex(returns.index).ffill().bfill()
    else:
        excess = returns - rf_periodic

    std = excess.std(ddof=1)
    if std == 0 or np.isnan(std):
        return None

    a = annualization_factor
    value = float(excess.mean() * a / (std * np.sqrt(a)))
    se = float(np.sqrt((1 + value**2 / (2 * a)) / n) * np.sqrt(a))
    return SharpeResult(value=value, se=se, ci_low=value - 1.96 * se, ci_high=value + 1.96 * se, n=n)


def sortino(
    returns: pd.Series,
    mar_periodic: float = 0.0,
    annualization_factor: int = 252,
) -> Optional[float]:
    """C.5: Sortino ratio. Divisor is n (ALL observations), not the below-target count."""
    n = len(returns)
    if n < 60:
        return None
    downside = np.minimum(returns - mar_periodic, 0.0)
    tdd = float(np.sqrt((downside**2).sum() / n))
    if tdd == 0:
        return None
    a = annualization_factor
    return float((returns.mean() - mar_periodic) * a / (tdd * np.sqrt(a)))


def calmar(cagr_value: Optional[float], mdd: Optional[float]) -> Optional[float]:
    if cagr_value is None or mdd is None or mdd == 0:
        return None
    return float(cagr_value / abs(mdd))


def martin_ratio(cagr_value: Optional[float], rf_ann: float, ulcer: Optional[float]) -> Optional[float]:
    if cagr_value is None or ulcer is None or ulcer == 0:
        return None
    return float((cagr_value - rf_ann) / ulcer)


def omega_curve(returns: pd.Series, thresholds: list[float]) -> list[tuple[float, Optional[float]]]:
    curve: list[tuple[float, Optional[float]]] = []
    for theta in thresholds:
        gains = np.maximum(returns - theta, 0.0).sum()
        losses = np.maximum(theta - returns, 0.0).sum()
        omega = float(gains / losses) if losses > 0 else None
        curve.append((theta, omega))
    return curve


def historical_var(returns: pd.Series, level: float = 0.95) -> Optional[float]:
    if len(returns) == 0:
        return None
    return float(-np.quantile(returns, 1 - level))


def cvar(returns: pd.Series, level: float = 0.95) -> Optional[float]:
    if len(returns) == 0:
        return None
    threshold = np.quantile(returns, 1 - level)
    tail = returns[returns <= threshold]
    if len(tail) == 0:
        return None
    return float(-tail.mean())


def cornish_fisher_var(returns: pd.Series, level: float = 0.95) -> Optional[float]:
    """C.11: Cornish-Fisher modified VaR (adjusts the normal quantile for skew/kurtosis)."""
    if len(returns) < 4:
        return None
    mu = returns.mean()
    sigma = returns.std(ddof=1)
    if sigma == 0 or np.isnan(sigma):
        return None
    skew = float(stats.skew(returns, bias=False))
    excess_kurt = float(stats.kurtosis(returns, fisher=True, bias=False))
    z = stats.norm.ppf(1 - level)
    z_cf = (
        z
        + (z**2 - 1) * skew / 6
        + (z**3 - 3 * z) * excess_kurt / 24
        - (2 * z**3 - 5 * z) * skew**2 / 36
    )
    return float(-(mu + z_cf * sigma))


@dataclass
class DistStats:
    skew: float
    excess_kurtosis: float
    kurtosis: float  # non-excess, i.e. 3 for a normal
    jarque_bera_p: Optional[float]


def distribution_stats(returns: pd.Series) -> Optional[DistStats]:
    if len(returns) < 8:
        return None
    skew = float(stats.skew(returns, bias=False))
    excess_kurt = float(stats.kurtosis(returns, fisher=True, bias=False))
    try:
        _, jb_p, _, _ = jarque_bera(returns.to_numpy())
        jb_p = float(jb_p)
    except Exception:  # noqa: BLE001
        jb_p = None
    return DistStats(skew=skew, excess_kurtosis=excess_kurt, kurtosis=excess_kurt + 3, jarque_bera_p=jb_p)


def probabilistic_sharpe(
    sr_periodic: float,
    n: int,
    skew: float,
    kurt: float,
    sr_benchmark: float = 0.0,
) -> Optional[float]:
    """C.7. sr_periodic is the PER-PERIOD Sharpe (not annualised). kurt is non-excess."""
    if n < 2:
        return None
    radicand = 1 - skew * sr_periodic + ((kurt - 1) / 4) * sr_periodic**2
    if radicand <= 0:
        return None
    numerator = (sr_periodic - sr_benchmark) * np.sqrt(n - 1)
    z = numerator / np.sqrt(radicand)
    return float(stats.norm.cdf(z))


_EULER_MASCHERONI = 0.5772156649


def deflated_sharpe(
    sr_periodic: float,
    n: int,
    skew: float,
    kurt: float,
    n_trials: int,
    sr_variance: Optional[float] = None,
) -> Optional[float]:
    """C.8. Requires n_trials >= 2."""
    if n_trials < 2 or n < 2:
        return None
    variance = sr_variance if sr_variance is not None else (1 + sr_periodic**2 / 2) / n
    if variance <= 0:
        return None
    gamma = _EULER_MASCHERONI
    s0 = np.sqrt(variance) * (
        (1 - gamma) * stats.norm.ppf(1 - 1 / n_trials)
        + gamma * stats.norm.ppf(1 - 1 / (n_trials * np.e))
    )
    return probabilistic_sharpe(sr_periodic, n, skew, kurt, sr_benchmark=float(s0))
