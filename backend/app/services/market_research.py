"""Cached market-research data layer on top of yfinance.

Backs the advisor's research skills (equity research, stock screening, sector
overviews). Every public function:

* returns a JSON-safe dict/list (NaN/inf -> None, numpy -> python, dates -> ISO),
* never raises for "no data" (returns ``{"error": ...}`` or empty lists),
* logs provider failures server-side and returns ``{"error": "Market data
  unavailable"}`` without any exception text,
* is cached in-process with a TTL (thread-safe).

``screen_equities`` / ``screen_etfs`` raise ``ValueError`` for unknown filter keys
(the AI tool layer turns that into an error dict).

Units follow Yahoo: percent-style fields (``dividend_yield``, ``eps_growth_min``,
``revenue_growth_min``, ``debt_to_equity_max``) are expressed in percent, e.g.
``dividend_yield_min=3`` means 3 %.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Optional

import yfinance as yf

logger = logging.getLogger(__name__)

UNAVAILABLE = {"error": "Market data unavailable"}

TTL_STATEMENTS = 12 * 3600
TTL_ESTIMATES = 12 * 3600
TTL_SCREEN = 3600
TTL_SECTOR = 3600
TTL_NEWS = 30 * 60
TTL_INFO = 3600

_CACHE_MAX = 512
_cache: dict[tuple, tuple[float, Any]] = {}
_cache_lock = threading.Lock()


def _now() -> float:
    return time.time()


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _cache_get(key: tuple) -> Any:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is None:
            return None
        expires, value = hit
        if expires <= _now():
            _cache.pop(key, None)
            return None
        return value


def _cache_put(key: tuple, ttl: float, value: Any) -> None:
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX:
            now = _now()
            for k in [k for k, (exp, _) in _cache.items() if exp <= now]:
                _cache.pop(k, None)
            while len(_cache) >= _CACHE_MAX:
                _cache.pop(next(iter(_cache)))
        _cache[key] = (_now() + ttl, value)


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return tuple(sorted((str(k), _freeze(v)) for k, v in value.items()))
    if isinstance(value, (list, tuple, set)):
        return tuple(_freeze(v) for v in value)
    return value


def _cached(name: str, ttl: float, fn: Callable[[], Any], *key_args: Any) -> Any:
    """Return cached value for (name, args) or compute. Provider failures -> error dict (not cached)."""
    key = (name, _freeze(key_args))
    hit = _cache_get(key)
    if hit is not None:
        return hit
    try:
        value = fn()
    except Exception:
        logger.exception("Market research call %s failed", name)
        return dict(UNAVAILABLE)
    # Don't cache error results (they may be transient); cache "no data" for empties.
    if not (isinstance(value, dict) and value.get("error") == UNAVAILABLE["error"]):
        _cache_put(key, ttl, value)
    return value


# ----------------------------------------------------------------------------
# JSON-safety helpers
# ----------------------------------------------------------------------------

def _clean(value: Any) -> Any:
    """Recursively convert to JSON-safe python values."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (datetime, date)):
        try:
            if value != value:  # NaT
                return None
            return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
        except Exception:
            return None
    if hasattr(value, "item") and not isinstance(value, (dict, list, tuple, str)):
        try:
            return _clean(value.item())
        except Exception:
            return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, (int, str)):
        return value
    if isinstance(value, dict):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_clean(v) for v in value]
    return str(value)


def _num(value: Any, digits: int = 4) -> Optional[float]:
    try:
        if value is None:
            return None
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, digits)


def _norm_symbol(symbol: Any) -> str:
    return str(symbol or "").strip().upper()


# ----------------------------------------------------------------------------
# Ticker info
# ----------------------------------------------------------------------------

_INFO_FIELDS = (
    "symbol", "shortName", "longName", "quoteType", "exchange", "currency",
    "financialCurrency", "country", "sector", "sectorKey", "industry", "industryKey",
    "marketCap", "enterpriseValue", "currentPrice", "regularMarketPrice",
    "previousClose", "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "fiftyDayAverage",
    "twoHundredDayAverage", "beta", "trailingPE", "forwardPE", "pegRatio",
    "priceToBook", "priceToSalesTrailing12Months", "enterpriseToEbitda",
    "dividendYield", "dividendRate", "payoutRatio", "trailingEps", "forwardEps",
    "totalRevenue", "revenueGrowth", "earningsGrowth", "grossMargins",
    "operatingMargins", "profitMargins", "returnOnEquity", "returnOnAssets",
    "debtToEquity", "currentRatio", "totalCash", "totalDebt", "freeCashflow",
    "operatingCashflow", "targetMeanPrice", "targetHighPrice", "targetLowPrice",
    "recommendationKey", "numberOfAnalystOpinions", "fullTimeEmployees", "website",
    "averageVolume", "sharesOutstanding", "heldPercentInsiders",
    "heldPercentInstitutions", "shortPercentOfFloat",
    # Funds/ETFs. Units differ: netExpenseRatio is a percent, annualReportExpenseRatio a fraction.
    "netExpenseRatio", "annualReportExpenseRatio", "totalAssets",
)


def _raw_info(symbol: str) -> dict:
    info = yf.Ticker(symbol).info
    return info if isinstance(info, dict) else {}


def _info_subset(symbol: str) -> dict:
    info = _raw_info(symbol)
    if not info or not (info.get("shortName") or info.get("longName") or info.get("symbol")):
        return {"error": f"No data found for {symbol}"}
    out: dict[str, Any] = {k: info.get(k) for k in _INFO_FIELDS if info.get(k) is not None}
    out["symbol"] = symbol
    summary = info.get("longBusinessSummary")
    if summary:
        out["business_summary"] = str(summary)[:700]
    return _clean(out)


def get_info(symbol: str) -> dict:
    symbol = _norm_symbol(symbol)
    if not symbol:
        return {"error": "Symbol required"}
    return _cached("info", TTL_INFO, lambda: _info_subset(symbol), symbol)


# ----------------------------------------------------------------------------
# Financial statements
# ----------------------------------------------------------------------------

# (output name, candidate yfinance row labels in priority order)
_STATEMENT_LINES: dict[str, list[tuple[str, list[str]]]] = {
    "income": [
        ("Total Revenue", ["Total Revenue", "Operating Revenue", "Revenue"]),
        ("Cost Of Revenue", ["Cost Of Revenue", "Reconciled Cost Of Revenue"]),
        ("Gross Profit", ["Gross Profit"]),
        ("Research And Development", ["Research And Development"]),
        ("SG&A", ["Selling General And Administration"]),
        ("Operating Expense", ["Operating Expense", "Total Expenses"]),
        ("Operating Income", ["Operating Income", "Total Operating Income As Reported"]),
        ("EBITDA", ["EBITDA", "Normalized EBITDA"]),
        ("Interest Expense", ["Interest Expense", "Interest Expense Non Operating"]),
        ("Pretax Income", ["Pretax Income"]),
        ("Tax Provision", ["Tax Provision"]),
        ("Net Income", ["Net Income", "Net Income Common Stockholders",
                        "Net Income From Continuing Operation Net Minority Interest"]),
        ("Diluted EPS", ["Diluted EPS", "Basic EPS"]),
        ("Diluted Shares", ["Diluted Average Shares", "Basic Average Shares"]),
    ],
    "balance": [
        ("Total Assets", ["Total Assets"]),
        ("Current Assets", ["Current Assets"]),
        ("Cash And Equivalents", ["Cash Cash Equivalents And Short Term Investments",
                                  "Cash And Cash Equivalents", "Cash Financial"]),
        ("Receivables", ["Accounts Receivable", "Receivables"]),
        ("Inventory", ["Inventory"]),
        ("Goodwill", ["Goodwill"]),
        ("Net PPE", ["Net PPE"]),
        ("Total Liabilities", ["Total Liabilities Net Minority Interest"]),
        ("Current Liabilities", ["Current Liabilities"]),
        ("Accounts Payable", ["Accounts Payable", "Payables"]),
        ("Total Debt", ["Total Debt"]),
        ("Long Term Debt", ["Long Term Debt", "Long Term Debt And Capital Lease Obligation"]),
        ("Stockholders Equity", ["Stockholders Equity", "Common Stock Equity",
                                 "Total Equity Gross Minority Interest"]),
        ("Retained Earnings", ["Retained Earnings"]),
        ("Working Capital", ["Working Capital"]),
        ("Shares Outstanding", ["Ordinary Shares Number", "Share Issued"]),
    ],
    "cashflow": [
        ("Operating Cash Flow", ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"]),
        ("Capital Expenditure", ["Capital Expenditure", "Purchase Of PPE"]),
        ("Free Cash Flow", ["Free Cash Flow"]),
        ("Investing Cash Flow", ["Investing Cash Flow"]),
        ("Financing Cash Flow", ["Financing Cash Flow"]),
        ("Depreciation And Amortization", ["Depreciation And Amortization",
                                           "Depreciation Amortization Depletion"]),
        ("Stock Based Compensation", ["Stock Based Compensation"]),
        ("Change In Working Capital", ["Change In Working Capital"]),
        ("Dividends Paid", ["Cash Dividends Paid", "Common Stock Dividend Paid"]),
        ("Share Repurchases", ["Repurchase Of Capital Stock", "Common Stock Payments"]),
        ("Debt Issuance", ["Issuance Of Debt", "Long Term Debt Issuance"]),
        ("Debt Repayment", ["Repayment Of Debt", "Long Term Debt Payments"]),
        ("End Cash Position", ["End Cash Position"]),
    ],
}

_STATEMENT_ATTR = {
    ("income", "annual"): "income_stmt",
    ("income", "quarterly"): "quarterly_income_stmt",
    ("balance", "annual"): "balance_sheet",
    ("balance", "quarterly"): "quarterly_balance_sheet",
    ("cashflow", "annual"): "cashflow",
    ("cashflow", "quarterly"): "quarterly_cashflow",
}


def _period_label(col: Any) -> str:
    try:
        return col.date().isoformat() if hasattr(col, "date") else str(col)[:10]
    except Exception:
        return str(col)


def _extract_statement(df: Any, statement: str, keep: int) -> tuple[list[str], dict[str, list], int]:
    """Return (labels oldest->newest, rows, extra_leading) where extra_leading columns
    precede the kept window (used for growth of the first kept column)."""
    if df is None or getattr(df, "empty", True):
        return [], {}, 0
    # yfinance: newest column first -> reverse to chronological
    cols = list(df.columns)
    cols = sorted(cols, key=lambda c: str(c))
    total = len(cols)
    window = cols[-(keep + 1):]
    extra = 1 if total > keep else 0
    labels = [_period_label(c) for c in window]
    rows: dict[str, list] = {}
    for out_name, candidates in _STATEMENT_LINES[statement]:
        for cand in candidates:
            if cand in df.index:
                series = df.loc[cand]
                rows[out_name] = [_num(series.get(c), 4) for c in window]
                if any(v is not None for v in rows[out_name]):
                    break
                rows.pop(out_name, None)
    # drop rows that are entirely empty
    rows = {k: v for k, v in rows.items() if any(x is not None for x in v)}
    return labels, rows, extra


def _ratio(num: list, den: list) -> list:
    out = []
    for a, b in zip(num, den):
        out.append(round(a / b, 4) if a is not None and b not in (None, 0) else None)
    return out


def _growth(values: list, lag: int = 1) -> list:
    out: list = []
    for i, v in enumerate(values):
        prev = values[i - lag] if i - lag >= 0 else None
        if v is None or prev is None or prev == 0:
            out.append(None)
        else:
            out.append(round((v - prev) / abs(prev), 4))
    return out


def _derived(statement: str, rows: dict[str, list], revenue: Optional[list]) -> dict[str, list]:
    d: dict[str, list] = {}
    if statement == "income":
        rev = rows.get("Total Revenue")
        if rev:
            d["revenue_growth"] = _growth(rev)
            if "Gross Profit" in rows:
                d["gross_margin"] = _ratio(rows["Gross Profit"], rev)
            if "Operating Income" in rows:
                d["operating_margin"] = _ratio(rows["Operating Income"], rev)
            if "Net Income" in rows:
                d["net_margin"] = _ratio(rows["Net Income"], rev)
    elif statement == "cashflow":
        fcf = rows.get("Free Cash Flow")
        if fcf is None and "Operating Cash Flow" in rows and "Capital Expenditure" in rows:
            fcf = [
                round(o + c, 4) if o is not None and c is not None else None
                for o, c in zip(rows["Operating Cash Flow"], rows["Capital Expenditure"])
            ]  # capex is reported negative
        if fcf and any(v is not None for v in fcf):
            d["fcf"] = fcf
            if revenue and len(revenue) == len(fcf):
                d["fcf_margin"] = _ratio(fcf, revenue)
    d = {k: v for k, v in d.items() if any(x is not None for x in v)}
    return d


def _statement_df(symbol: str, statement: str, period: str) -> Any:
    return getattr(yf.Ticker(symbol), _STATEMENT_ATTR[(statement, period)], None)


def _build_statement(symbol: str, statement: str, period: str, years: int) -> dict:
    keep = years if period == "annual" else years * 4
    df = _statement_df(symbol, statement, period)
    labels, rows, extra = _extract_statement(df, statement, keep)
    if not rows:
        return {"error": f"No {period} {statement} statement data for {symbol}"}

    revenue: Optional[list] = None
    if statement == "cashflow":
        inc = _statement_df(symbol, "income", period)
        ilabels, irows, _ = _extract_statement(inc, "income", keep)
        if "Total Revenue" in irows:
            by_label = dict(zip(ilabels, irows["Total Revenue"]))
            revenue = [by_label.get(lb) for lb in labels]

    derived = _derived(statement, rows, revenue)

    if extra:  # trim the lookback column used only for growth
        labels = labels[1:]
        rows = {k: v[1:] for k, v in rows.items()}
        derived = {k: v[1:] for k, v in derived.items()}

    currency = None
    try:
        currency = _raw_info(symbol).get("financialCurrency")
    except Exception:
        logger.debug("info lookup for currency failed for %s", symbol)

    return _clean({
        "symbol": symbol, "statement": statement, "period": period,
        "currency": currency, "columns": labels, "rows": rows, "derived": derived,
    })


def get_financial_statements(
    symbol: str, statement: str = "income", period: str = "annual", years: int = 4
) -> dict:
    symbol = _norm_symbol(symbol)
    statement = str(statement or "").lower()
    period = str(period or "").lower()
    if not symbol:
        return {"error": "Symbol required"}
    if statement not in _STATEMENT_LINES:
        return {"error": "statement must be one of: income, balance, cashflow"}
    if period not in ("annual", "quarterly"):
        return {"error": "period must be one of: annual, quarterly"}
    try:
        years = max(1, min(int(years), 10))
    except (TypeError, ValueError):
        years = 4
    return _cached(
        "statements", TTL_STATEMENTS,
        lambda: _build_statement(symbol, statement, period, years),
        symbol, statement, period, years,
    )


# ----------------------------------------------------------------------------
# Analyst estimates
# ----------------------------------------------------------------------------

def _df_records(df: Any) -> list[dict]:
    if df is None or getattr(df, "empty", True):
        return []
    return _clean(df.reset_index().to_dict(orient="records"))


def _estimate_table(df: Any, mapping: dict[str, str]) -> dict:
    if df is None or getattr(df, "empty", True):
        return {}
    out: dict[str, dict] = {}
    for period, row in df.iterrows():
        out[str(period)] = {dst: _num(row.get(src), 4) for dst, src in mapping.items() if src in row.index}
    return out


def _build_estimates(symbol: str) -> dict:
    t = yf.Ticker(symbol)

    def safe(attr: str) -> Any:
        try:
            return getattr(t, attr)
        except Exception:
            logger.debug("yfinance %s unavailable for %s", attr, symbol)
            return None

    est_map = {"avg": "avg", "low": "low", "high": "high", "analysts": "numberOfAnalysts", "growth": "growth"}
    earnings = _estimate_table(safe("earnings_estimate"), {**est_map, "year_ago_eps": "yearAgoEps"})
    revenue = _estimate_table(safe("revenue_estimate"), {**est_map, "year_ago_revenue": "yearAgoRevenue"})
    growth = _estimate_table(safe("growth_estimates"), {"stock": "stockTrend", "index": "indexTrend"})

    targets_raw = safe("analyst_price_targets")
    targets = {k: _num(targets_raw.get(k), 4) for k in ("current", "low", "high", "mean", "median")} \
        if isinstance(targets_raw, dict) else {}

    trend = []
    rec = safe("recommendations_summary")
    if rec is not None and not getattr(rec, "empty", True):
        for _, row in rec.iterrows():
            trend.append({
                "period": str(row.get("period")),
                **{k: _clean(row.get(k)) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")},
            })

    ud: list[dict] = []
    ud_df = safe("upgrades_downgrades")
    if ud_df is not None and not getattr(ud_df, "empty", True):
        ud_df = ud_df.sort_index(ascending=False).head(10)
        for idx, row in ud_df.iterrows():
            ud.append({
                "date": _clean(idx),
                "firm": _clean(row.get("Firm")),
                "to_grade": _clean(row.get("ToGrade")),
                "from_grade": _clean(row.get("FromGrade")),
                "action": _clean(row.get("Action")),
            })

    if not (earnings or revenue or growth or any(v is not None for v in targets.values()) or trend or ud):
        return {"error": f"No analyst estimate data for {symbol}"}
    return _clean({
        "symbol": symbol,
        "earnings_estimate": earnings,
        "revenue_estimate": revenue,
        "growth_estimates": growth,
        "price_targets": targets,
        "recommendation_trend": trend,
        "upgrades_downgrades": ud,
    })


def get_analyst_estimates(symbol: str) -> dict:
    symbol = _norm_symbol(symbol)
    if not symbol:
        return {"error": "Symbol required"}
    return _cached("estimates", TTL_ESTIMATES, lambda: _build_estimates(symbol), symbol)


# ----------------------------------------------------------------------------
# Screeners
# ----------------------------------------------------------------------------

# whitelist key -> (yahoo field, operator)
_EQUITY_NUMERIC: dict[str, tuple[str, str]] = {
    "market_cap_min": ("intradaymarketcap", "gte"),
    "market_cap_max": ("intradaymarketcap", "lte"),
    "pe_min": ("peratio.lasttwelvemonths", "gte"),
    "pe_max": ("peratio.lasttwelvemonths", "lte"),
    "pb_max": ("pricebookratio.quarterly", "lte"),
    "eps_growth_min": ("epsgrowth.lasttwelvemonths", "gte"),
    "revenue_growth_min": ("quarterlyrevenuegrowth.quarterly", "gte"),
    "dividend_yield_min": ("forward_dividend_yield", "gte"),
    "debt_to_equity_max": ("totaldebtequity.lasttwelvemonths", "lte"),
    "beta_max": ("beta", "lte"),
    "avg_volume_min": ("avgdailyvol3m", "gte"),
    "price_min": ("intradayprice", "gte"),
}
# No Yahoo screener field exists for forward P/E: filtered client-side on quote data.
_EQUITY_CLIENT_SIDE = {"forward_pe_max"}
_EQUITY_CATEGORICAL = {"region", "exchange", "sector", "industry"}
EQUITY_FILTER_KEYS = sorted(set(_EQUITY_NUMERIC) | _EQUITY_CLIENT_SIDE | _EQUITY_CATEGORICAL)

_EQUITY_SORT: dict[str, str] = {
    "market_cap": "intradaymarketcap",
    "pe": "peratio.lasttwelvemonths",
    "pb": "pricebookratio.quarterly",
    "dividend_yield": "forward_dividend_yield",
    "eps_growth": "epsgrowth.lasttwelvemonths",
    "revenue_growth": "quarterlyrevenuegrowth.quarterly",
    "beta": "beta",
    "price": "intradayprice",
    "volume": "avgdailyvol3m",
}

_ETF_NUMERIC: dict[str, tuple[str, str]] = {
    "expense_ratio_max": ("annualreportnetexpenseratio", "lte"),
    "performance_rating_min": ("performanceratingoverall", "gte"),
    "price_min": ("intradayprice", "gte"),
}
_ETF_CATEGORICAL = {"region": "region", "exchange": "exchange", "category": "categoryname", "sector": "primary_sector"}
ETF_FILTER_KEYS = sorted(set(_ETF_NUMERIC) | set(_ETF_CATEGORICAL))
_ETF_SORT = {
    "net_assets": "fundnetassets",
    "expense_ratio": "annualreportnetexpenseratio",
    "price": "intradayprice",
    "volume": "avgdailyvol3m",
}

_MAX_SCREEN = 100


def _check_keys(filters: Optional[dict], allowed: list[str]) -> dict:
    filters = dict(filters or {})
    unknown = [k for k in filters if k not in allowed]
    if unknown:
        raise ValueError(f"Unknown filter(s): {', '.join(sorted(map(str, unknown)))}. Allowed: {', '.join(allowed)}")
    return {k: v for k, v in filters.items() if v is not None and v != "" and v != []}


def list_sector_keys() -> list[str]:
    try:
        from yfinance.const import SECTOR_INDUSTY_MAPPING_LC

        keys = sorted(SECTOR_INDUSTY_MAPPING_LC.keys())
        if keys:
            return keys
    except Exception:
        logger.debug("yfinance sector mapping unavailable, using static list")
    return [
        "basic-materials", "communication-services", "consumer-cyclical", "consumer-defensive",
        "energy", "financial-services", "healthcare", "industrials", "real-estate",
        "technology", "utilities",
    ]


def _sector_display_name(value: str) -> str:
    """'financial-services' / 'Financial Services' -> Yahoo's 'Financial Services'."""
    norm = str(value).strip().lower().replace("-", " ").replace("_", " ")
    try:
        from yfinance.const import SECTOR_INDUSTY_MAPPING

        for name in SECTOR_INDUSTY_MAPPING:
            if name.lower() == norm:
                return name
    except Exception:
        pass
    return " ".join(w.capitalize() for w in norm.split())


def _industry_display_name(value: str) -> str:
    norm = str(value).strip().lower().replace("-", " ").replace("_", " ")
    try:
        from yfinance.const import SECTOR_INDUSTY_MAPPING

        for inds in SECTOR_INDUSTY_MAPPING.values():
            for name in inds:
                n = name.lower().replace("-", " ").replace("_", " ")
                if n == norm or n.replace("&", "and") == norm.replace("&", "and"):
                    return name
    except Exception:
        pass
    return str(value).strip()


def _combine(query_cls: Any, op: str, operands: list) -> Any:
    return operands[0] if len(operands) == 1 else query_cls(op, operands)


def _is_in(query_cls: Any, field: str, values: Any, transform: Callable[[str], str]) -> Any:
    vals = [transform(str(v)) for v in (values if isinstance(values, (list, tuple, set)) else [values])]
    return _combine(query_cls, "or", [query_cls("eq", [field, v]) for v in vals])


def _build_equity_query(filters: dict) -> Any:
    Q = yf.EquityQuery
    operands: list = []
    if "region" in filters:
        operands.append(_is_in(Q, "region", filters["region"], str.lower))
    if "exchange" in filters:
        operands.append(_is_in(Q, "exchange", filters["exchange"], str.upper))
    if "sector" in filters:
        operands.append(Q("eq", ["sector", _sector_display_name(filters["sector"])]))
    if "industry" in filters:
        operands.append(Q("eq", ["industry", _industry_display_name(filters["industry"])]))
    for key, (field, op) in _EQUITY_NUMERIC.items():
        if key in filters:
            operands.append(Q(op, [field, float(filters[key])]))
    if not operands:
        operands.append(Q("gt", ["intradaymarketcap", 0]))
    return _combine(Q, "and", operands)


def _build_etf_query(filters: dict) -> Any:
    Q = yf.ETFQuery
    operands: list = []
    for key, field in _ETF_CATEGORICAL.items():
        if key in filters:
            tf = str.lower if key == "region" else (str.upper if key == "exchange" else str)
            operands.append(_is_in(Q, field, filters[key], tf))
    for key, (field, op) in _ETF_NUMERIC.items():
        if key in filters:
            operands.append(Q(op, [field, float(filters[key])]))
    if not operands:
        operands.append(Q("gt", ["intradayprice", 0]))
    return _combine(Q, "and", operands)


def _pct(value: Any) -> Optional[float]:
    return _num(value, 4)


def _map_quote(q: dict) -> dict:
    return {
        "symbol": q.get("symbol"),
        "name": q.get("longName") or q.get("shortName"),
        "sector": q.get("sector"),
        "industry": q.get("industry"),
        "market_cap": _num(q.get("marketCap"), 0),
        "price": _num(q.get("regularMarketPrice"), 4),
        "pe": _num(q.get("trailingPE"), 2),
        "forward_pe": _num(q.get("forwardPE"), 2),
        "pb": _num(q.get("priceToBook"), 2),
        "dividend_yield": _pct(q.get("dividendYield")),  # percent, as Yahoo reports it
        "eps_growth": _pct(q.get("epsGrowth")),  # rarely present in screener quotes
        "revenue_growth": _pct(q.get("revenueGrowth")),
        "exchange": q.get("fullExchangeName") or q.get("exchange"),
        "currency": q.get("currency"),
    }


def _map_etf_quote(q: dict) -> dict:
    out = _map_quote(q)
    out["expense_ratio"] = _num(q.get("netExpenseRatio"), 4)
    out["net_assets"] = _num(q.get("netAssets"), 0)
    out["ytd_return"] = _num(q.get("ytdReturn"), 4)
    return out


def _limit(limit: Any) -> int:
    try:
        return max(1, min(int(limit), _MAX_SCREEN))
    except (TypeError, ValueError):
        return 25


def _run_equity_screen(filters: dict, sort_by: str, sort_desc: bool, limit: int) -> dict:
    sort_field = _EQUITY_SORT[sort_by]
    fwd_max = filters.get("forward_pe_max")
    size = min(250, limit * 4) if fwd_max is not None else limit
    res = yf.screen(
        _build_equity_query(filters), size=size, sortField=sort_field, sortAsc=not sort_desc
    )
    quotes = (res or {}).get("quotes") or []
    rows = [_map_quote(q) for q in quotes]
    if fwd_max is not None:
        cap = float(fwd_max)
        rows = [r for r in rows if r["forward_pe"] is not None and 0 < r["forward_pe"] <= cap]
    rows = rows[:limit]
    return _clean({"count": len(rows), "total_matches": (res or {}).get("total"), "results": rows})


def screen_equities(
    filters: Optional[dict] = None,
    sort_by: str = "market_cap",
    sort_desc: bool = True,
    limit: int = 25,
) -> dict:
    clean_filters = _check_keys(filters, EQUITY_FILTER_KEYS)
    sort_by = str(sort_by or "market_cap")
    if sort_by not in _EQUITY_SORT:
        raise ValueError(f"Unknown sort_by '{sort_by}'. Allowed: {', '.join(sorted(_EQUITY_SORT))}")
    limit = _limit(limit)
    return _cached(
        "screen_equities", TTL_SCREEN,
        lambda: _run_equity_screen(clean_filters, sort_by, bool(sort_desc), limit),
        clean_filters, sort_by, bool(sort_desc), limit,
    )


def _run_etf_screen(filters: dict, limit: int) -> dict:
    res = yf.screen(
        _build_etf_query(filters), size=limit, sortField=_ETF_SORT["net_assets"], sortAsc=False
    )
    rows = [_map_etf_quote(q) for q in ((res or {}).get("quotes") or [])][:limit]
    return _clean({"count": len(rows), "total_matches": (res or {}).get("total"), "results": rows})


def screen_etfs(filters: Optional[dict] = None, limit: int = 25) -> dict:
    clean_filters = _check_keys(filters, ETF_FILTER_KEYS)
    limit = _limit(limit)
    return _cached(
        "screen_etfs", TTL_SCREEN, lambda: _run_etf_screen(clean_filters, limit), clean_filters, limit
    )


# ----------------------------------------------------------------------------
# Peers and sector overview
# ----------------------------------------------------------------------------

def _peer_market_cap(symbol: str) -> tuple[Optional[float], Optional[str]]:
    try:
        fi = yf.Ticker(symbol).fast_info
        return _num(fi["market_cap"], 0), fi["currency"]
    except Exception:
        logger.debug("fast_info unavailable for %s", symbol)
        return None, None


def _build_peers(symbol: str, n: int) -> dict:
    info = _raw_info(symbol)
    if not info or not (info.get("shortName") or info.get("longName")):
        return {"error": f"No data found for {symbol}"}
    industry = info.get("industry")
    industry_key = info.get("industryKey")
    sector = info.get("sector")
    own = _num(info.get("marketCap"), 0)
    own_currency = info.get("currency")

    # Primary: Yahoo's ranked industry top companies (globally relevant names).
    candidates: list[dict] = []
    if industry_key:
        try:
            top = yf.Industry(industry_key).top_companies
            if top is not None and not getattr(top, "empty", True):
                for sym, row in top.iterrows():
                    sym = _norm_symbol(sym)
                    if sym and sym != symbol:
                        candidates.append({"symbol": sym, "name": _clean(row.get("name")),
                                           "market_cap": None, "currency": None})
        except Exception:
            logger.exception("Industry lookup failed for %s", symbol)
    candidates = candidates[: max(n * 3, 12)]

    # Fallback: screen on the industry name (market caps are in listing currency).
    if not candidates and industry:
        try:
            res = yf.screen(
                yf.EquityQuery("and", [
                    yf.EquityQuery("eq", ["industry", industry]),
                    yf.EquityQuery("gt", ["intradaymarketcap", 0]),
                ]),
                size=40, sortField="intradaymarketcap", sortAsc=False,
            )
            for q in (res or {}).get("quotes") or []:
                sym = _norm_symbol(q.get("symbol"))
                if sym and sym != symbol:
                    candidates.append({
                        "symbol": sym, "name": q.get("longName") or q.get("shortName"),
                        "market_cap": _num(q.get("marketCap"), 0), "currency": q.get("currency"),
                    })
        except Exception:
            logger.exception("Peer screen failed for %s", symbol)

    for c in candidates:
        if c["market_cap"] is None:
            c["market_cap"], c["currency"] = _peer_market_cap(c["symbol"])

    # Prefer similar market cap; only compare like-for-like currencies when enough exist.
    if own and own > 0:
        same = [c for c in candidates if c.get("currency") == own_currency and c.get("market_cap")]
        pool = same if len(same) >= n else candidates

        def distance(c: dict) -> float:
            mc = c.get("market_cap")
            return abs(math.log(mc / own)) if mc and mc > 0 else float("inf")

        candidates = sorted(pool, key=distance)
    peers = [
        {"symbol": c["symbol"], "name": c["name"], "market_cap": c["market_cap"]}
        for c in candidates[: max(1, n)]
    ]
    return _clean({"symbol": symbol, "industry": industry, "sector": sector, "peers": peers})


def find_peers(symbol: str, n: int = 5) -> dict:
    symbol = _norm_symbol(symbol)
    if not symbol:
        return {"error": "Symbol required"}
    try:
        n = max(1, min(int(n), 20))
    except (TypeError, ValueError):
        n = 5
    return _cached("peers", TTL_SCREEN, lambda: _build_peers(symbol, n), symbol, n)


def _records(df: Any, index_name: str, columns: dict[str, str]) -> list[dict]:
    if df is None or getattr(df, "empty", True):
        return []
    out = []
    for idx, row in df.iterrows():
        rec = {index_name: _clean(idx)}
        for dst, src in columns.items():
            rec[dst] = _clean(row.get(src)) if src in row.index else None
        out.append(rec)
    return out


def _build_sector(sector_key: str, region: str) -> dict:
    s = yf.Sector(sector_key, region=region) if region and region != "US" else yf.Sector(sector_key)
    overview = s.overview if isinstance(s.overview, dict) else {}
    etfs = s.top_etfs if isinstance(s.top_etfs, dict) else {}
    out = {
        "key": sector_key,
        "name": getattr(s, "name", None),
        "overview": {k: v for k, v in overview.items() if k != "message_board_id"},
        "top_companies": _records(
            s.top_companies, "symbol", {"name": "name", "rating": "rating", "market_weight": "market weight"}
        ),
        "top_etfs": [{"symbol": k, "name": v} for k, v in etfs.items()],
        "industries": _records(s.industries, "key", {"name": "name", "market_weight": "market weight"}),
    }
    if not (out["top_companies"] or out["industries"] or out["overview"]):
        return {"error": f"No data for sector {sector_key}"}
    return _clean(out)


def get_sector_overview(sector_key: str, region: str = "US") -> dict:
    key = str(sector_key or "").strip().lower().replace("_", "-").replace(" ", "-")
    allowed = list_sector_keys()
    if key not in allowed:
        return {"error": f"Unknown sector key. Allowed: {', '.join(allowed)}"}
    region = str(region or "US").upper()
    return _cached("sector", TTL_SECTOR, lambda: _build_sector(key, region), key, region)


# ----------------------------------------------------------------------------
# News
# ----------------------------------------------------------------------------

def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc)
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, OSError, OverflowError):
        return None


def _map_news_entry(entry: Any) -> Optional[dict]:
    if not isinstance(entry, dict):
        return None
    content = entry.get("content") if isinstance(entry.get("content"), dict) else entry
    title = content.get("title")
    if not title:
        return None
    provider = content.get("provider")
    canonical = content.get("canonicalUrl") if isinstance(content.get("canonicalUrl"), dict) else {}
    click = content.get("clickThroughUrl") if isinstance(content.get("clickThroughUrl"), dict) else {}
    url = canonical.get("url") or click.get("url") or content.get("previewUrl") or content.get("link")
    published = _parse_dt(content.get("pubDate") or content.get("providerPublishTime"))
    source = provider.get("displayName") if isinstance(provider, dict) else content.get("publisher")
    summary = content.get("summary") or content.get("description")
    return {
        "title": str(title).strip(),
        "source": source,
        "published": published,
        "url": url,
        "summary": str(summary).strip()[:500] if summary else None,
    }


def _build_news(symbol: str, days: int, limit: int) -> dict:
    raw = yf.Ticker(symbol).get_news(count=min(100, max(limit * 3, 30))) or []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    seen: set[str] = set()
    items: list[dict] = []
    for entry in raw:
        item = _map_news_entry(entry)
        if item is None:
            continue
        key = " ".join(item["title"].lower().split())
        if key in seen:
            continue
        if item["published"] is not None and item["published"] < cutoff:
            continue
        seen.add(key)
        items.append(item)
    items.sort(key=lambda i: i["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    out = [
        {
            "title": i["title"], "source": i["source"],
            "date": i["published"].date().isoformat() if i["published"] else None,
            "url": i["url"], "summary": i["summary"],
        }
        for i in items[:limit]
    ]
    return _clean({"symbol": symbol, "items": out})


def get_news_digest(symbol: str, days: int = 30, limit: int = 20) -> dict:
    symbol = _norm_symbol(symbol)
    if not symbol:
        return {"error": "Symbol required"}
    try:
        days = max(1, min(int(days), 365))
    except (TypeError, ValueError):
        days = 30
    try:
        limit = max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        limit = 20
    return _cached("news", TTL_NEWS, lambda: _build_news(symbol, days, limit), symbol, days, limit)
