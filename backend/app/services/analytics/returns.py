"""Return, CAGR and drawdown primitives.

Pure functions over numpy/pandas — no I/O, no DB, no HTTP. Every function returns `None`
rather than `nan`/`inf` when undefined, per docs/investments/01-ticker-comparison.md §2.1.
"""

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd


def simple_returns(prices: pd.Series) -> pd.Series:
    if (prices <= 0).any():
        raise ValueError("simple_returns: prices must be strictly positive")
    return prices.pct_change().dropna()


def log_returns(prices: pd.Series) -> pd.Series:
    if (prices <= 0).any():
        raise ValueError("log_returns: prices must be strictly positive")
    return np.log(prices).diff().dropna()


def cumulative_return(returns: pd.Series) -> float:
    return float((1 + returns).prod() - 1)


def cagr(prices: pd.Series) -> Optional[float]:
    if len(prices) < 2:
        return None
    start_date = prices.index[0]
    end_date = prices.index[-1]
    days = (end_date - start_date).days
    if days < 30:
        return None
    p_start = float(prices.iloc[0])
    p_end = float(prices.iloc[-1])
    if p_start <= 0:
        return None
    return float((p_end / p_start) ** (365.25 / days) - 1)


def annualized_vol(returns: pd.Series, annualization_factor: int) -> Optional[float]:
    if len(returns) < 20:
        return None
    std = returns.std(ddof=1)
    if std is None or (isinstance(std, float) and np.isnan(std)):
        return None
    return float(std * np.sqrt(annualization_factor))


def drawdown_series(returns: pd.Series) -> pd.Series:
    wealth = (1 + returns).cumprod()
    running_peak = wealth.cummax()
    return wealth / running_peak - 1


@dataclass
class DrawdownStats:
    depth: float  # negative float, e.g. -0.35
    peak_date: object
    trough_date: object
    recovery_date: Optional[object]
    days_under_water: int
    current_dd: float


def max_drawdown(returns: pd.Series) -> Optional[DrawdownStats]:
    if len(returns) == 0:
        return None

    wealth = (1 + returns).cumprod()
    running_peak = wealth.cummax()
    dd = wealth / running_peak - 1

    trough_date = dd.idxmin()
    depth = float(dd.loc[trough_date])

    # Peak date: the argmax of wealth strictly before the trough.
    pre_trough_wealth = wealth.loc[:trough_date]
    peak_date = pre_trough_wealth.idxmax()
    peak_wealth = float(wealth.loc[peak_date])

    # Recovery: first date strictly after the trough where wealth regains the prior peak.
    post_trough = wealth.loc[trough_date:].iloc[1:]
    recovered = post_trough[post_trough >= peak_wealth]
    recovery_date = recovered.index[0] if len(recovered) > 0 else None

    # Time under water for this drawdown episode: from the prior peak until recovery
    # (or, if never recovered, until the last observation).
    end_of_episode = recovery_date if recovery_date is not None else dd.index[-1]
    days_under_water = int((end_of_episode - peak_date).days)

    current_dd = float(dd.iloc[-1])

    return DrawdownStats(
        depth=depth,
        peak_date=peak_date,
        trough_date=trough_date,
        recovery_date=recovery_date,
        days_under_water=days_under_water,
        current_dd=current_dd,
    )


def ulcer_index(returns: pd.Series) -> Optional[float]:
    if len(returns) == 0:
        return None
    dd = drawdown_series(returns)
    return float(np.sqrt(np.mean((100 * dd) ** 2)))


def rolling_window_returns(prices: pd.Series, months: int = 12) -> pd.Series:
    """Every rolling N-month total return, used for the win-rate stat."""
    approx_days = int(round(months * 30.4375))
    shifted = prices.shift(approx_days)
    return (prices / shifted - 1).dropna()
