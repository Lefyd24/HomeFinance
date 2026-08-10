"""Orchestrates one ticker comparison: fetch, align, compute every metric, assemble response.

Background and formulas: docs/investments/00-research-foundations.md.
Contract: docs/investments/01-ticker-comparison.md Part 3.
"""

import logging
import math
import threading
from collections import OrderedDict
from datetime import date, datetime, timedelta
from typing import Any, Optional

import pandas as pd
import yfinance as yf
from sqlalchemy.orm import Session

from app.config import settings
from app.services.analytics import relation as L
from app.services.analytics import returns as R
from app.services.analytics import risk as K
from app.services.market_data import (
    get_price_history,
    get_risk_free_rate,
    get_symbol_meta,
    periods_per_year,
    to_currency,
)
from app.schemas.investment_analytics import (
    ComparisonMeta,
    ComparisonResponse,
    DrawdownSchema,
    HeadToHead,
    InstrumentComparison,
    PairwiseBlock,
    PerformanceBlock,
    RiskAdjustedBlock,
    RiskBlock,
    SeriesBlock,
    SharpeSchema,
    StressEpisode,
    ValuationBlock,
    VsBenchmarkBlock,
)

logger = logging.getLogger("app")

PERIODS: dict[str, Optional[int]] = {
    "1m": 30,
    "3m": 91,
    "6m": 182,
    "ytd": None,
    "1y": 365,
    "3y": 1095,
    "5y": 1825,
    "10y": 3650,
    "max": None,
}

STRESS_EPISODES = [
    {"label": "Global Financial Crisis", "start": date(2007, 10, 9), "end": date(2009, 3, 9)},
    {"label": "COVID crash", "start": date(2020, 2, 19), "end": date(2020, 3, 23)},
    {"label": "2022 rate shock", "start": date(2022, 1, 3), "end": date(2022, 10, 12)},
    {"label": "SVB / Mar-2023 banking stress", "start": date(2023, 3, 8), "end": date(2023, 3, 24)},
]

MIN_ALIGNED_DAYS = 60

_cache: "OrderedDict[tuple, ComparisonResponse]" = OrderedDict()
_cache_lock = threading.Lock()
_CACHE_MAX = 64
_CACHE_TTL_SECONDS = 15 * 60


def _cache_key(symbols, period, benchmark, currency, risk_free_annual) -> tuple:
    return (tuple(symbols), period, benchmark, currency, risk_free_annual, date.today().isoformat())


def _period_start(period: str, end: date, first_available: Optional[date] = None) -> date:
    days = PERIODS.get(period)
    if period == "ytd":
        return date(end.year, 1, 1)
    if period == "max" or days is None:
        return first_available or (end - timedelta(days=3650))
    return end - timedelta(days=days)


def build_comparison(
    db: Session,
    symbols: list[str],
    period: str = "3y",
    benchmark: Optional[str] = "^GSPC",
    currency: Optional[str] = None,
    risk_free_annual: Optional[float] = None,
) -> ComparisonResponse:
    if not (2 <= len(symbols) <= settings.ANALYTICS_MAX_COMPARE_SYMBOLS):
        raise ValueError(
            f"symbols must contain between 2 and {settings.ANALYTICS_MAX_COMPARE_SYMBOLS} tickers"
        )
    if period not in PERIODS:
        raise ValueError(f"unknown period: {period}")

    # Dedupe case-insensitively, preserve order.
    seen = set()
    normalized_symbols: list[str] = []
    for s in symbols:
        u = s.strip().upper()
        if u and u not in seen:
            seen.add(u)
            normalized_symbols.append(u)

    benchmark_symbol = benchmark.strip().upper() if benchmark else None
    # If the user explicitly included the benchmark, it's just a normal series.
    benchmark_is_extra = bool(benchmark_symbol) and benchmark_symbol not in normalized_symbols

    cache_key = _cache_key(
        normalized_symbols + ([benchmark_symbol] if benchmark_is_extra else []),
        period,
        benchmark_symbol,
        currency,
        risk_free_annual,
    )
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached is not None:
            _cache.move_to_end(cache_key)
            return cached

    response = _build_comparison_uncached(
        db, normalized_symbols, period, benchmark_symbol, benchmark_is_extra, currency, risk_free_annual
    )

    with _cache_lock:
        _cache[cache_key] = response
        _cache.move_to_end(cache_key)
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)

    return response


def _build_comparison_uncached(
    db: Session,
    symbols: list[str],
    period: str,
    benchmark_symbol: Optional[str],
    benchmark_is_extra: bool,
    currency: Optional[str],
    risk_free_annual: Optional[float],
) -> ComparisonResponse:
    end = date.today()
    start = _period_start(period, end)

    all_symbols = list(symbols)
    if benchmark_is_extra:
        all_symbols.append(benchmark_symbol)

    warnings: list[str] = []

    histories = get_price_history(all_symbols, start, end, db=db)

    target_currency = (currency or "USD").upper()

    metas = {s: get_symbol_meta(db, s) for s in all_symbols}

    own_series: dict[str, pd.DataFrame] = {}
    fx_applied: dict[str, bool] = {}
    for s in all_symbols:
        frame = histories[s]
        native_ccy = metas[s].currency
        converted, applied = to_currency(frame, native_ccy, target_currency, db)
        own_series[s] = converted
        fx_applied[s] = applied

    # Inner-joined "aligned" close-price frame across every series (incl. benchmark).
    close_frame = pd.DataFrame({s: own_series[s]["close"] for s in all_symbols})
    aligned_close = close_frame.dropna(how="any")
    aligned_days = len(aligned_close)

    alignment_note = None
    for s in all_symbols:
        own_len = len(own_series[s].dropna(subset=["close"]))
        if own_len > 0 and aligned_days < 0.95 * own_len:
            alignment_note = (
                "Some instruments trade on different calendars (e.g. crypto trades every day, "
                "equities only on business days); charts and correlations use only the days all "
                "selected instruments have prices for."
            )
            break

    returns_frame = aligned_close.pct_change().dropna(how="any")

    rf_series, rf_source = get_risk_free_rate(db, start, end, override_annual=risk_free_annual)
    rf_ann_avg = float(rf_series.mean())

    instruments: list[InstrumentComparison] = []
    sharpe_by_symbol: dict[str, Optional[K.SharpeResult]] = {}

    for s in symbols + ([benchmark_symbol] if benchmark_is_extra else []):
        is_benchmark = benchmark_is_extra and s == benchmark_symbol
        meta = metas[s]
        ppy = meta.periods_per_year or periods_per_year(meta.quote_type)

        own_close = own_series[s]["close"].dropna()
        last_price = float(own_close.iloc[-1]) if len(own_close) else None
        own_ret = R.simple_returns(own_close) if len(own_close) >= 2 else pd.Series(dtype=float)

        rf_annual = rf_series.reindex(own_ret.index).ffill().bfill()
        rf_periodic = (1 + rf_annual) ** (1 / ppy) - 1

        instrument_warnings: list[str] = []
        if aligned_days < MIN_ALIGNED_DAYS or len(own_ret) < MIN_ALIGNED_DAYS:
            instrument_warnings.append("short_history")

        cagr_val = R.cagr(own_close)
        cum_ret = R.cumulative_return(own_ret) if len(own_ret) else None
        vol = R.annualized_vol(own_ret, ppy)
        dd_stats = R.max_drawdown(own_ret) if len(own_ret) else None
        ulcer = R.ulcer_index(own_ret) if len(own_ret) else None

        sharpe_res = K.sharpe(own_ret, rf_periodic, ppy) if len(own_ret) else None
        sharpe_by_symbol[s] = sharpe_res
        sortino_val = K.sortino(own_ret, 0.0, ppy) if len(own_ret) else None
        calmar_val = K.calmar(cagr_val, dd_stats.depth if dd_stats else None)
        martin_val = K.martin_ratio(cagr_val, rf_ann_avg, ulcer)
        omega = K.omega_curve(own_ret, [-0.01, 0.0, 0.01]) if len(own_ret) >= 20 else None
        var95 = K.historical_var(own_ret) if len(own_ret) else None
        cvar95 = K.cvar(own_ret) if len(own_ret) else None
        mvar95 = K.cornish_fisher_var(own_ret) if len(own_ret) else None
        dist = K.distribution_stats(own_ret) if len(own_ret) else None

        psr = None
        if sharpe_res is not None and dist is not None:
            sharpe_periodic = sharpe_res.value / ppy
            psr = K.probabilistic_sharpe(sharpe_periodic, sharpe_res.n, dist.skew, dist.kurtosis)

        rolling_1y = R.rolling_window_returns(own_close, months=12) if len(own_close) >= 260 else pd.Series(dtype=float)

        best_month = worst_month = None
        if len(own_ret) >= 20:
            monthly = (1 + own_ret).resample("ME").prod() - 1
            if len(monthly):
                best_month = float(monthly.max())
                worst_month = float(monthly.min())

        vs_benchmark = VsBenchmarkBlock()
        if benchmark_symbol and not is_benchmark and s in aligned_close.columns and benchmark_symbol in aligned_close.columns:
            asset_aligned_ret = returns_frame[s]
            bench_aligned_ret = returns_frame[benchmark_symbol]
            rf_aligned = rf_series.reindex(asset_aligned_ret.index).ffill().bfill()
            asset_excess = asset_aligned_ret - rf_aligned
            bench_excess = bench_aligned_ret - rf_aligned

            mm = L.market_model(asset_excess, bench_excess, ppy)
            dmm = L.downside_beta(asset_excess, bench_excess, ppy)
            up_cap, down_cap = L.capture_ratios(asset_aligned_ret, bench_aligned_ret)
            te = L.tracking_error(asset_aligned_ret, bench_aligned_ret, ppy)
            ir = L.information_ratio(asset_aligned_ret, bench_aligned_ret, ppy)
            dcorr = L.downside_correlation(asset_aligned_ret, bench_aligned_ret, bench_aligned_ret)

            vs_benchmark = VsBenchmarkBlock(
                beta=mm.beta if mm else None,
                beta_ci=list(mm.beta_ci) if mm else None,
                r_squared=mm.r_squared if mm else None,
                downside_beta=dmm.beta if dmm else None,
                alpha_annual=mm.alpha_annual if mm else None,
                alpha_tstat=mm.alpha_tstat if mm else None,
                alpha_pvalue=mm.alpha_pvalue if mm else None,
                tracking_error=te,
                information_ratio=ir,
                up_capture=up_cap,
                down_capture=down_cap,
                downside_correlation=dcorr,
            )

            rolling_win_rate = None
            worst_roll = None
            if len(rolling_1y) >= 5 and benchmark_symbol in own_series:
                bench_close = own_series[benchmark_symbol]["close"].dropna()
                bench_rolling = R.rolling_window_returns(bench_close, months=12)
                joined = pd.concat([rolling_1y, bench_rolling], axis=1, join="inner").dropna()
                if len(joined) > 0:
                    joined.columns = ["asset", "bench"]
                    rolling_win_rate = float((joined["asset"] > joined["bench"]).mean())
                    worst_roll = float(joined["asset"].min())
        else:
            rolling_win_rate = None
            worst_roll = float(rolling_1y.min()) if len(rolling_1y) else None

        stress = _compute_stress_episodes(own_close, meta.first_bar_date)

        valuation = _compute_valuation(s, meta.quote_type)

        instruments.append(
            InstrumentComparison(
                symbol=s,
                name=meta.name,
                quote_type=meta.quote_type,
                currency=target_currency,
                fx_applied=fx_applied.get(s, False),
                total_return=meta.quote_type != "index",
                is_benchmark=is_benchmark,
                last_price=last_price,
                warnings=instrument_warnings,
                performance=PerformanceBlock(
                    cumulative_return=cum_ret,
                    cagr=cagr_val,
                    best_month=best_month,
                    worst_month=worst_month,
                    rolling_1y_win_rate_vs_benchmark=rolling_win_rate,
                    worst_rolling_1y=worst_roll,
                ),
                risk=RiskBlock(
                    volatility=vol,
                    max_drawdown=DrawdownSchema(
                        depth=dd_stats.depth,
                        peak_date=dd_stats.peak_date,
                        trough_date=dd_stats.trough_date,
                        recovery_date=dd_stats.recovery_date,
                        days_under_water=dd_stats.days_under_water,
                    )
                    if dd_stats
                    else None,
                    ulcer_index=ulcer,
                    var95=var95,
                    cvar95=cvar95,
                    mvar95=mvar95,
                    skew=dist.skew if dist else None,
                    excess_kurtosis=dist.excess_kurtosis if dist else None,
                    jarque_bera_p=dist.jarque_bera_p if dist else None,
                ),
                risk_adjusted=RiskAdjustedBlock(
                    sharpe=SharpeSchema(
                        value=sharpe_res.value, ci_low=sharpe_res.ci_low, ci_high=sharpe_res.ci_high, n=sharpe_res.n
                    )
                    if sharpe_res
                    else None,
                    sortino=sortino_val,
                    calmar=calmar_val,
                    martin=martin_val,
                    omega_curve=[[t, o] for t, o in omega] if omega else None,
                    psr_vs_zero=psr,
                ),
                vs_benchmark=vs_benchmark,
                valuation=valuation,
                stress=stress,
            )
        )

    # Pairwise metrics (excluding the benchmark from the "which won" set, but including it in
    # correlation/diversification since it's shown on the chart and tables).
    pairwise_symbols = [i.symbol for i in instruments]
    correlation: dict[str, float] = {}
    rolling_corr_out: dict[str, list[dict]] = {}
    if len(pairwise_symbols) >= 2 and len(returns_frame) >= 20:
        corr_matrix = L.correlation_matrix(returns_frame[pairwise_symbols])
        pair_count = 0
        for i, a in enumerate(pairwise_symbols):
            for b in pairwise_symbols[i + 1 :]:
                if pair_count >= 10:
                    break
                pair_count += 1
                key = f"{a}|{b}"
                val = corr_matrix.loc[a, b]
                if not (isinstance(val, float) and math.isnan(val)):
                    correlation[key] = float(val)
                roll = L.rolling_correlation(returns_frame[a], returns_frame[b], window=90)
                rolling_corr_out[key] = [
                    {"date": idx.date().isoformat(), "value": float(v)} for idx, v in roll.items()
                ]

    div_ratio = L.diversification_ratio(returns_frame[pairwise_symbols]) if len(pairwise_symbols) >= 2 else None

    pairwise = PairwiseBlock(
        correlation=correlation,
        rolling_correlation=rolling_corr_out,
        diversification_ratio=div_ratio,
        overlap=None,
    )

    # Head-to-head: the two highest-Sharpe non-benchmark symbols.
    head_to_head = None
    ranked = [
        (s, sharpe_by_symbol[s].value) for s in symbols if sharpe_by_symbol.get(s) is not None
    ]
    ranked.sort(key=lambda t: t[1], reverse=True)
    if len(ranked) >= 2:
        leader, leader_sharpe = ranked[0]
        runner_up, runner_sharpe = ranked[1]
        leader_res = sharpe_by_symbol[leader]
        runner_res = sharpe_by_symbol[runner_up]
        leader_meta = metas[leader]
        leader_ppy = leader_meta.periods_per_year or periods_per_year(leader_meta.quote_type)
        leader_close = own_series[leader]["close"].dropna()
        leader_ret = R.simple_returns(leader_close) if len(leader_close) >= 2 else pd.Series(dtype=float)
        leader_dist = K.distribution_stats(leader_ret) if len(leader_ret) else None

        psr_h2h = None
        if leader_dist is not None:
            psr_h2h = K.probabilistic_sharpe(
                leader_res.value / leader_ppy,
                leader_res.n,
                leader_dist.skew,
                leader_dist.kurtosis,
                sr_benchmark=runner_res.value / leader_ppy,
            )

        verdict_key = "too_close_to_call"
        if psr_h2h is not None:
            if psr_h2h >= 0.9:
                verdict_key = "clearly_better_risk_adjusted"
            elif psr_h2h >= 0.75:
                verdict_key = "likely_better"
            elif psr_h2h <= 0.1:
                verdict_key = "clearly_worse_risk_adjusted"
            elif psr_h2h <= 0.25:
                verdict_key = "likely_worse"

        head_to_head = HeadToHead(
            leader=leader,
            runner_up=runner_up,
            psr_leader_vs_runner_up=psr_h2h,
            verdict_key=verdict_key,
        )

    series_frequency, normalized_series, drawdown_series_out = _build_series(aligned_close, returns_frame)

    if aligned_days < MIN_ALIGNED_DAYS:
        warnings.append("short_history")

    meta_out = ComparisonMeta(
        period=period,
        start=start,
        end=end,
        aligned_days=aligned_days,
        currency=target_currency,
        series_frequency=series_frequency,
        risk_free_annual=rf_ann_avg,
        risk_free_source=rf_source,
        benchmark_symbol=benchmark_symbol,
        alignment_note=alignment_note,
        warnings=warnings,
        generated_at=datetime.utcnow(),
    )

    return ComparisonResponse(
        meta=meta_out,
        instruments=instruments,
        pairwise=pairwise,
        head_to_head=head_to_head,
        series=SeriesBlock(normalized=normalized_series, drawdown=drawdown_series_out),
    )


def _compute_stress_episodes(prices: pd.Series, first_bar_date) -> list[StressEpisode]:
    out = []
    for episode in STRESS_EPISODES:
        if first_bar_date and episode["start"] < first_bar_date:
            continue
        window = prices[(prices.index.date >= episode["start"]) & (prices.index.date <= episode["end"])]
        if len(window) < 2:
            continue
        window_ret = R.simple_returns(window)
        ret = R.cumulative_return(window_ret) if len(window_ret) else None
        dd = R.max_drawdown(window_ret) if len(window_ret) else None
        out.append(
            StressEpisode(
                label=episode["label"],
                start=episode["start"],
                end=episode["end"],
                **{"return": ret},
                max_drawdown=dd.depth if dd else None,
            )
        )
    return out


def _build_series(aligned_close: pd.DataFrame, returns_frame: pd.DataFrame) -> tuple[str, list[dict], list[dict]]:
    normalized = aligned_close / aligned_close.iloc[0] * 100 if len(aligned_close) else aligned_close
    dd_frame = pd.DataFrame({col: R.drawdown_series(returns_frame[col]) for col in returns_frame.columns})

    n = len(normalized)
    if n > 2600:
        freq = "monthly"
        norm_display = normalized.resample("ME").last()
        dd_display = dd_frame.resample("ME").min()
    elif n > 750:
        freq = "weekly"
        norm_display = normalized.resample("W-FRI").last()
        dd_display = dd_frame.resample("W-FRI").min()
    else:
        freq = "daily"
        norm_display = normalized
        dd_display = dd_frame

    normalized_rows = [
        {"date": idx.date().isoformat(), **{col: (None if pd.isna(v) else float(v)) for col, v in row.items()}}
        for idx, row in norm_display.iterrows()
    ]
    drawdown_rows = [
        {"date": idx.date().isoformat(), **{col: (None if pd.isna(v) else float(v)) for col, v in row.items()}}
        for idx, row in dd_display.iterrows()
    ]
    return freq, normalized_rows, drawdown_rows


def _compute_valuation(symbol: str, quote_type: Optional[str]) -> ValuationBlock:
    kind_map = {"stock": "stock", "etf": "fund", "mutual_fund": "fund", "crypto": "crypto", "index": "index"}
    kind = kind_map.get(quote_type or "", "stock")

    fields: dict[str, Any] = {}
    sources: dict[str, str] = {}

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
    except Exception:  # noqa: BLE001 - valuation is best-effort colour, never blocks the comparison
        logger.debug("Valuation fetch failed for %s", symbol, exc_info=True)
        info = {}

    def sf(key):
        v = info.get(key)
        if v is None:
            return None
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return f if math.isfinite(f) else None

    if kind == "stock":
        fields.update(
            {
                "trailing_pe": sf("trailingPE"),
                "forward_pe": sf("forwardPE"),
                "price_to_book": sf("priceToBook"),
                "ev_to_ebitda": sf("enterpriseToEbitda"),
                "ev_to_sales": sf("enterpriseToRevenue"),
                "dividend_yield": sf("dividendYield"),
                "payout_ratio": sf("payoutRatio"),
                "fcf_yield": (
                    sf("freeCashflow") / sf("marketCap")
                    if sf("freeCashflow") is not None and sf("marketCap")
                    else None
                ),
                "roe": sf("returnOnEquity"),
                "debt_to_equity": sf("debtToEquity"),
                "gross_margin": sf("grossMargins"),
                "revenue_growth": sf("revenueGrowth"),
                "market_cap": sf("marketCap"),
                "sector": info.get("sector"),
            }
        )
    elif kind == "fund":
        fields.update(
            {
                "expense_ratio": sf("annualReportExpenseRatio") or sf("netExpenseRatio"),
                "aum": sf("totalAssets"),
                "category": info.get("category"),
                "yield": sf("yield"),
            }
        )
    elif kind == "crypto":
        fields.update(
            {
                "market_cap": sf("marketCap"),
                "circulating_supply": sf("circulatingSupply"),
                "volume_24h": sf("volume24Hr") or sf("volume"),
            }
        )
    elif kind == "index":
        fields.update({"note": "price_only"})

    sources = {k: "Yahoo Finance" for k, v in fields.items() if v is not None}
    return ValuationBlock(kind=kind, fields=fields, sources=sources)
