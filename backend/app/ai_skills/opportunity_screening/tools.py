"""Tools for the opportunity-screening skill.

Screens run through `app.services.market_research` (whitelisted filters, so the model
never writes free-form query syntax). `portfolio_fit_tool` measures how a candidate
sits next to what the user already holds, using the app's cached price history.

Must not import `app.services.ai_service` (circular).
"""
import logging
import math
from datetime import date, timedelta
from typing import Any, Optional

import pandas as pd

from app.services import market_research, portfolio_analytics_service
from app.services.market_data import get_price_history, yahoo_candidates
from app.services.position_history_service import get_symbol_override

logger = logging.getLogger("app.ai")

NEEDS_USER_EMAIL: set[str] = set()

MAX_FIT_SYMBOLS = 8
MAX_HOLDINGS_FOR_FIT = 10  # the largest holdings drive the correlation and sector maths
LOOKBACK_DAYS = 365
MIN_OBSERVATIONS = 60

#: index families used to spot ETFs that track (nearly) the same thing; name based heuristic.
#: keyword in fund name -> family. World-wide indices are one family: they overlap ~90%.
_INDEX_FAMILIES = {
    "S&P 500": "sp500", "MSCI WORLD": "world", "MSCI ACWI": "world", "ALL-WORLD": "world",
    "ALL WORLD": "world", "NASDAQ": "nasdaq", "STOXX": "stoxx", "MSCI EMERGING": "em",
    "MSCI EUROPE": "europe", "RUSSELL": "russell", "DAX": "dax", "FTSE 100": "ftse100",
    "TOTAL MARKET": "us-total",
}
_BROAD_FAMILIES = {"sp500", "world", "us-total"}

STOCK_SORT_VALUES = [
    "market_cap", "pe", "pb", "dividend_yield", "eps_growth", "revenue_growth",
    "beta", "price", "volume",
]


# --- screens -------------------------------------------------------------------


def screen_stocks_tool(
    db,
    user_id,
    filters: Optional[dict] = None,
    sort_by: str = "market_cap",
    sort_desc: bool = True,
    limit: int = 25,
) -> dict:
    try:
        return market_research.screen_equities(filters or {}, sort_by, bool(sort_desc), limit)
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception:
        logger.exception("screen_stocks_tool failed")
        return {"error": "Market data unavailable"}


def screen_etfs_tool(db, user_id, filters: Optional[dict] = None, limit: int = 15) -> dict:
    try:
        return market_research.screen_etfs(filters or {}, limit)
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception:
        logger.exception("screen_etfs_tool failed")
        return {"error": "Market data unavailable"}


def get_sector_overview_tool(db, user_id, sector_key: str, region: str = "US") -> dict:
    return market_research.get_sector_overview(sector_key, region)


# --- portfolio fit -------------------------------------------------------------


def _norm(symbol: Any) -> str:
    return str(symbol or "").strip().upper()


def _load_holdings(db, user_id) -> list[dict]:
    """The user's holdings as [{symbol, yahoo, name, weight_pct}], largest first, merged
    across accounts. `yahoo` is the best-guess Yahoo ticker (pinned override first)."""
    result = portfolio_analytics_service.portfolio_positions(db, user_id)
    rows = result.get("positions") or []
    if not rows:
        return []
    provider = {
        a.id: a.provider for a in portfolio_analytics_service.get_investment_accounts(db, user_id)
    }
    merged: dict[str, dict] = {}
    for row in rows:
        broker = _norm(row.get("symbol"))
        if not broker:
            continue
        yahoo = get_symbol_override(db, row["account_id"], row["symbol"])
        if not yahoo:
            candidates = yahoo_candidates(row["symbol"], provider.get(row["account_id"]))
            yahoo = candidates[0] if candidates else row["symbol"]
        yahoo = _norm(yahoo)
        entry = merged.setdefault(
            yahoo,
            {"symbol": broker, "yahoo": yahoo, "name": row.get("name"), "weight_pct": 0.0},
        )
        entry["weight_pct"] += float(row.get("weight_pct") or 0.0)
    return sorted(merged.values(), key=lambda h: -h["weight_pct"])


def _returns(db, symbol: str) -> Optional[pd.Series]:
    end = date.today()
    try:
        frame = get_price_history([symbol], end - timedelta(days=LOOKBACK_DAYS), end, db=db)[
            _norm(symbol)
        ]
    except Exception:
        logger.info("fit: no price history for %s", symbol)
        return None
    close = frame["close"].dropna()
    ret = close.pct_change().dropna()
    return ret if len(ret) else None


def _portfolio_returns(holding_returns: dict[str, pd.Series], weights: dict[str, float]) -> Optional[pd.Series]:
    if not holding_returns:
        return None
    frame = pd.DataFrame(holding_returns)
    w = pd.Series({k: weights[k] for k in frame.columns})
    available = frame.notna().mul(w, axis=1).sum(axis=1)
    weighted = frame.fillna(0.0).mul(w, axis=1).sum(axis=1)
    out = (weighted / available.where(available > 0)).dropna()
    return out if len(out) else None


def _corr(a: Optional[pd.Series], b: Optional[pd.Series]) -> tuple[Optional[float], int]:
    if a is None or b is None:
        return None, 0
    joined = pd.concat([a, b], axis=1, join="inner").dropna()
    n = len(joined)
    if n < MIN_OBSERVATIONS:
        return None, n
    value = joined.iloc[:, 0].corr(joined.iloc[:, 1])
    if value is None or math.isnan(value):
        return None, n
    return round(float(value), 3), n


def _label(corr: Optional[float]) -> Optional[str]:
    if corr is None:
        return None
    if corr >= 0.8:
        return "high (adds little diversification)"
    if corr >= 0.5:
        return "moderate"
    return "low (diversifying)"


def _index_keys(name: Optional[str]) -> set[str]:
    upper = (name or "").upper()
    return {family for keyword, family in _INDEX_FAMILIES.items() if keyword in upper}


def portfolio_fit_tool(
    db, user_id, symbols: Optional[list] = None, position_pct: float = 5.0
) -> dict:
    cleaned: list[str] = []
    for s in symbols or []:
        n = _norm(s)
        if n and n not in cleaned:
            cleaned.append(n)
    if not cleaned:
        return {"error": "Give at least one symbol."}
    if len(cleaned) > MAX_FIT_SYMBOLS:
        return {"error": f"At most {MAX_FIT_SYMBOLS} symbols per call."}
    try:
        x = float(position_pct)
    except (TypeError, ValueError):
        return {"error": "position_pct must be a number."}
    if not 0 < x <= 50:
        return {"error": "position_pct must be between 0 and 50."}

    holdings = _load_holdings(db, user_id)
    top = holdings[:MAX_HOLDINGS_FOR_FIT]
    weights = {h["yahoo"]: h["weight_pct"] for h in top}
    total_weight = sum(h["weight_pct"] for h in holdings)
    held_ids = {h["yahoo"] for h in holdings} | {h["symbol"] for h in holdings}
    held_bases = {i.split(".")[0] for i in held_ids}

    watch = db_watchlist(db, user_id)

    holding_returns: dict[str, pd.Series] = {}
    holding_info: dict[str, dict] = {}
    for h in top:
        series = _returns(db, h["yahoo"])
        if series is not None:
            holding_returns[h["yahoo"]] = series
        info = market_research.get_info(h["yahoo"])
        holding_info[h["yahoo"]] = info if isinstance(info, dict) and not info.get("error") else {}
    port_ret = _portfolio_returns(holding_returns, weights)

    sector_weight: dict[str, float] = {}
    known_sector_weight = 0.0
    for h in top:
        sector = holding_info.get(h["yahoo"], {}).get("sector")
        if sector:
            sector_weight[sector] = sector_weight.get(sector, 0.0) + h["weight_pct"]
            known_sector_weight += h["weight_pct"]
    largest = max((h["weight_pct"] for h in holdings), default=0.0)
    held_funds = [
        h for h in top if str(holding_info.get(h["yahoo"], {}).get("quoteType", "")).upper() in ("ETF", "MUTUALFUND")
    ]

    results = []
    for symbol in cleaned:
        info = market_research.get_info(symbol)
        info = info if isinstance(info, dict) and not info.get("error") else {}
        entry: dict[str, Any] = {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName"),
            "type": info.get("quoteType"),
            "sector": info.get("sector"),
            "currency": info.get("currency"),
        }
        if not info:
            entry["warning"] = "No market data found for this symbol; metrics below are limited."
        entry["already_held"] = symbol in held_ids
        entry["possible_other_listing_held"] = (
            symbol not in held_ids and symbol.split(".")[0] in held_bases
        )
        entry["on_watchlist"] = symbol in watch

        cand_ret = _returns(db, symbol)
        corr, n = _corr(cand_ret, port_ret)
        entry["correlation_with_portfolio"] = corr
        entry["correlation_label"] = _label(corr)
        entry["correlation_observations"] = n
        if corr is None:
            entry["correlation_note"] = (
                "Not computed: no portfolio holdings, or fewer than "
                f"{MIN_OBSERVATIONS} overlapping trading days of price history."
            )
        else:
            entry["correlation_note"] = (
                f"Daily returns over the last year vs the weighted top {len(holding_returns)} "
                "holdings (in each instrument's own currency; FX moves are not included)."
            )

        pair = []
        for h in top:
            c, _ = _corr(cand_ret, holding_returns.get(h["yahoo"]))
            if c is not None:
                pair.append({"symbol": h["symbol"], "correlation": c, "weight_pct": round(h["weight_pct"], 2)})
        pair.sort(key=lambda p: -p["correlation"])
        entry["most_correlated_holdings"] = pair[:3]

        # concentration after a hypothetical position of x% of the portfolio
        entry["hypothetical_position_pct"] = x
        entry["largest_position_after_pct"] = round(max(largest * (1 - x / 100), x), 2)
        sector = entry["sector"]
        if sector and known_sector_weight:
            before = sector_weight.get(sector, 0.0) / total_weight * 100 if total_weight else 0.0
            entry["sector_weight_before_pct"] = round(before, 2)
            entry["sector_weight_after_pct"] = round(before * (1 - x / 100) + x, 2)
            entry["sector_note"] = (
                f"Sector weights known for {round(known_sector_weight / total_weight * 100)}% "
                "of the portfolio (largest holdings only)."
                if total_weight
                else None
            )
        elif sector:
            entry["sector_note"] = "Holdings' sectors could not be determined."

        # overlap heuristics
        is_fund = str(info.get("quoteType", "")).upper() in ("ETF", "MUTUALFUND")
        keys = _index_keys(entry["name"])
        overlaps = []
        for h in held_funds:
            held_keys = _index_keys(h["name"] or holding_info.get(h["yahoo"], {}).get("longName"))
            c, _ = _corr(cand_ret, holding_returns.get(h["yahoo"]))
            if is_fund and ((keys & held_keys) or (c is not None and c >= 0.9)):
                overlaps.append(
                    {"symbol": h["symbol"], "weight_pct": round(h["weight_pct"], 2), "correlation": c}
                )
        if is_fund:
            entry["etf_overlap_with_held_funds"] = overlaps
            if overlaps:
                entry["overlap_note"] = (
                    "Heuristic: same index keyword in the name or correlation >= 0.9. "
                    "Likely a duplicate rather than diversification."
                )
        else:
            broad = [
                h["symbol"]
                for h in held_funds
                if _index_keys(h["name"]) & _BROAD_FAMILIES
            ]
            if broad:
                entry["indirect_exposure_note"] = (
                    f"Held broad index funds ({', '.join(broad)}) probably already contain "
                    "this company if it is a large cap; the real new weight is higher than "
                    "the direct position alone."
                )
        results.append(entry)

    return {
        "portfolio_holdings_considered": len(top),
        "portfolio_has_holdings": bool(holdings),
        "results": results,
    }


def db_watchlist(db, user_id) -> set[str]:
    from app.models import SavedWatch

    try:
        rows = db.query(SavedWatch).filter(SavedWatch.user_id == user_id).all()
    except Exception:
        logger.exception("fit: watchlist lookup failed")
        return set()
    return {_norm(r.symbol) for r in rows}


# --- schemas -------------------------------------------------------------------

_EQUITY_FILTERS = {
    "type": "object",
    "additionalProperties": False,
    "description": "Screen filters. Only these keys exist. Percent-style fields are in PERCENT "
    "(dividend_yield_min=3 means 3%, eps_growth_min=15 means 15%). Omit what you do not need.",
    "properties": {
        "region": {
            "anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}],
            "description": "Lowercase ISO country code(s): us, gb, de, fr, nl, gr, ch, jp...",
        },
        "exchange": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Yahoo exchange codes, e.g. NMS, NYQ, AMS, GER, LSE.",
        },
        "sector": {
            "type": "string",
            "description": "Sector key, e.g. technology, healthcare, financial-services "
            "(see get_sector_overview_tool for the list).",
        },
        "industry": {"type": "string", "description": "Yahoo industry name, e.g. Semiconductors."},
        "market_cap_min": {"type": "number", "description": "Minimum market cap, absolute currency units."},
        "market_cap_max": {"type": "number", "description": "Maximum market cap, absolute currency units."},
        "pe_min": {"type": "number", "description": "Minimum trailing P/E."},
        "pe_max": {"type": "number", "description": "Maximum trailing P/E."},
        "forward_pe_max": {"type": "number", "description": "Maximum forward P/E (applied after the screen on a limited candidate pool)."},
        "pb_max": {"type": "number", "description": "Maximum price/book."},
        "eps_growth_min": {"type": "number", "description": "Minimum trailing EPS growth, percent."},
        "revenue_growth_min": {"type": "number", "description": "Minimum quarterly revenue growth, percent."},
        "dividend_yield_min": {"type": "number", "description": "Minimum forward dividend yield, percent."},
        "debt_to_equity_max": {"type": "number", "description": "Maximum debt/equity, percent (Yahoo style: 100 = 1.0x)."},
        "beta_max": {"type": "number", "description": "Maximum beta."},
        "avg_volume_min": {"type": "number", "description": "Minimum 3-month average daily volume (shares)."},
        "price_min": {"type": "number", "description": "Minimum share price."},
    },
}

_ETF_FILTERS = {
    "type": "object",
    "additionalProperties": False,
    "description": "ETF screen filters. Only these keys exist.",
    "properties": {
        "region": {
            "anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}],
            "description": "Lowercase ISO country code(s) of the listing.",
        },
        "exchange": {"type": "array", "items": {"type": "string"}},
        "category": {"type": "string", "description": "Morningstar-style category name, e.g. Large Blend, World Large Stock."},
        "sector": {"type": "string", "description": "Primary sector for sector ETFs."},
        "expense_ratio_max": {"type": "number", "description": "Maximum annual net expense ratio, percent (0.2 = 0.2%)."},
        "performance_rating_min": {"type": "number", "description": "Minimum Morningstar-style performance rating, 1-5."},
        "price_min": {"type": "number"},
    },
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "screen_stocks_tool",
            "description": (
                "Screen listed equities with whitelisted filters and return candidates "
                "(symbol, name, market cap, price, P/E, forward P/E, P/B, dividend yield, "
                "exchange, currency). Results do NOT reliably include sector, industry or "
                "growth: use get_company_research_tool for those. Market caps are in listing "
                "currency. Unknown filter keys return {error}. Screens are cached for an hour."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filters": _EQUITY_FILTERS,
                    "sort_by": {"type": "string", "enum": STOCK_SORT_VALUES, "default": "market_cap"},
                    "sort_desc": {"type": "boolean", "default": True},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "screen_etfs_tool",
            "description": (
                "Screen ETFs with whitelisted filters (largest funds first): symbol, name, "
                "price, expense ratio, net assets, YTD return, exchange, currency. Unknown "
                "filter keys return {error}."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filters": _ETF_FILTERS,
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 15},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sector_overview_tool",
            "description": (
                "Sector snapshot: market weight, top companies, top ETFs and industries. "
                "Use it to see where a sector's large names and funds are before screening."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sector_key": {
                        "type": "string",
                        "description": "One of: basic-materials, communication-services, "
                        "consumer-cyclical, consumer-defensive, energy, financial-services, "
                        "healthcare, industrials, real-estate, technology, utilities.",
                    },
                    "region": {"type": "string", "default": "US", "description": "Region code, e.g. US."},
                },
                "required": ["sector_key"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "portfolio_fit_tool",
            "description": (
                "For up to 8 candidate symbols: is it already held or on the watchlist, "
                "correlation of its last-year daily returns with the current portfolio and "
                "with the most similar holdings, ETF overlap heuristics, and sector and "
                "largest-position concentration after a hypothetical position of "
                "position_pct of the portfolio. Read-only, nothing is traded."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbols": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "maxItems": MAX_FIT_SYMBOLS,
                        "description": "Yahoo tickers of the candidates.",
                    },
                    "position_pct": {
                        "type": "number",
                        "default": 5.0,
                        "description": "Hypothetical position size as a percent of the portfolio (0-50).",
                    },
                },
                "required": ["symbols"],
            },
        },
    },
]

DISPATCH = {
    "screen_stocks_tool": screen_stocks_tool,
    "screen_etfs_tool": screen_etfs_tool,
    "get_sector_overview_tool": get_sector_overview_tool,
    "portfolio_fit_tool": portfolio_fit_tool,
}
