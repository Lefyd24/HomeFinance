"""Tools for the equity-research skill.

Thin wrappers over `app.services.market_research` (cached yfinance layer) plus a
deterministic two-stage DCF. The model chooses and justifies the DCF inputs; the
arithmetic happens here, never in the model.

Must not import `app.services.ai_service` (circular).
"""
import logging
import math
from typing import Any, Optional

from app.services import market_research

logger = logging.getLogger("app.ai")

NEEDS_USER_EMAIL: set[str] = set()

STATEMENTS = ("income", "balance", "cashflow")
PERIODS = ("annual", "quarterly")

# DCF input guard rails. Outside these the output would be arithmetic, not valuation.
MAX_GROWTH_YEARS = 15
GROWTH_RATE_RANGE = (-0.5, 0.5)
TERMINAL_GROWTH_RANGE = (-0.02, 0.05)
DISCOUNT_RATE_RANGE = (0.04, 0.20)
SENSITIVITY_DISCOUNT_STEPS = (-0.02, -0.01, 0.0, 0.01, 0.02)
SENSITIVITY_TERMINAL_STEPS = (-0.01, -0.005, 0.0, 0.005, 0.01)


# --- market data wrappers ------------------------------------------------------


def get_financial_statements_tool(
    db, user_id, symbol: str, statement: str = "income", period: str = "annual", years: int = 4
) -> dict:
    return market_research.get_financial_statements(symbol, statement, period, years)


def get_analyst_estimates_tool(db, user_id, symbol: str) -> dict:
    return market_research.get_analyst_estimates(symbol)


def find_peers_tool(db, user_id, symbol: str, n: int = 5) -> dict:
    return market_research.find_peers(symbol, n)


def get_news_digest_tool(db, user_id, symbol: str, days: int = 30) -> dict:
    result = market_research.get_news_digest(symbol, days=days)
    if isinstance(result, dict) and not result.get("error") and not result.get("items"):
        # Yahoo often returns nothing for non-US tickers: that is a gap, not "no news".
        result = {
            **result,
            "note": "No headlines returned. The news feed is unavailable or empty for this "
            "ticker; this does NOT mean nothing happened. State it as a data gap.",
        }
    return result


# --- DCF -----------------------------------------------------------------------


def _number(args: dict, name: str, default: Optional[float] = None) -> float:
    raw = args.get(name, default)
    if raw is None or isinstance(raw, bool):
        raise ValueError(f"{name} is required")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number") from None
    if math.isnan(value) or math.isinf(value):
        raise ValueError(f"{name} must be a finite number")
    return value


def _in_range(name: str, value: float, bounds: tuple[float, float]) -> None:
    lo, hi = bounds
    if not lo <= value <= hi:
        raise ValueError(
            f"{name}={value} is outside the sane range [{lo}, {hi}] (decimals: 0.08 = 8%)."
        )


def _value_per_share(
    fcf_base: float, g: float, years: int, tg: float, r: float, net_debt: float, shares: float
) -> dict:
    pv_explicit = 0.0
    fcf_t = fcf_base
    for t in range(1, years + 1):
        fcf_t = fcf_base * (1 + g) ** t
        pv_explicit += fcf_t / (1 + r) ** t
    terminal_value = fcf_t * (1 + tg) / (r - tg)
    pv_terminal = terminal_value / (1 + r) ** years
    ev = pv_explicit + pv_terminal
    equity = ev - net_debt
    return {
        "pv_explicit": pv_explicit,
        "terminal_value": terminal_value,
        "pv_terminal": pv_terminal,
        "enterprise_value": ev,
        "equity_value": equity,
        "per_share": equity / shares,
    }


def dcf_valuation(
    fcf_base: Any,
    growth_rate: Any,
    discount_rate: Any,
    shares_outstanding: Any,
    growth_years: Any = 5,
    terminal_growth: Any = 0.025,
    net_debt: Any = 0,
    currency: Optional[str] = None,
) -> dict:
    """Two-stage DCF. All rates are decimals. Raises ValueError on invalid input."""
    args = {
        "fcf_base": fcf_base,
        "growth_rate": growth_rate,
        "discount_rate": discount_rate,
        "shares_outstanding": shares_outstanding,
        "growth_years": growth_years,
        "terminal_growth": terminal_growth,
        "net_debt": net_debt,
    }
    fcf = _number(args, "fcf_base")
    g = _number(args, "growth_rate")
    r = _number(args, "discount_rate")
    shares = _number(args, "shares_outstanding")
    tg = _number(args, "terminal_growth", 0.025)
    debt = _number(args, "net_debt", 0)
    years_f = _number(args, "growth_years", 5)
    if years_f != int(years_f) or not 1 <= years_f <= MAX_GROWTH_YEARS:
        raise ValueError(f"growth_years must be a whole number from 1 to {MAX_GROWTH_YEARS}")
    years = int(years_f)

    if fcf <= 0:
        raise ValueError(
            "fcf_base must be positive. A DCF on negative or zero free cash flow is not "
            "meaningful: normalise the base (average of several years, or margin x revenue) "
            "or use multiples instead."
        )
    if shares <= 0:
        raise ValueError("shares_outstanding must be positive")
    _in_range("growth_rate", g, GROWTH_RATE_RANGE)
    _in_range("terminal_growth", tg, TERMINAL_GROWTH_RANGE)
    _in_range("discount_rate", r, DISCOUNT_RATE_RANGE)
    if r <= tg:
        raise ValueError("discount_rate must be greater than terminal_growth")
    if r - tg < 0.02 - 1e-9:
        raise ValueError(
            "discount_rate must exceed terminal_growth by at least 2 percentage points, "
            "otherwise the terminal value explodes and dominates the result."
        )

    base = _value_per_share(fcf, g, years, tg, r, debt, shares)

    grid_rows = []
    for dr_step in SENSITIVITY_DISCOUNT_STEPS:
        row = {"discount_rate": round(r + dr_step, 6), "values": []}
        for tg_step in SENSITIVITY_TERMINAL_STEPS:
            rr, tt = r + dr_step, tg + tg_step
            if rr <= tt or rr - tt < 0.01 or rr <= 0:
                row["values"].append(None)
            else:
                row["values"].append(
                    round(_value_per_share(fcf, g, years, tt, rr, debt, shares)["per_share"], 2)
                )
        grid_rows.append(row)

    ev = base["enterprise_value"]
    result = {
        "currency": currency,
        "inputs": {
            "fcf_base": fcf,
            "growth_rate": g,
            "growth_years": years,
            "terminal_growth": tg,
            "discount_rate": r,
            "net_debt": debt,
            "shares_outstanding": shares,
        },
        "enterprise_value": round(ev, 2),
        "equity_value": round(base["equity_value"], 2),
        "value_per_share": round(base["per_share"], 2),
        "pv_explicit_fcf": round(base["pv_explicit"], 2),
        "terminal_value": round(base["terminal_value"], 2),
        "pv_terminal_value": round(base["pv_terminal"], 2),
        "terminal_value_share_of_ev": round(base["pv_terminal"] / ev, 4) if ev else None,
        "sensitivity": {
            "metric": "value_per_share",
            "terminal_growth_columns": [round(tg + s, 6) for s in SENSITIVITY_TERMINAL_STEPS],
            "rows": grid_rows,
            "note": "Rows: discount rate +/-1pp and 2pp. Columns: terminal growth "
            "+/-0.5pp and 1pp. null = combination too close to be meaningful.",
        },
    }
    warnings = []
    share = result["terminal_value_share_of_ev"]
    if share and share > 0.75:
        warnings.append(
            "Terminal value is over 75% of enterprise value: the result mostly reflects "
            "the terminal assumptions, treat it as low-confidence."
        )
    if base["equity_value"] <= 0:
        warnings.append("Net debt exceeds enterprise value: equity value is not positive.")
    if warnings:
        result["warnings"] = warnings
    return result


def dcf_valuation_tool(db, user_id, **kwargs) -> dict:
    try:
        return dcf_valuation(**kwargs)
    except ValueError as exc:
        return {"error": str(exc)}
    except TypeError:
        return {
            "error": "Required: fcf_base, growth_rate, discount_rate, shares_outstanding "
            "(optional: growth_years, terminal_growth, net_debt, currency)."
        }


# --- schemas -------------------------------------------------------------------

_SYMBOL = {
    "type": "string",
    "description": "Yahoo Finance ticker, e.g. AAPL, ASML.AS, SAP.DE, VWCE.DE.",
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_financial_statements_tool",
            "description": (
                "Income statement, balance sheet or cash flow for a company (about 20 key "
                "lines per period, oldest to newest) plus derived growth and margin rows "
                "(revenue_growth, gross/operating/net margin, fcf, fcf_margin). Values are in "
                "the statement currency returned in `currency`. Some lines are missing for "
                "non-US tickers."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": _SYMBOL,
                    "statement": {"type": "string", "enum": list(STATEMENTS)},
                    "period": {"type": "string", "enum": list(PERIODS), "default": "annual"},
                    "years": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10,
                        "default": 4,
                        "description": "Years of history (quarterly returns 4 quarters per year).",
                    },
                },
                "required": ["symbol", "statement"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_analyst_estimates_tool",
            "description": (
                "Analyst consensus: EPS and revenue estimates per period (avg/low/high, analyst "
                "count, growth), growth estimates vs index, price-target range, "
                "recommendation trend and recent upgrades/downgrades. Always attribute these "
                "to analysts; they are not forecasts of the assistant. European tickers often "
                "lack upgrades/downgrades."
            ),
            "parameters": {
                "type": "object",
                "properties": {"symbol": _SYMBOL},
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_peers_tool",
            "description": (
                "Same-industry companies of similar size to use as comparables. Market caps "
                "are in each peer's listing currency. Follow with compare_symbols_tool or "
                "get_company_research_tool for the multiples."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": _SYMBOL,
                    "n": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5},
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dcf_valuation_tool",
            "description": (
                "Deterministic two-stage discounted-cash-flow valuation. You choose and "
                "justify the inputs; this tool does the arithmetic and returns enterprise "
                "value, equity value, value per share, PV breakdown, terminal value share of "
                "EV and a discount-rate x terminal-growth sensitivity grid. All rates are "
                "decimals (0.08 = 8%). Money inputs must share one currency (the statement "
                "currency). Returns {error} on invalid inputs (e.g. discount rate not above "
                "terminal growth, non-positive FCF)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "fcf_base": {
                        "type": "number",
                        "description": "Normalised free cash flow of the last year, in absolute "
                        "currency units (not thousands), must be positive.",
                    },
                    "growth_rate": {
                        "type": "number",
                        "description": "Annual FCF growth during the explicit period, decimal "
                        "(-0.5 to 0.5).",
                    },
                    "growth_years": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": MAX_GROWTH_YEARS,
                        "default": 5,
                    },
                    "terminal_growth": {
                        "type": "number",
                        "default": 0.025,
                        "description": "Perpetual growth after the explicit period, decimal "
                        "(-0.02 to 0.05); stay at or below long-run nominal GDP.",
                    },
                    "discount_rate": {
                        "type": "number",
                        "description": "Required return / WACC-like rate, decimal (0.04 to 0.20), "
                        "at least 2pp above terminal_growth.",
                    },
                    "net_debt": {
                        "type": "number",
                        "default": 0,
                        "description": "Total debt minus cash, absolute units; negative if net "
                        "cash.",
                    },
                    "shares_outstanding": {
                        "type": "number",
                        "description": "Diluted shares outstanding, absolute count.",
                    },
                    "currency": {"type": "string", "description": "Currency label, e.g. EUR."},
                },
                "required": ["fcf_base", "growth_rate", "discount_rate", "shares_outstanding"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_news_digest_tool",
            "description": (
                "Deduplicated recent headlines with summaries and dates for a ticker. The feed "
                "may come back empty (especially non-US tickers): treat that as unavailable, "
                "not as 'no news'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": _SYMBOL,
                    "days": {"type": "integer", "minimum": 1, "maximum": 365, "default": 30},
                },
                "required": ["symbol"],
            },
        },
    },
]

DISPATCH = {
    "get_financial_statements_tool": get_financial_statements_tool,
    "get_analyst_estimates_tool": get_analyst_estimates_tool,
    "find_peers_tool": find_peers_tool,
    "dcf_valuation_tool": dcf_valuation_tool,
    "get_news_digest_tool": get_news_digest_tool,
}
