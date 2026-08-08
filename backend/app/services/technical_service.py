"""Orchestrates the technical-analysis dashboard: indicators, regime context, support/
resistance levels, the "confluence, never one indicator alone" signal panel, and the
Monte Carlo simulation endpoint for one symbol.

Background: docs/investments/00-research-foundations.md.
Contract: docs/investments/03-technical-analysis.md.
"""

import logging
import math
import threading
from collections import OrderedDict
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.config import settings
from app.services.analytics import indicators as I
from app.services.analytics import levels as LV
from app.services.analytics import regime as RG
from app.services.analytics import returns as R
from app.services.analytics import simulation as SIM
from app.services.market_data import (
    get_price_history,
    get_price_history_raw,
    get_symbol_meta,
    periods_per_year,
)
from app.schemas.investment_analytics import (
    CalibrationBlock,
    ConfluenceBlock,
    CrossoverSchema,
    HistogramBin,
    LevelZoneSchema,
    PriceBarSchema,
    ProbabilitiesBlock,
    RegimeBlock,
    SignalSchema,
    SimPercentileRow,
    SimulationResponse,
    TechnicalMeta,
    TechnicalResponse,
    TerminalBlock,
    VarianceRatioSchema,
)

logger = logging.getLogger("app")

PERIODS: dict[str, int] = {"3m": 91, "6m": 182, "1y": 365, "2y": 730, "5y": 1825}
DEFAULT_PERIOD = "1y"
LONG_LOOKBACK_DAYS = 1100  # >3y calendar days, enough for the vol-percentile window + buffer
MIN_BARS_LONG_MA = 200
FAST_MA, SLOW_MA = 50, 200

_technical_cache: "OrderedDict[tuple, TechnicalResponse]" = OrderedDict()
_technical_cache_lock = threading.Lock()
_CACHE_MAX = 64


def _period_start(period: str, end: date) -> date:
    return end - timedelta(days=PERIODS.get(period, PERIODS[DEFAULT_PERIOD]))


def _safe(value) -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    return f


def _row_value(series: Optional[pd.Series], idx) -> Optional[float]:
    if series is None or idx not in series.index:
        return None
    return _safe(series.loc[idx])


# ---------------------------------------------------------------------------
# GET /technical/{symbol}
# ---------------------------------------------------------------------------


def get_technical(db: Session, symbol: str, period: str = DEFAULT_PERIOD) -> TechnicalResponse:
    if period not in PERIODS:
        raise ValueError(f"unknown period: {period}")
    symbol = symbol.strip().upper()
    end = date.today()

    cache_key = (symbol, period, end.isoformat())
    with _technical_cache_lock:
        cached = _technical_cache.get(cache_key)
        if cached is not None:
            _technical_cache.move_to_end(cache_key)
            return cached

    response = _build_technical_uncached(db, symbol, period, end)

    with _technical_cache_lock:
        _technical_cache[cache_key] = response
        _technical_cache.move_to_end(cache_key)
        while len(_technical_cache) > _CACHE_MAX:
            _technical_cache.popitem(last=False)
    return response


def _build_technical_uncached(db: Session, symbol: str, period: str, end: date) -> TechnicalResponse:
    warnings: list[str] = []
    long_start = end - timedelta(days=LONG_LOOKBACK_DAYS)
    display_start = _period_start(period, end)

    adj_full = get_price_history([symbol], long_start, end, db=db)[symbol].sort_index()
    try:
        raw_full = get_price_history_raw([symbol], long_start, end, db=db)[symbol].sort_index()
    except Exception:  # noqa: BLE001 - some quote types (indices) behave the same either way
        raw_full = adj_full
        warnings.append("raw_price_unavailable")

    meta_row = get_symbol_meta(db, symbol)
    ppy = meta_row.periods_per_year or periods_per_year(meta_row.quote_type)

    display = raw_full.loc[raw_full.index.date >= display_start]
    if display.empty:
        display = raw_full
    bars = len(display)
    last_bar_date = raw_full.index[-1].date() if len(raw_full) else None
    stale = last_bar_date is not None and (end - last_bar_date).days > 4
    has_long_history = bars >= MIN_BARS_LONG_MA
    if not has_long_history:
        warnings.append("short_history")

    close, high, low = display["close"], display["high"], display["low"]
    volume = display["volume"] if "volume" in display.columns and display["volume"].notna().any() else None

    # --- Indicators (Part 2) — computed on unadjusted (raw) prices so the numbers match
    # what every other charting site shows; see Part 1's adjusted-vs-raw split. ---
    sma20, sma50 = I.sma(close, 20), I.sma(close, 50)
    sma200 = I.sma(close, 200) if has_long_history else pd.Series(np.nan, index=close.index)
    ema20 = I.ema(close, 20)
    bb = I.bollinger(close, 20, 2)
    squeeze_pctile_series = I.bollinger_squeeze(bb.bandwidth, lookback=120)
    rsi_series = I.rsi(close, 14)
    macd_res = I.macd(close)
    atr_res = I.atr(high, low, close, 14)
    adx_res = I.adx(high, low, close, 14) if has_long_history else None
    stoch_res = I.stochastic(high, low, close)
    obv_series = I.obv(close, volume)
    obv_div = I.obv_divergence(close, obv_series, window=60) if obv_series is not None else None
    crossover_events = I.ma_crossovers(sma50, sma200) if has_long_history else []

    overlays: list[dict] = []
    for idx in display.index:
        row = {
            "date": idx.date().isoformat(),
            "close": _row_value(close, idx),
            "sma20": _row_value(sma20, idx),
            "sma50": _row_value(sma50, idx),
            "sma200": _row_value(sma200, idx),
            "ema20": _row_value(ema20, idx),
            "bb_upper": _row_value(bb.upper, idx),
            "bb_mid": _row_value(bb.mid, idx),
            "bb_lower": _row_value(bb.lower, idx),
        }
        overlays.append(row)

    panes: list[dict] = []
    for idx in display.index:
        panes.append(
            {
                "date": idx.date().isoformat(),
                "rsi": _row_value(rsi_series, idx),
                "macd_line": _row_value(macd_res.line, idx),
                "macd_signal": _row_value(macd_res.signal, idx),
                "macd_hist": _row_value(macd_res.hist, idx),
                "obv": _row_value(obv_series, idx) if obv_series is not None else None,
                "adx": _row_value(adx_res.adx, idx) if adx_res is not None else None,
                "plus_di": _row_value(adx_res.plus_di, idx) if adx_res is not None else None,
                "minus_di": _row_value(adx_res.minus_di, idx) if adx_res is not None else None,
                "stoch_k": _row_value(stoch_res.k, idx),
                "stoch_d": _row_value(stoch_res.d, idx),
                "atr": _row_value(atr_res.atr, idx),
                "atr_pct": _row_value(atr_res.atr_pct, idx),
            }
        )

    crossovers = [
        CrossoverSchema(date=ev["date"].date(), kind=ev["kind"], fast=FAST_MA, slow=SLOW_MA)
        for ev in crossover_events
        if display_start <= ev["date"].date() <= end
    ]

    # --- Levels (2.4) — unadjusted OHLCV, full long-window history. ---
    level_zones = LV.find_levels(raw_full["high"], raw_full["low"], raw_full["close"], raw_full.get("volume"))
    levels = [
        LevelZoneSchema(
            kind=z.kind,
            low=z.low,
            high=z.high,
            centre=z.centre,
            touches=z.touches,
            last_touch=(z.last_touch.date() if hasattr(z.last_touch, "date") else z.last_touch),
            score=z.score,
            distance_pct=z.distance_pct,
        )
        for z in level_zones
    ]

    # --- Regime (2.3) — adjusted (total-return) prices: a dividend drop is not a real
    # price shock and must not distort volatility or the random-walk test. ---
    adj_display = adj_full.loc[adj_full.index.date >= display_start]
    if adj_display.empty:
        adj_display = adj_full
    adj_close = adj_display["close"].dropna()
    adj_log_returns = R.log_returns(adj_close) if len(adj_close) >= 2 else pd.Series(dtype=float)

    vr_results = RG.variance_ratio_battery(adj_log_returns) if len(adj_log_returns) >= 40 else []
    vr_schemas = [VarianceRatioSchema(q=v.q, vr=v.vr, z=v.z_stat, p=v.p_value) for v in vr_results]
    vr_significant = next((v for v in vr_results if v.q == 5), vr_results[0] if vr_results else None)
    vr_insignificant = vr_significant is None or abs(vr_significant.z_stat) <= 1.96

    full_adj_returns = R.log_returns(adj_full["close"].dropna())
    ewma_vol_series = RG.ewma_volatility(full_adj_returns, annualization_factor=ppy)
    current_vol = float(ewma_vol_series.dropna().iloc[-1]) if ewma_vol_series.notna().any() else None
    vol_percentile = RG.volatility_percentile(current_vol, ewma_vol_series, lookback=756) if current_vol is not None else None
    vol_regime = "normal"
    if vol_percentile is not None:
        vol_regime = "low" if vol_percentile < 33 else "elevated" if vol_percentile > 67 else "normal"

    latest_close = float(close.iloc[-1])
    latest_sma200 = _row_value(sma200, close.index[-1])
    latest_sma50 = _row_value(sma50, close.index[-1])
    latest_adx = _row_value(adx_res.adx, close.index[-1]) if adx_res is not None else None
    is_trending = latest_adx is not None and latest_adx >= 25

    if latest_sma200 is not None and latest_sma50 is not None:
        if latest_close > latest_sma200 and latest_sma50 > latest_sma200:
            trend = "up"
        elif latest_close < latest_sma200 and latest_sma50 < latest_sma200:
            trend = "down"
        else:
            trend = "sideways"
    else:
        latest_sma20 = _row_value(sma20, close.index[-1])
        if latest_sma20 is not None and latest_sma50 is not None:
            trend = "up" if latest_sma20 > latest_sma50 else "down" if latest_sma20 < latest_sma50 else "sideways"
        else:
            trend = "sideways"

    latest_bandwidth_pctile = _row_value(squeeze_pctile_series, close.index[-1])
    bollinger_squeeze_flag = latest_bandwidth_pctile is not None and latest_bandwidth_pctile < 0.10

    regime = RegimeBlock(
        trend=trend,
        adx=latest_adx,
        variance_ratio=vr_schemas,
        vol_annualized=current_vol,
        vol_percentile_3y=vol_percentile,
        vol_regime=vol_regime,
        bollinger_squeeze=bollinger_squeeze_flag,
        squeeze_percentile=(latest_bandwidth_pctile * 100 if latest_bandwidth_pctile is not None else None),
    )

    # --- Confidence gating (Part 4) ---
    low_volume = volume is not None and float(volume.tail(20).mean() or 0) < 1000
    low_confidence = vr_insignificant or bars < 250 or low_volume

    def confidence() -> str:
        return "low" if low_confidence else "medium"

    signals: list[SignalSchema] = []

    # 1. Price vs SMA200
    if latest_sma200 is not None:
        gap = (latest_close - latest_sma200) / latest_sma200
        if gap > 0.01:
            state, direction, key = "bullish", 1, "above"
        elif gap < -0.01:
            state, direction, key = "bearish", -1, "below"
        else:
            state, direction, key = "neutral", 0, "neutral"
        signals.append(
            SignalSchema(
                id="priceVsSma200",
                state=state,
                value=latest_close,
                detail_key=f"technical.signals.detail.priceVsSma200.{key}",
                direction=direction,
                confidence=confidence(),
            )
        )

    # 2. SMA50 vs SMA200
    if latest_sma200 is not None and latest_sma50 is not None:
        if latest_sma50 > latest_sma200:
            state, direction, key = "bullish", 1, "golden"
        elif latest_sma50 < latest_sma200:
            state, direction, key = "bearish", -1, "death"
        else:
            state, direction, key = "neutral", 0, "neutral"
        signals.append(
            SignalSchema(
                id="smaCross",
                state=state,
                value=latest_sma50,
                detail_key=f"technical.signals.detail.smaCross.{key}",
                direction=direction,
                confidence=confidence(),
            )
        )

    # 3. RSI, context-selected explanation — the requirement the brief singles out.
    latest_rsi = _row_value(rsi_series, close.index[-1])
    if latest_rsi is not None:
        if vr_insignificant and vr_significant is not None:
            state = "elevated" if latest_rsi > 70 else "depressed" if latest_rsi < 30 else "neutral"
            direction = -1 if latest_rsi > 70 else 1 if latest_rsi < 30 else 0
            detail_key = "technical.signals.detail.rsi.random_walk"
        elif latest_rsi > 70:
            state, direction = "elevated", -1
            detail_key = f"technical.signals.detail.rsi.{'trending' if is_trending else 'ranging'}_overbought"
        elif latest_rsi < 30:
            state, direction = "depressed", 1
            detail_key = f"technical.signals.detail.rsi.{'trending' if is_trending else 'ranging'}_oversold"
        else:
            state, direction = "neutral", 0
            detail_key = "technical.signals.detail.rsi.neutral"
        signals.append(
            SignalSchema(
                id="rsi", state=state, value=latest_rsi, detail_key=detail_key,
                direction=direction, confidence=confidence(),
            )
        )

    # 4. MACD histogram
    latest_hist = _row_value(macd_res.hist, close.index[-1])
    prev_hist = _row_value(macd_res.hist, close.index[-2]) if len(close) > 1 else None
    if latest_hist is not None:
        rising = prev_hist is not None and latest_hist > prev_hist
        falling = prev_hist is not None and latest_hist < prev_hist
        if latest_hist > 0 and rising:
            state, direction, key = "bullish", 1, "bullish"
        elif latest_hist < 0 and falling:
            state, direction, key = "bearish", -1, "bearish"
        else:
            state, direction, key = "neutral", 0, "neutral"
        signals.append(
            SignalSchema(
                id="macd", state=state, value=latest_hist,
                detail_key=f"technical.signals.detail.macd.{key}",
                direction=direction, confidence=confidence(),
            )
        )

    # 5. %B (Bollinger)
    latest_pct_b = _row_value(bb.pct_b, close.index[-1])
    if latest_pct_b is not None:
        if latest_pct_b < 0:
            state, direction, key = "bullish", 1, "below"
        elif latest_pct_b > 1:
            state, direction, key = "bearish", -1, "above"
        else:
            state, direction, key = "neutral", 0, "inside"
        signals.append(
            SignalSchema(
                id="bollinger", state=state, value=latest_pct_b,
                detail_key=f"technical.signals.detail.bollinger.{key}",
                direction=direction, confidence=confidence(),
            )
        )

    # 6. OBV slope / divergence
    if obv_series is None:
        signals.append(
            SignalSchema(
                id="obv", state="unavailable", value=None,
                detail_key="technical.signals.detail.obv.unavailable",
                direction=0, confidence="low",
            )
        )
    else:
        divergence_flag = bool(obv_div.iloc[-1]) if obv_div is not None and pd.notna(obv_div.iloc[-1]) else False
        window = min(20, len(close) - 1) or 1
        price_up = close.iloc[-1] > close.iloc[-1 - window]
        obv_up = obv_series.iloc[-1] > obv_series.iloc[-1 - window]
        if divergence_flag and price_up and not obv_up:
            state, direction, key = "bearish", -1, "divergence_bearish"
        elif divergence_flag and not price_up and obv_up:
            state, direction, key = "bullish", 1, "divergence_bullish"
        elif price_up and obv_up:
            state, direction, key = "bullish", 1, "confirming"
        else:
            state, direction, key = "neutral", 0, "confirming"
        signals.append(
            SignalSchema(
                id="obv", state=state, value=_safe(obv_series.iloc[-1]),
                detail_key=f"technical.signals.detail.obv.{key}",
                direction=direction, confidence=confidence(),
            )
        )

    # 7. ADX — context field only, never counted toward the directional confluence.
    if latest_adx is not None:
        adx_state = "trending" if is_trending else "ranging"
        signals.append(
            SignalSchema(
                id="adx", state=adx_state, value=latest_adx,
                detail_key="technical.signals.detail.adx.context",
                direction=0, confidence=confidence(),
            )
        )

    directional = [s for s in signals if s.id != "adx"]
    positive = sum(1 for s in directional if s.direction > 0)
    negative = sum(1 for s in directional if s.direction < 0)
    neutral = sum(1 for s in directional if s.direction == 0)
    confluence = ConfluenceBlock(
        positive=positive, negative=negative, neutral=neutral,
        note_key="technical.signals.footer",
    )

    meta = TechnicalMeta(
        symbol=symbol,
        name=meta_row.name,
        quote_type=meta_row.quote_type,
        currency=meta_row.currency,
        period=period,
        last_bar_date=last_bar_date,
        stale=stale,
        price_basis="unadjusted",
        bars=bars,
        warnings=warnings,
    )

    price_bars = [
        PriceBarSchema(
            date=idx.date(),
            open=_safe(row["open"]),
            high=_safe(row["high"]),
            low=_safe(row["low"]),
            close=_safe(row["close"]),
            volume=_safe(row.get("volume")),
        )
        for idx, row in display.iterrows()
    ]

    return TechnicalResponse(
        meta=meta,
        price=price_bars,
        overlays=overlays,
        panes=panes,
        levels=levels,
        crossovers=crossovers,
        regime=regime,
        signals=signals,
        confluence=confluence,
    )


# ---------------------------------------------------------------------------
# GET /simulate/{symbol}
# ---------------------------------------------------------------------------


def simulate_technical(
    db: Session,
    symbol: str,
    horizon_days: int,
    *,
    model: str = "bootstrap",
    drift_mode: str = "zero",
    n_paths: Optional[int] = None,
    target_price: Optional[float] = None,
) -> SimulationResponse:
    symbol = symbol.strip().upper()
    n_paths = n_paths or settings.SIMULATION_DEFAULT_PATHS
    n_paths = min(n_paths, settings.SIMULATION_MAX_PATHS)
    horizon_days = min(horizon_days, settings.SIMULATION_MAX_HORIZON_DAYS)

    end = date.today()
    start = end - timedelta(days=settings.SIMULATION_DEFAULT_LOOKBACK_DAYS + 400)
    adj_hist = get_price_history([symbol], start, end, db=db)[symbol].sort_index()
    close = adj_hist["close"].dropna()

    meta_row = get_symbol_meta(db, symbol)
    ppy = meta_row.periods_per_year or periods_per_year(meta_row.quote_type)

    from app.services.market_data import get_risk_free_rate

    rf_series, _ = get_risk_free_rate(db, start, end)
    risk_free_annual = float(rf_series.mean()) if len(rf_series) else settings.ANALYTICS_RISK_FREE_ANNUAL

    result = SIM.simulate(
        close,
        horizon_days,
        n_paths=n_paths,
        model=model,
        drift_mode=drift_mode,
        lookback_days=settings.SIMULATION_DEFAULT_LOOKBACK_DAYS,
        annualization_factor=ppy,
        target_price=target_price,
        risk_free_annual=risk_free_annual,
    )

    # Wire the vol-percentile-vs-3y that `simulate()` deliberately leaves None (it only
    # sees its own trimmed lookback window) — the honesty caption on the fan needs it.
    log_returns_full = R.log_returns(close)
    ewma_vol_series = RG.ewma_volatility(log_returns_full, annualization_factor=ppy)
    current_vol = float(ewma_vol_series.dropna().iloc[-1]) if ewma_vol_series.notna().any() else None
    vol_percentile = RG.volatility_percentile(current_vol, ewma_vol_series, lookback=756) if current_vol is not None else None

    calibration = CalibrationBlock(
        lookback_start=pd.Timestamp(result.calibration.lookback_start).date(),
        lookback_end=pd.Timestamp(result.calibration.lookback_end).date(),
        n_observations=result.calibration.n_observations,
        annualized_vol_used=result.calibration.annualized_vol_used,
        vol_percentile_vs_3y=vol_percentile,
        drift_used=result.calibration.drift_used,
        drift_se=result.calibration.drift_se,
        mean_block=result.calibration.mean_block,
        model=result.calibration.model,
        seed=result.calibration.seed,
    )

    terminal = TerminalBlock(
        p5=result.terminal["p5"], p10=result.terminal["p10"], p25=result.terminal["p25"],
        p50=result.terminal["p50"], p75=result.terminal["p75"], p90=result.terminal["p90"],
        p95=result.terminal["p95"], mean=result.terminal["mean"],
        histogram=[HistogramBin(**b) for b in result.terminal["histogram"]],
    )

    probabilities = ProbabilitiesBlock(
        p_above_today=result.probabilities.p_above_today,
        p_above_target=result.probabilities.p_above_target,
        p_drawdown_20=result.probabilities.p_drawdown_20,
        expected_shortfall_5=result.probabilities.expected_shortfall_5,
    )

    return SimulationResponse(
        symbol=symbol,
        horizon_days=horizon_days,
        last_price=float(close.iloc[-1]),
        last_bar_date=close.index[-1].date(),
        percentiles=[SimPercentileRow(**row) for row in result.percentiles],
        terminal=terminal,
        probabilities=probabilities,
        calibration=calibration,
    )
