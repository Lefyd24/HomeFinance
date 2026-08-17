"""Investment tools for the AI advisor: what you hold, and what's true about a ticker.

Split in two halves. The portfolio half reads the user's own holdings through
`portfolio_analytics_service`, which does all the arithmetic. The research half
is a thin skin over services that already exist — `comparison_service`,
`technical_service`, the Yahoo provider — so the advisor reaches the same numbers
the investments pages show, rather than a second, divergent set.

Same contract as `ai_tools.py`: `(db, user_id, ...)`, `user_id` injected by the
router from the authenticated user and never exposed in a JSON schema.
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Account, InvestmentTransaction, SavedWatch
from app.services import (
    comparison_service,
    portfolio_analytics_service,
    technical_service,
)
from app.services.investment_providers.yahoo import yahoo_market_data
from app.services.market_data import MarketDataUnavailable, SymbolNotFound
from app.services.position_history_service import DEFAULT_RANGE, build_position_history

logger = logging.getLogger("app.ai")

MAX_INVESTMENT_TRANSACTIONS = 200
MAX_NEWS_ITEMS = 15
MAX_COMPARE_SYMBOLS = 5

RESEARCH_SECTIONS = ("profile", "fundamentals", "analyst", "news", "fund_holdings", "earnings")


# --- portfolio -------------------------------------------------------------


def get_portfolio_overview_tool(db: Session, user_id: int) -> dict:
    """Total value, cost, unrealized P&L and day change across investment accounts."""
    return portfolio_analytics_service.portfolio_overview(db, user_id)


def get_positions_tool(
    db: Session,
    user_id: int,
    account_id: Optional[int] = None,
    min_weight_pct: Optional[float] = None,
) -> dict:
    """Individual holdings with their portfolio weights."""
    return portfolio_analytics_service.portfolio_positions(
        db, user_id, account_id=account_id, min_weight_pct=min_weight_pct
    )


def get_portfolio_allocation_tool(db: Session, user_id: int, top_n: int = 10) -> dict:
    """Concentration, asset-class split, currency exposure and cash weight."""
    return portfolio_analytics_service.portfolio_allocation(db, user_id, top_n=top_n)


def get_portfolio_risk_tool(
    db: Session,
    user_id: int,
    period: str = "1y",
    benchmark: Optional[str] = None,
) -> dict:
    """Volatility, drawdown, VaR, Sharpe/Sortino and beta for the whole portfolio."""
    return portfolio_analytics_service.portfolio_risk(
        db, user_id, period=period, benchmark=benchmark
    )


def _user_account_ids(db: Session, user_id: int) -> list[int]:
    return [a.id for a in portfolio_analytics_service.get_investment_accounts(db, user_id)]


def get_investment_transactions_tool(
    db: Session,
    user_id: int,
    symbol: Optional[str] = None,
    type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """Broker activity: trades, dividends, fees and cash movements."""
    from datetime import datetime

    account_ids = _user_account_ids(db, user_id)
    if not account_ids:
        return {"transactions": [], "count": 0, "note": "No investment accounts are connected."}

    query = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.account_id.in_(account_ids)
    )
    if symbol:
        query = query.filter(InvestmentTransaction.symbol == symbol.strip().upper())
    if type:
        query = query.filter(InvestmentTransaction.type == type.strip().lower())
    if start_date:
        query = query.filter(
            InvestmentTransaction.date >= datetime.fromisoformat(start_date)
        )
    if end_date:
        query = query.filter(
            InvestmentTransaction.date
            <= datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59)
        )

    total = query.count()
    clamped = max(1, min(int(limit or 50), MAX_INVESTMENT_TRANSACTIONS))
    rows = (
        query.order_by(InvestmentTransaction.date.desc()).limit(clamped).all()
    )

    # Fees and dividends totalled separately — they are the two figures people
    # most often want and most often can't get from a raw transaction list.
    totals: dict[str, float] = {}
    for row in query.all():
        totals[row.type] = totals.get(row.type, 0.0) + (row.amount or 0.0)

    return {
        "count": total,
        "returned": len(rows),
        "totals_by_type": {k: round(v, 2) for k, v in sorted(totals.items())},
        "transactions": [
            {
                "date": row.date.isoformat() if row.date else None,
                "type": row.type,
                "symbol": row.symbol,
                "quantity": row.quantity,
                "price": row.price,
                "amount": round(row.amount, 2) if row.amount is not None else None,
                "currency": row.currency,
            }
            for row in rows
        ],
        "amount_note": (
            "Amounts are signed from the account's perspective: negative when cash left "
            "(a buy, a fee), positive when it arrived (a sale, a dividend)."
        ),
    }


def get_position_history_tool(
    db: Session,
    user_id: int,
    symbol: str,
    range: str = DEFAULT_RANGE,
) -> dict:
    """How one holding's value, cost and realized P&L moved over time."""
    accounts = portfolio_analytics_service.get_investment_accounts(db, user_id)
    if not accounts:
        return {"error": "No investment accounts are connected."}

    wanted = (symbol or "").strip().upper()
    from app.models import PortfolioPosition

    position = (
        db.query(PortfolioPosition)
        .filter(
            PortfolioPosition.account_id.in_([a.id for a in accounts]),
            PortfolioPosition.symbol == wanted,
        )
        .first()
    )
    if position is None:
        held = [
            p.symbol
            for p in db.query(PortfolioPosition)
            .filter(PortfolioPosition.account_id.in_([a.id for a in accounts]))
            .all()
        ]
        return {
            "error": f"{wanted} is not currently held.",
            "symbols_held": sorted(held),
        }

    account = next(a for a in accounts if a.id == position.account_id)
    try:
        history = build_position_history(db, account, wanted, range_key=range)
    except Exception as exc:
        logger.warning("Position history failed for %s: %s", wanted, exc)
        return {"error": f"Could not build history for {wanted}: {exc}"}

    plain = _as_plain(history)

    # A multi-year daily series is thousands of rows — far too much for a prompt,
    # and the model does not need every day to describe the arc. Thin it to ~24
    # evenly spaced points, always keeping the last one so "where it stands now"
    # stays exact.
    points = plain.get("points")
    if isinstance(points, list) and len(points) > 24:
        step = max(1, len(points) // 24)
        thinned = points[::step]
        if thinned[-1] is not points[-1]:
            thinned.append(points[-1])
        plain["points"] = thinned
        plain["points_downsampled_from"] = len(points)
    return plain


def get_watchlist_tool(db: Session, user_id: int) -> dict:
    """Tickers the user is tracking but does not necessarily hold."""
    rows = (
        db.query(SavedWatch)
        .filter(SavedWatch.user_id == user_id)
        .order_by(SavedWatch.created_at.desc())
        .all()
    )
    return {
        "watchlist": [
            {
                "symbol": row.symbol,
                "name": row.name,
                "last_price": row.last_price,
                "day_change_pct": row.day_change_pct,
                "notes": row.notes,
            }
            for row in rows
        ],
        "count": len(rows),
    }


# --- research --------------------------------------------------------------


def search_symbols_tool(db: Session, user_id: int, query: str) -> dict:
    """Resolve a company or fund name to a ticker."""
    text = (query or "").strip()
    if not text:
        return {"error": "query must not be empty."}
    try:
        results = yahoo_market_data.search_symbols(text)
    except Exception as exc:
        logger.warning("Symbol search failed for %r: %s", text, exc)
        return {"error": f"Symbol search failed: {exc}"}

    return {
        "results": [
            {
                "symbol": r.symbol,
                "name": r.name,
                "exchange": r.exchange,
                "instrument_type": r.instrument_type,
                "currency": r.currency,
            }
            for r in results[:10]
        ]
    }


def get_company_research_tool(
    db: Session,
    user_id: int,
    symbol: str,
    include: Optional[list] = None,
) -> dict:
    """Profile, fundamentals, analyst view, news and fund holdings for a ticker.

    One tool with a section list rather than five tools, so the model has fewer
    choices to get wrong and can ask for only what it needs.
    """
    wanted = (symbol or "").strip().upper()
    if not wanted:
        return {"error": "symbol must not be empty."}

    sections = [s.strip().lower() for s in (include or ["profile", "fundamentals", "analyst"])]
    unknown = [s for s in sections if s not in RESEARCH_SECTIONS]
    if unknown:
        return {
            "error": f"Unknown section(s): {', '.join(unknown)}. "
            f"Allowed: {', '.join(RESEARCH_SECTIONS)}"
        }

    result: dict = {"symbol": wanted, "sections_requested": sections}
    unavailable: list[str] = []

    # The profile call carries profile, fundamentals, analyst, fund holdings and
    # earnings surprises in one response, so it is fetched once if any of those
    # sections was asked for.
    profile_sections = {"profile", "fundamentals", "analyst", "fund_holdings", "earnings"}
    if profile_sections & set(sections):
        try:
            profile = yahoo_market_data.get_company_profile(wanted)
        except (SymbolNotFound, MarketDataUnavailable) as exc:
            return {"error": f"No market data for {wanted}: {exc}"}
        except Exception as exc:
            logger.warning("Company profile failed for %s: %s", wanted, exc)
            return {"error": f"Could not fetch {wanted}: {exc}"}

        if profile is None:
            return {"error": f"No company data found for {wanted}."}

        block = profile if isinstance(profile, dict) else profile.__dict__

        # Only hand over the sections that were asked for — a full profile is
        # large, and the unrequested half would crowd out the rest of the answer.
        # Key names mirror investment_providers/yahoo.py::get_company_profile
        # exactly — a typo here silently drops a metric rather than erroring.
        selectors = {
            "profile": (
                "symbol", "name", "short_name", "exchange", "quote_type", "currency",
                "sector", "industry", "website", "country", "city", "employees", "summary",
                "current_price", "previous_close", "open", "day_high", "day_low", "volume",
                "average_volume", "fifty_two_week_high", "fifty_two_week_low",
                "day_change_pct", "market_cap", "beta", "first_trade_date",
            ),
            "fundamentals": (
                "trailing_pe", "forward_pe", "price_to_book", "peg_ratio", "price_to_sales",
                "ev_to_ebitda", "ev_to_sales", "fcf_yield", "roe", "return_on_assets",
                "gross_margin", "operating_margin", "profit_margin", "revenue_growth",
                "earnings_growth", "payout_ratio", "dividend_yield", "debt_to_equity",
                "debt_to_ebitda", "current_ratio", "quick_ratio", "total_cash", "total_debt",
                "book_value", "total_revenue", "ebitda", "trailing_eps", "forward_eps",
                "circulating_supply", "volume_24h",
            ),
            "analyst": ("target_mean_price", "recommendation", "analyst_count"),
            "fund_holdings": (
                "expense_ratio", "aum", "category", "yield_", "fund_family",
                "top_holdings", "sector_weightings", "asset_classes",
            ),
            "earnings": ("earnings_history",),
        }

        for section in sections:
            if section not in selectors:
                continue
            values = {
                key: block[key]
                for key in selectors[section]
                # Omit missing fields rather than sending null — a model shown
                # "trailing_pe": null will write a sentence about it. Empty lists
                # go too, for the same reason.
                if key in block and block[key] is not None and block[key] != []
            }
            if values:
                result[section] = values
            else:
                unavailable.append(section)

    if "news" in sections:
        try:
            page = yahoo_market_data.get_news(symbol=wanted, limit=MAX_NEWS_ITEMS)
            items = getattr(page, "items", page) or []
            result["news"] = [
                {
                    "title": item.title,
                    "source": item.source,
                    "published_at": (
                        item.published_at.isoformat() if item.published_at else None
                    ),
                    "url": item.url,
                    # Truncated: 15 full articles would crowd out everything else.
                    "summary": (item.summary or "")[:600] or None,
                }
                for item in items[:MAX_NEWS_ITEMS]
            ]
            if not result["news"]:
                unavailable.append("news")
                del result["news"]
        except Exception as exc:
            logger.warning("News fetch failed for %s: %s", wanted, exc)
            unavailable.append("news")

    if unavailable:
        result["unavailable_sections"] = sorted(set(unavailable))
        result["unavailable_note"] = (
            "These sections had no data for this instrument — commonly the case for ETFs, "
            "crypto and non-US small caps. Say so rather than filling the gap."
        )

    result["source"] = "Yahoo Finance"
    return result


def compare_symbols_tool(
    db: Session,
    user_id: int,
    symbols: list,
    period: str = "3y",
    benchmark: Optional[str] = None,
) -> dict:
    """Risk-adjusted side-by-side comparison of two or more instruments.

    This is the tool for "should I buy more of X or put it in Y" — it returns
    Sharpe, Sortino, drawdown, beta and correlation, not just raw returns.
    """
    cleaned = [str(s).strip().upper() for s in (symbols or []) if str(s).strip()]
    if len(cleaned) < 2:
        return {"error": "Give at least two symbols to compare."}

    limit = min(settings.ANALYTICS_MAX_COMPARE_SYMBOLS, MAX_COMPARE_SYMBOLS)
    if len(cleaned) > limit:
        return {"error": f"At most {limit} symbols can be compared at once."}

    try:
        result = comparison_service.build_comparison(
            db,
            symbols=cleaned,
            period=period,
            benchmark=benchmark or settings.ANALYTICS_DEFAULT_BENCHMARK,
        )
    except (SymbolNotFound, MarketDataUnavailable) as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.warning("Comparison failed for %s: %s", cleaned, exc)
        return {"error": f"Comparison failed: {exc}"}

    return _as_plain(result)


def get_technical_tool(db: Session, user_id: int, symbol: str, period: str = "1y") -> dict:
    """Trend, momentum and volatility indicators, with the regime context that
    says whether they carry any information for this instrument."""
    wanted = (symbol or "").strip().upper()
    if not wanted:
        return {"error": "symbol must not be empty."}
    try:
        result = technical_service.get_technical(db, wanted, period=period)
    except (SymbolNotFound, MarketDataUnavailable) as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.warning("Technical analysis failed for %s: %s", wanted, exc)
        return {"error": f"Technical analysis failed: {exc}"}
    return _as_plain(result)


def simulate_symbol_tool(
    db: Session,
    user_id: int,
    symbol: str,
    horizon_days: int = 252,
    target_price: Optional[float] = None,
) -> dict:
    """A distribution of plausible future prices — never a prediction.

    Bootstraps historical returns into a fan of paths. The percentiles describe
    how wide the range of outcomes is; they are not a forecast of where the price
    will be, and the result says so.
    """
    wanted = (symbol or "").strip().upper()
    if not wanted:
        return {"error": "symbol must not be empty."}

    horizon = max(1, min(int(horizon_days or 252), settings.SIMULATION_MAX_HORIZON_DAYS))
    try:
        result = technical_service.simulate_technical(
            db, wanted, horizon_days=horizon, target_price=target_price
        )
    except (SymbolNotFound, MarketDataUnavailable) as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.warning("Simulation failed for %s: %s", wanted, exc)
        return {"error": f"Simulation failed: {exc}"}

    plain = _as_plain(result)
    plain["interpretation_rule"] = (
        "This is a distribution of outcomes produced by resampling past returns, not a "
        "forecast. Report it as a range and its probabilities. Never state a percentile "
        "as an expected or predicted price."
    )
    return plain


# --- tool registration -----------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_portfolio_overview_tool",
            "description": (
                "The user's investment accounts: total value, cash, cost basis, unrealized "
                "profit/loss, today's move, and how recently each was synced. Start here "
                "for any question about their portfolio."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_positions_tool",
            "description": (
                "The individual holdings, with quantity, cost, current value, unrealized "
                "profit/loss and each one's weight in the portfolio."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "integer", "description": "Limit to one account"},
                    "min_weight_pct": {
                        "type": "number",
                        "description": "Only return holdings at or above this portfolio weight",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio_allocation_tool",
            "description": (
                "How the portfolio is spread: largest positions and their weights, "
                "concentration (HHI and effective number of holdings), asset-class split, "
                "currency exposure and cash weight. Use this for any question about "
                "diversification, concentration or being over-exposed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "top_n": {"type": "integer", "description": "How many top holdings to list, default 10"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio_risk_tool",
            "description": (
                "Risk and risk-adjusted return for the whole portfolio: volatility, maximum "
                "drawdown, value at risk, Sharpe and Sortino ratios, and beta/alpha against "
                "a benchmark. The result states which method produced the return series and "
                "how many observations it has — report that alongside the numbers."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["1m", "3m", "6m", "1y", "3y", "5y", "max"],
                        "description": "Default 1y",
                    },
                    "benchmark": {
                        "type": "string",
                        "description": "Benchmark ticker, e.g. ^GSPC. Defaults to the app's configured benchmark.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_investment_transactions_tool",
            "description": (
                "Broker activity: buys, sells, dividends, fees and cash movements, with "
                "totals by type. Use this for questions about what was traded, dividends "
                "received, or fees paid."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["buy", "sell", "fx", "dividend", "fee", "deposit", "withdrawal", "tax"],
                    },
                    "start_date": {"type": "string", "format": "date"},
                    "end_date": {"type": "string", "format": "date"},
                    "limit": {"type": "integer", "description": "Default 50, max 200"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_position_history_tool",
            "description": (
                "One holding's history: value, amount invested, average cost and realized "
                "profit over time. Use it to answer 'how has my X done since I bought it'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "The ticker as held, e.g. AAPL.US"},
                    "range": {
                        "type": "string",
                        "enum": ["entry", "1m", "3m", "6m", "1y", "5y", "max"],
                        "description": "Default 'entry' — since the position was opened",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_watchlist_tool",
            "description": "Tickers the user is tracking but does not necessarily own.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_symbols_tool",
            "description": (
                "Find a ticker from a company or fund name. Use this first whenever the "
                "user names a company rather than a ticker — never guess the symbol."
            ),
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_company_research_tool",
            "description": (
                "Current facts about a ticker from Yahoo Finance. Ask only for the sections "
                "you need: 'profile' (what it is, price, 52-week range), 'fundamentals' "
                "(valuation multiples, margins, growth, leverage), 'analyst' (consensus and "
                "mean target), 'news' (recent headlines with links), 'fund_holdings' (for "
                "ETFs: expense ratio, holdings, sector weights), 'earnings' (recent surprises). "
                "This is the only acceptable source of company facts — never use your own memory."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "include": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": list(RESEARCH_SECTIONS),
                        },
                        "description": "Defaults to profile, fundamentals and analyst.",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_symbols_tool",
            "description": (
                "Compare two to five instruments on a risk-adjusted basis: returns, "
                "volatility, drawdown, Sharpe, Sortino, beta and correlation. This is the "
                "right tool for 'should I buy more of X or put the money into Y' — comparing "
                "raw returns alone is not a real comparison."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbols": {"type": "array", "items": {"type": "string"}, "minItems": 2},
                    "period": {
                        "type": "string",
                        "enum": ["1y", "3y", "5y", "10y", "max"],
                        "description": "Default 3y",
                    },
                    "benchmark": {"type": "string"},
                },
                "required": ["symbols"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_technical_tool",
            "description": (
                "Trend, momentum and volatility indicators for a ticker, plus the regime "
                "context that says whether those indicators carry information for this "
                "instrument at all. If the regime section says the series looks random, "
                "say so rather than reading the indicators as signals."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "period": {"type": "string", "description": "Default 1y"},
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_symbol_tool",
            "description": (
                "A distribution of plausible future prices for a ticker, produced by "
                "resampling its historical returns. Returns percentiles and probabilities, "
                "NOT a prediction. Use it to describe how wide the range of outcomes is, or "
                "the probability of reaching a given price. Never state a percentile as an "
                "expected price."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "horizon_days": {"type": "integer", "description": "Trading days ahead, default 252 (about a year)"},
                    "target_price": {
                        "type": "number",
                        "description": "Optional: also return the probability of reaching this price",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
]

DISPATCH = {
    "get_portfolio_overview_tool": get_portfolio_overview_tool,
    "get_positions_tool": get_positions_tool,
    "get_portfolio_allocation_tool": get_portfolio_allocation_tool,
    "get_portfolio_risk_tool": get_portfolio_risk_tool,
    "get_investment_transactions_tool": get_investment_transactions_tool,
    "get_position_history_tool": get_position_history_tool,
    "get_watchlist_tool": get_watchlist_tool,
    "search_symbols_tool": search_symbols_tool,
    "get_company_research_tool": get_company_research_tool,
    "compare_symbols_tool": compare_symbols_tool,
    "get_technical_tool": get_technical_tool,
    "simulate_symbol_tool": simulate_symbol_tool,
}


def _as_plain(value):
    """Pydantic models, dataclasses and pandas objects -> JSON-safe primitives."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict") and callable(value.dict):
        return value.dict()
    if isinstance(value, dict):
        return {k: _as_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_as_plain(v) for v in value]
    if hasattr(value, "__dict__"):
        return {k: _as_plain(v) for k, v in vars(value).items() if not k.startswith("_")}
    return str(value)
