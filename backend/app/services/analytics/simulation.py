"""Monte Carlo price-path simulation. Pure functions, no I/O, no DB.

Per docs/investments/00-research-foundations.md Part A.2 / Part D.1: price
point-forecasting (ARIMA/LSTM/etc.) has no published out-of-sample edge for
daily financial series, so this module produces DISTRIBUTIONAL forecasts only
(a Monte Carlo fan of plausible future price paths) — it never returns a
single predicted price.

Primary engine: stationary block bootstrap (C.14, Politis & Romano 1994),
resampling overlapping blocks of actual historical log returns — this
preserves fat tails, volatility clustering and autocorrelation that GBM
destroys by assumption (Cont 2001 stylized facts). GBM (C.15) and a Student-t
variant are retained as secondary, explicitly-labelled "textbook" comparisons.
"""

import hashlib
from dataclasses import dataclass, field
from typing import Literal, Optional

import numpy as np
import pandas as pd
from scipy import stats


def block_bootstrap_paths(
    log_returns: np.ndarray,
    horizon: int,
    n_paths: int,
    mean_block: Optional[int] = None,
    rng: Optional[np.random.Generator] = None,
) -> np.ndarray:
    """C.14: stationary block bootstrap over historical log returns.

    Returns an (n_paths, horizon) matrix of simulated log returns, built by
    resampling overlapping blocks of `log_returns`. At each step, the current
    block is continued (next return in sequence, wrapping circularly through
    `log_returns`) with probability `1 - 1/L`, else a new block starts at a
    uniformly-random index. Vectorised across `n_paths`; the only Python loop
    is over `horizon` (bounded by the 504-day cap), never over `n_paths`.
    """
    n = len(log_returns)
    if n == 0:
        raise ValueError("log_returns must be non-empty")
    if rng is None:
        rng = np.random.default_rng()

    mean_block = mean_block or max(5, int(round(n ** (1 / 3))))
    mean_block = max(1, mean_block)
    continue_prob = 1 - 1 / mean_block

    # continue[:, h] = True -> extend the current block at step h (index+1 mod n).
    # continue[:, 0] is forced False so every path starts a fresh (random) block.
    continue_flags = rng.random((n_paths, horizon)) < continue_prob
    continue_flags[:, 0] = False
    new_starts = rng.integers(0, n, size=(n_paths, horizon))

    index_matrix = np.empty((n_paths, horizon), dtype=np.int64)
    index_matrix[:, 0] = new_starts[:, 0]
    for h in range(1, horizon):
        prev = index_matrix[:, h - 1]
        index_matrix[:, h] = np.where(continue_flags[:, h], (prev + 1) % n, new_starts[:, h])

    return log_returns[index_matrix]


def _gbm_paths(mu: float, sigma: float, horizon: int, n_paths: int, rng: np.random.Generator) -> np.ndarray:
    """C.15: GBM secondary model. ell_t ~ N(mu - sigma^2/2, sigma^2) per step."""
    drift_term = mu - sigma**2 / 2
    return rng.normal(loc=drift_term, scale=sigma, size=(n_paths, horizon))


def _student_t_paths(
    demeaned_returns: np.ndarray,
    per_step_drift: float,
    sigma: float,
    horizon: int,
    n_paths: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Secondary "textbook" fat-tailed comparison: Student-t with fitted nu.

    `nu` is fit via scipy.stats.t.fit on standardized (mean 0, std 1) historical
    returns; draws are then scaled to the target per-step sigma and shifted to
    the target per-step drift.
    """
    std = demeaned_returns.std(ddof=1)
    if std == 0 or np.isnan(std):
        standardized = demeaned_returns
    else:
        standardized = demeaned_returns / std
    try:
        nu, _loc, _scale = stats.t.fit(standardized, floc=0, fscale=1)
        nu = max(nu, 2.01)  # keep variance finite
    except Exception:  # noqa: BLE001
        nu = 30.0  # fall back to ~normal tails if the fit fails

    raw = stats.t.rvs(df=nu, size=(n_paths, horizon), random_state=rng)
    # Scale draws to unit variance (t(nu) has variance nu/(nu-2)), then to target sigma.
    scale_factor = sigma * np.sqrt((nu - 2) / nu)
    return raw * scale_factor + per_step_drift


@dataclass
class Probabilities:
    p_above_today: float
    p_above_target: Optional[float]
    p_drawdown_20: float
    expected_shortfall_5: float


@dataclass
class Calibration:
    lookback_start: str
    lookback_end: str
    n_observations: int
    annualized_vol_used: float
    vol_percentile_vs_3y: Optional[float]
    drift_used: float
    drift_se: Optional[float]
    mean_block: Optional[int]
    model: str
    seed: int


@dataclass
class SimulationResult:
    percentiles: list = field(default_factory=list)
    terminal: dict = field(default_factory=dict)
    probabilities: Optional[Probabilities] = None
    calibration: Optional[Calibration] = None


_PERCENTILE_LEVELS = (5, 10, 25, 50, 75, 90, 95)


def _resolve_seed(prices: pd.Series, horizon_days: int, model: str, drift_mode: str) -> int:
    """Deterministic default seed, stable across process runs (PYTHONHASHSEED-proof)."""
    last_index = str(prices.index[-1]) if len(prices) else ""
    key = f"{last_index}|{horizon_days}|{model}|{drift_mode}"
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], byteorder="big") % (2**31)


def simulate(
    prices: pd.Series,
    horizon_days: int,
    *,
    n_paths: int = 10_000,
    model: Literal["bootstrap", "gbm", "student_t"] = "bootstrap",
    drift_mode: Literal["zero", "historical", "risk_free"] = "zero",
    lookback_days: int = 756,
    seed: Optional[int] = None,
    annualization_factor: int = 252,
    target_price: Optional[float] = None,
    risk_free_annual: float = 0.0,
) -> SimulationResult:
    """Distributional Monte Carlo price forecast. Never returns a point forecast.

    See module docstring and docs/investments/00-research-foundations.md C.14/C.15
    for engine rationale. `drift_mode="zero"` is the default per A.2/C.15: the
    standard error on a historical drift estimate typically dwarfs the estimate
    itself, so simulating around zero expected drift is the honest default.
    """
    if n_paths > 20_000:
        raise ValueError("n_paths must be <= 20,000")
    if horizon_days > 504:
        raise ValueError("horizon_days must be <= 504")
    if horizon_days < 1:
        raise ValueError("horizon_days must be >= 1")
    if len(prices) < 2:
        raise ValueError("prices must have at least 2 observations")

    windowed = prices.iloc[-lookback_days:] if len(prices) > lookback_days else prices
    log_prices = np.log(windowed.to_numpy(dtype=float))
    log_returns = np.diff(log_prices)
    n_obs = len(log_returns)
    if n_obs < 2:
        raise ValueError("not enough observations to compute returns")

    p0 = float(windowed.iloc[-1])

    resolved_seed = seed if seed is not None else _resolve_seed(prices, horizon_days, model, drift_mode)
    rng = np.random.default_rng(resolved_seed)

    sigma = float(log_returns.std(ddof=1))
    years = n_obs / annualization_factor
    sigma_ann = sigma * np.sqrt(annualization_factor)

    hist_mean = float(log_returns.mean())
    drift_se: Optional[float] = None
    if drift_mode == "zero":
        per_step_drift = 0.0
    elif drift_mode == "historical":
        per_step_drift = hist_mean
        drift_se = sigma_ann / np.sqrt(years) if years > 0 else None
    elif drift_mode == "risk_free":
        per_step_drift = risk_free_annual / annualization_factor
    else:
        raise ValueError(f"unknown drift_mode: {drift_mode!r}")

    mean_block: Optional[int] = None

    if model == "bootstrap":
        mean_block = max(5, int(round(n_obs ** (1 / 3))))
        # Demean the historical returns and add back the chosen per-period drift
        # so that the resampled block SHAPE (fat tails / autocorrelation / vol
        # clustering) is preserved while the LOCATION is controlled by drift_mode.
        # Getting this backwards (adding drift to raw, non-demeaned returns) would
        # double-count the historical drift on top of the chosen drift_mode.
        demeaned = log_returns - hist_mean
        sim_returns = block_bootstrap_paths(demeaned, horizon_days, n_paths, mean_block=mean_block, rng=rng)
        sim_returns = sim_returns + per_step_drift
    elif model == "gbm":
        sim_returns = _gbm_paths(per_step_drift, sigma, horizon_days, n_paths, rng)
    elif model == "student_t":
        demeaned = log_returns - hist_mean
        sim_returns = _student_t_paths(demeaned, per_step_drift, sigma, horizon_days, n_paths, rng)
    else:
        raise ValueError(f"unknown model: {model!r}")

    cum_log = np.cumsum(sim_returns, axis=1)
    price_paths = p0 * np.exp(cum_log)  # (n_paths, horizon_days)

    percentiles = []
    for h in range(horizon_days):
        day_prices = price_paths[:, h]
        pct_values = np.percentile(day_prices, _PERCENTILE_LEVELS)
        row = {"day": h + 1}
        for level, value in zip(_PERCENTILE_LEVELS, pct_values):
            row[f"p{level}"] = float(value)
        percentiles.append(row)

    terminal_prices = price_paths[:, -1]
    terminal_pct = np.percentile(terminal_prices, _PERCENTILE_LEVELS)
    hist_counts, hist_edges = np.histogram(terminal_prices, bins=50)
    histogram = [
        {"bin_low": float(hist_edges[i]), "bin_high": float(hist_edges[i + 1]), "count": int(hist_counts[i])}
        for i in range(len(hist_counts))
    ]
    terminal = {
        **{f"p{level}": float(value) for level, value in zip(_PERCENTILE_LEVELS, terminal_pct)},
        "mean": float(terminal_prices.mean()),
        "histogram": histogram,
    }

    p_above_today = float(np.mean(terminal_prices > p0))
    p_above_target = float(np.mean(terminal_prices > target_price)) if target_price is not None else None

    # Path-wise drawdown: include P_0 as the first point of every path, then
    # compute the running maximum and the drawdown from it at every point in
    # time — NOT just start/end — so a deep mid-path dip that later recovers
    # still counts.
    full_paths = np.concatenate([np.full((n_paths, 1), p0), price_paths], axis=1)
    running_max = np.maximum.accumulate(full_paths, axis=1)
    drawdowns = (full_paths - running_max) / running_max
    worst_drawdown = drawdowns.min(axis=1)  # most negative per path
    p_drawdown_20 = float(np.mean(worst_drawdown <= -0.20))

    n_tail = max(1, int(round(0.05 * n_paths)))
    worst_terminal = np.sort(terminal_prices)[:n_tail]
    expected_shortfall_5 = float(worst_terminal.mean())

    probabilities = Probabilities(
        p_above_today=p_above_today,
        p_above_target=p_above_target,
        p_drawdown_20=p_drawdown_20,
        expected_shortfall_5=expected_shortfall_5,
    )

    calibration = Calibration(
        lookback_start=str(windowed.index[0]),
        lookback_end=str(windowed.index[-1]),
        n_observations=n_obs,
        annualized_vol_used=sigma_ann,
        # A full trailing 3y vol-percentile series needs more history/context than
        # this module owns (it only ever sees the already-trimmed lookback window)
        # — left None here; wire it from the caller side if needed.
        vol_percentile_vs_3y=None,
        drift_used=per_step_drift,
        drift_se=drift_se,
        mean_block=mean_block,
        model=model,
        seed=resolved_seed,
    )

    return SimulationResult(
        percentiles=percentiles,
        terminal=terminal,
        probabilities=probabilities,
        calibration=calibration,
    )
