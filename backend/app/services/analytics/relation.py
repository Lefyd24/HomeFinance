"""Beta/alpha, correlation and capture-ratio primitives. Pure functions, no I/O."""

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
import statsmodels.api as sm


@dataclass
class MarketModel:
    beta: float
    beta_ci: tuple[float, float]
    alpha_annual: float
    alpha_tstat: float
    alpha_pvalue: float
    r_squared: float
    n: int


def _fit_market_model(asset_excess: pd.Series, bench_excess: pd.Series, annualization_factor: int) -> Optional[MarketModel]:
    aligned = pd.concat([asset_excess, bench_excess], axis=1, join="inner").dropna()
    n = len(aligned)
    if n < 60:
        return None
    y = aligned.iloc[:, 0]
    x = aligned.iloc[:, 1]
    x_design = sm.add_constant(x)
    maxlags = max(1, int(n**0.25))
    model = sm.OLS(y, x_design).fit(cov_type="HAC", cov_kwds={"maxlags": maxlags})

    alpha_daily = float(model.params.iloc[0])
    beta = float(model.params.iloc[1])
    beta_se = float(model.bse.iloc[1])
    beta_ci = (beta - 1.96 * beta_se, beta + 1.96 * beta_se)
    alpha_tstat = float(model.tvalues.iloc[0])
    alpha_pvalue = float(model.pvalues.iloc[0])
    r_squared = float(model.rsquared)

    return MarketModel(
        beta=beta,
        beta_ci=beta_ci,
        alpha_annual=alpha_daily * annualization_factor,
        alpha_tstat=alpha_tstat,
        alpha_pvalue=alpha_pvalue,
        r_squared=r_squared,
        n=n,
    )


def market_model(asset_excess: pd.Series, bench_excess: pd.Series, annualization_factor: int) -> Optional[MarketModel]:
    """C.9: OLS of excess asset returns on excess benchmark returns, Newey-West (HAC) SEs."""
    return _fit_market_model(asset_excess, bench_excess, annualization_factor)


def downside_beta(asset_excess: pd.Series, bench_excess: pd.Series, annualization_factor: int) -> Optional[MarketModel]:
    aligned = pd.concat([asset_excess, bench_excess], axis=1, join="inner").dropna()
    if len(aligned) < 30:
        return None
    down = aligned[aligned.iloc[:, 1] < 0]
    if len(down) < 30:
        return None
    return _fit_market_model(down.iloc[:, 0], down.iloc[:, 1], annualization_factor)


def capture_ratios(asset_r: pd.Series, bench_r: pd.Series) -> tuple[Optional[float], Optional[float]]:
    """C.10: up/down capture ratios. Requires >= 20 qualifying days each."""
    aligned = pd.concat([asset_r, bench_r], axis=1, join="inner").dropna()
    aligned.columns = ["asset", "bench"]

    up = aligned[aligned["bench"] > 0]
    down = aligned[aligned["bench"] < 0]

    up_capture = None
    if len(up) >= 20 and up["bench"].mean() != 0:
        up_capture = float(up["asset"].mean() / up["bench"].mean())

    down_capture = None
    if len(down) >= 20 and down["bench"].mean() != 0:
        down_capture = float(down["asset"].mean() / down["bench"].mean())

    return up_capture, down_capture


def correlation_matrix(returns_df: pd.DataFrame) -> pd.DataFrame:
    """C.12: Pearson correlation on the intersection of trading days (inner join)."""
    aligned = returns_df.dropna(how="any")
    return aligned.corr(method="pearson")


def rolling_correlation(a: pd.Series, b: pd.Series, window: int = 90) -> pd.Series:
    aligned = pd.concat([a, b], axis=1, join="inner").dropna()
    aligned.columns = ["a", "b"]
    return aligned["a"].rolling(window).corr(aligned["b"]).dropna()


def downside_correlation(a: pd.Series, b: pd.Series, bench: pd.Series, decile: float = 0.1) -> Optional[float]:
    """Correlation restricted to days where `bench` is in its worst decile."""
    aligned = pd.concat([a, b, bench], axis=1, join="inner").dropna()
    aligned.columns = ["a", "b", "bench"]
    threshold = aligned["bench"].quantile(decile)
    worst_days = aligned[aligned["bench"] <= threshold]
    if len(worst_days) < 20:
        return None
    corr = worst_days["a"].corr(worst_days["b"])
    if corr is None or (isinstance(corr, float) and np.isnan(corr)):
        return None
    return float(corr)


def tracking_error(asset_r: pd.Series, bench_r: pd.Series, annualization_factor: int) -> Optional[float]:
    aligned = pd.concat([asset_r, bench_r], axis=1, join="inner").dropna()
    if len(aligned) < 2:
        return None
    active = aligned.iloc[:, 0] - aligned.iloc[:, 1]
    return float(active.std(ddof=1) * np.sqrt(annualization_factor))


def information_ratio(asset_r: pd.Series, bench_r: pd.Series, annualization_factor: int) -> Optional[float]:
    aligned = pd.concat([asset_r, bench_r], axis=1, join="inner").dropna()
    if len(aligned) < 20:
        return None
    active = aligned.iloc[:, 0] - aligned.iloc[:, 1]
    std = active.std(ddof=1)
    if std == 0 or np.isnan(std):
        return None
    a = annualization_factor
    return float(active.mean() * a / (std * np.sqrt(a)))


def diversification_ratio(returns_df: pd.DataFrame) -> Optional[float]:
    """Sigma(w_i * sigma_i) / sigma_portfolio for the equal-weight combination."""
    aligned = returns_df.dropna(how="any")
    if aligned.shape[1] < 2 or len(aligned) < 20:
        return None
    n = aligned.shape[1]
    weights = np.full(n, 1.0 / n)
    vols = aligned.std(ddof=1).to_numpy()
    weighted_avg_vol = float(np.dot(weights, vols))
    portfolio_returns = aligned.to_numpy() @ weights
    portfolio_vol = float(np.std(portfolio_returns, ddof=1))
    if portfolio_vol == 0:
        return None
    return weighted_avg_vol / portfolio_vol
