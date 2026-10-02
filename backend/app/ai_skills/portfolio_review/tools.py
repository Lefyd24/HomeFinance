"""Tools for the portfolio-review skill: a deterministic rebalance plan and fund costs.

Buckets are the asset classes `portfolio_analytics_service.portfolio_allocation` reports
(equity, bond, cash, crypto, other, unknown), so a target expressed in those terms lines up
with the allocation the user sees elsewhere. The arithmetic lives here, never in the model.
Nothing here trades: these tools only describe what a rebalance would look like.

Must not import app.services.ai_service (circular).
"""
import logging
import threading
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.models.investment_analytics import MarketSymbolMeta
from app.services import investor_profile_service, market_research, portfolio_analytics_service

logger = logging.getLogger("app.ai")

DRIFT_BAND_PP = 5.0
SUM_TOLERANCE = 1.0
FUND_QUOTE_TYPES = {"etf", "mutual_fund", "mutualfund"}
NON_FUND_QUOTE_TYPES = {"stock", "equity", "crypto", "cryptocurrency", "currency", "index"}
MAX_FUND_LOOKUPS = 25
HIGH_COST_PCT = 0.5
VERY_HIGH_COST_PCT = 1.0
_EXPENSE_TTL = 3600.0

_BUCKET_ALIASES = {
    "equity": "equity",
    "equities": "equity",
    "stock": "equity",
    "stocks": "equity",
    "shares": "equity",
    "bond": "bond",
    "bonds": "bond",
    "fixed_income": "bond",
    "fixed income": "bond",
    "cash": "cash",
    "crypto": "crypto",
    "cryptocurrency": "crypto",
    "other": "other",
    "unknown": "unknown",
}
#: Buckets nobody can sensibly buy or sell "to target": held fixed unless the target names them.
_FREEZABLE = ("unknown", "other")


# --- rebalance maths (pure) -----------------------------------------------------


def _normalise_target(target) -> tuple[Optional[dict[str, float]], Optional[str]]:
    if not isinstance(target, dict) or not target:
        return None, "target_allocation must be an object of asset class to percentage."
    cleaned: dict[str, float] = {}
    for raw_key, raw_value in target.items():
        key = _BUCKET_ALIASES.get(str(raw_key).strip().lower().replace("-", "_"))
        if key is None:
            return None, (
                f"Unknown bucket {raw_key!r}. Use: equity, bond, cash, crypto, other."
            )
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            return None, f"Target for {raw_key!r} is not a number."
        if value < 0:
            return None, f"Target for {raw_key!r} cannot be negative."
        cleaned[key] = cleaned.get(key, 0.0) + value
    total = sum(cleaned.values())
    if abs(total - 100.0) > SUM_TOLERANCE:
        return None, f"Target percentages must sum to 100 (got {round(total, 2)})."
    return {k: v * 100.0 / total for k, v in cleaned.items()}, None


def _spread(amounts: dict[str, float], total: float) -> dict[str, float]:
    """Round to cents so the parts sum to `total` exactly (residual goes to the largest)."""
    rounded = {k: round(v, 2) for k, v in amounts.items()}
    if rounded:
        biggest = max(rounded, key=lambda k: rounded[k])
        rounded[biggest] = round(rounded[biggest] + (round(total, 2) - sum(rounded.values())), 2)
    return rounded


def compute_rebalance(
    current: dict[str, float],
    target: dict[str, float],
    new_cash: float = 0.0,
    prefer_contributions: bool = True,
) -> dict:
    """Pure rebalance maths. `current` is value per bucket, `target` percentages summing to 100."""
    current = {k: float(v) for k, v in current.items() if v and v > 0}
    total = sum(current.values())
    new_cash = max(0.0, float(new_cash or 0.0))
    total_after = total + new_cash

    frozen = {b for b in _FREEZABLE if b in current and b not in target}
    frozen_value = sum(current[b] for b in frozen)
    investable = total_after - frozen_value
    buckets = [b for b in dict.fromkeys([*target, *current]) if b not in frozen]

    target_value = {b: target.get(b, 0.0) / 100.0 * investable for b in buckets}
    gap = {b: target_value[b] - current.get(b, 0.0) for b in buckets}

    use_contributions = bool(prefer_contributions) and new_cash > 0
    contrib: dict[str, float] = {}
    if use_contributions:
        positive = {b: g for b, g in gap.items() if g > 0}
        pool = sum(positive.values())
        contrib = _spread({b: g * new_cash / pool for b, g in positive.items()}, new_cash) if pool > 0 else {}
        buys = {b: contrib.get(b, 0.0) for b in buckets}
        sells = {b: 0.0 for b in buckets}
        mode = "contributions_first"
    else:
        buys = {b: round(max(g, 0.0), 2) for b, g in gap.items()}
        sells = {b: round(max(-g, 0.0), 2) for b, g in gap.items()}
        mode = "full_rebalance"

    rows = []
    for b in buckets:
        cur = current.get(b, 0.0)
        after = cur + buys[b] - sells[b]
        tgt_pct_now = target.get(b, 0.0) / 100.0 * (total - frozen_value) / total * 100 if total > 0 else None
        drift = (cur / total * 100 - tgt_pct_now) if total > 0 else None
        after_pct = after / total_after * 100 if total_after > 0 else None
        tgt_pct_after = target_value[b] / total_after * 100 if total_after > 0 else None
        after_drift = (after_pct - tgt_pct_after) if total_after > 0 else None
        rows.append(
            {
                "bucket": b,
                "current_value": round(cur, 2),
                "current_pct": round(cur / total * 100, 2) if total > 0 else None,
                "target_pct": round(tgt_pct_now, 2) if tgt_pct_now is not None else None,
                "drift_pp": round(drift, 2) if drift is not None else None,
                "outside_band": bool(drift is not None and abs(drift) > DRIFT_BAND_PP),
                "buy": buys[b],
                "sell": sells[b],
                "after_value": round(after, 2),
                "after_pct": round(after_pct, 2) if after_pct is not None else None,
                "after_drift_pp": round(after_drift, 2) if after_drift is not None else None,
                "full_rebalance_trade": round(gap[b], 2),
            }
        )
    rows.sort(key=lambda r: -abs(r["drift_pp"] or 0))

    notes: list[str] = []
    if frozen:
        notes.append(
            f"{', '.join(sorted(frozen))} holdings ({round(frozen_value, 2)}) are held as they are "
            "and excluded from the plan because the target does not name them; the target "
            "percentages apply to the rest."
        )
    if mode == "contributions_first":
        unresolved = [r for r in rows if r["after_drift_pp"] is not None and abs(r["after_drift_pp"]) > DRIFT_BAND_PP]
        if unresolved:
            notes.append(
                "New cash alone does not bring every bucket within the "
                f"{DRIFT_BAND_PP:g}pp band; 'full_rebalance_trade' shows what selling would add. "
                "Selling can trigger taxes and fees, so weigh that against the remaining drift."
            )
    elif new_cash == 0 and prefer_contributions:
        notes.append(
            "No new cash was given, so a rebalance needs sales; direct future contributions to "
            "under-weight buckets to avoid selling where possible."
        )

    return {
        "mode": mode,
        "total_value": round(total, 2),
        "new_cash": round(new_cash, 2),
        "total_after": round(total_after, 2),
        "rows": rows,
        "total_buys": round(sum(buys.values()), 2),
        "total_sells": round(sum(sells.values()), 2),
        "max_abs_drift_pp": round(max((abs(r["drift_pp"] or 0) for r in rows), default=0.0), 2),
        "needs_action": any(r["outside_band"] for r in rows),
        "drift_band_pp": DRIFT_BAND_PP,
        "notes": notes,
    }


def rebalance_plan_tool(
    db: Session,
    user_id: int,
    target_allocation: Optional[dict] = None,
    new_cash: float = 0,
    prefer_contributions: bool = True,
) -> dict:
    """Current versus target asset-class allocation, drift, and the buys/sells or contribution split."""
    try:
        cash = float(new_cash or 0)
    except (TypeError, ValueError):
        return {"error": "new_cash must be a number."}
    if cash < 0:
        return {"error": "new_cash cannot be negative."}

    source = "request"
    if not target_allocation:
        profile = investor_profile_service.to_dict(investor_profile_service.get_profile(db, user_id))
        target_allocation = profile.get("target_allocation")
        source = "investor_profile"
        if not target_allocation:
            return {
                "error": (
                    "No target allocation: pass target_allocation, or ask the user for one and "
                    "record it in their investor profile."
                )
            }
    target, problem = _normalise_target(target_allocation)
    if problem:
        return {"error": problem}

    allocation = portfolio_analytics_service.portfolio_allocation(db, user_id)
    if not allocation.get("has_investments"):
        return {"error": allocation.get("note") or "No investment holdings found."}
    if allocation.get("error"):
        return {"error": allocation["error"]}
    if not allocation.get("asset_class"):
        return {"error": allocation.get("note") or "The portfolio has no value to allocate."}

    total_value = float(allocation["total_value"])
    raw = {b: pct / 100.0 * total_value for b, pct in allocation["asset_class"].items()}
    scale = total_value / sum(raw.values()) if sum(raw.values()) else 1.0
    current = {b: v * scale for b, v in raw.items()}

    plan = compute_rebalance(current, target, cash, bool(prefer_contributions))
    plan["currency"] = allocation.get("currency")
    plan["target_source"] = source
    plan["target_allocation"] = {k: round(v, 2) for k, v in target.items()}
    coverage = allocation.get("asset_class_coverage_pct")
    plan["asset_class_coverage_pct"] = coverage
    if coverage is not None and coverage < 90:
        plan["notes"].append(
            f"Only {coverage}% of the portfolio has a known asset class; the remainder sits in "
            "'unknown', so the current split is approximate."
        )
    plan["notes"].append(allocation.get("asset_class_note", ""))
    plan["notes"] = [n for n in plan["notes"] if n]
    return plan


# --- fund costs ---------------------------------------------------------------------

_expense_cache: dict[str, tuple[float, dict]] = {}
_expense_lock = threading.Lock()


def _fund_info(symbol: str) -> dict:
    """{"quote_type", "expense_ratio_pct", "source"} for a Yahoo symbol, or {"error": ...}.

    Units differ by field: netExpenseRatio is already a percent (0.07 = 0.07%), while
    annualReportExpenseRatio is a fraction (0.0007 = 0.07%).
    """
    now = time.monotonic()
    with _expense_lock:
        hit = _expense_cache.get(symbol)
        if hit and now - hit[0] < _EXPENSE_TTL:
            return hit[1]

    info = market_research.get_info(symbol)
    if not isinstance(info, dict) or info.get("error"):
        return {"error": (info or {}).get("error", "No data") if isinstance(info, dict) else "No data"}
    quote_type = str(info.get("quoteType") or "").lower()

    def read(data: dict) -> tuple[Optional[float], Optional[str]]:
        net = data.get("netExpenseRatio")
        if net is not None:
            return float(net), "netExpenseRatio"
        annual = data.get("annualReportExpenseRatio")
        if annual is not None:
            return float(annual) * 100.0, "annualReportExpenseRatio"
        return None, None

    pct, source = read(info)
    result = {"quote_type": quote_type, "expense_ratio_pct": pct, "source": source}
    with _expense_lock:
        _expense_cache[symbol] = (now, result)
    return result


def get_fund_costs_tool(db: Session, user_id: int) -> dict:
    """Expense ratios of held funds/ETFs and their annual cost in the portfolio currency."""
    accounts = portfolio_analytics_service.get_investment_accounts(db, user_id)
    positions = portfolio_analytics_service._positions_for(db, accounts)
    if not positions:
        return {"has_investments": False, "funds": [], "note": "No holdings found."}

    currency = portfolio_analytics_service._shared_currency(accounts)
    provider_by_account = {a.id: a.provider for a in accounts}

    holdings: dict[str, dict] = {}
    for p in positions:
        guess = portfolio_analytics_service._yahoo_symbol_guess(db, p, provider_by_account.get(p.account_id))
        entry = holdings.setdefault(
            p.symbol, {"symbol": p.symbol, "lookup": guess, "name": p.name, "value": 0.0}
        )
        entry["value"] += portfolio_analytics_service.base_market_value(p)

    metas = {
        m.symbol: m
        for m in db.query(MarketSymbolMeta)
        .filter(MarketSymbolMeta.symbol.in_([h["lookup"] for h in holdings.values()]))
        .all()
    }
    total_value = sum(h["value"] for h in holdings.values())

    funds, unknown, lookups = [], [], 0
    fund_value = 0.0
    for h in sorted(holdings.values(), key=lambda x: -x["value"]):
        meta = metas.get(h["lookup"])
        known_type = (meta.quote_type or "").lower() if meta and meta.quote_type else ""
        if known_type in NON_FUND_QUOTE_TYPES:
            continue
        if lookups >= MAX_FUND_LOOKUPS:
            unknown.append({"symbol": h["symbol"], "name": h["name"], "value": round(h["value"], 2),
                            "reason": "lookup limit reached"})
            continue
        lookups += 1
        info = _fund_info(h["lookup"])
        quote_type = known_type or info.get("quote_type", "")
        if info.get("error") and not known_type:
            unknown.append({"symbol": h["symbol"], "name": h["name"], "value": round(h["value"], 2),
                            "reason": "no market data"})
            continue
        if quote_type not in FUND_QUOTE_TYPES:
            continue
        fund_value += h["value"]
        pct = info.get("expense_ratio_pct")
        if pct is None:
            unknown.append({"symbol": h["symbol"], "name": h["name"], "value": round(h["value"], 2),
                            "reason": "expense ratio not available"})
            continue
        funds.append(
            {
                "symbol": h["symbol"],
                "name": h["name"],
                "value": round(h["value"], 2),
                "weight_pct": round(h["value"] / total_value * 100, 2) if total_value else None,
                "expense_ratio_pct": round(pct, 4),
                "annual_cost": round(h["value"] * pct / 100.0, 2),
                "cost_flag": (
                    "very high" if pct >= VERY_HIGH_COST_PCT else "high" if pct >= HIGH_COST_PCT else None
                ),
            }
        )

    funds.sort(key=lambda f: -f["annual_cost"])
    priced_value = sum(f["value"] for f in funds)
    total_cost = sum(f["annual_cost"] for f in funds)
    notes = [
        "Expense ratios come from Yahoo Finance fund data and may be stale or differ from the "
        "fund's current factsheet; confirm before acting.",
        "Brokerage commissions, spreads, FX conversion fees and taxes are not included.",
    ]
    if currency is None:
        notes.append("Accounts use different currencies; values are in each account's own base currency.")
    if unknown:
        notes.append("Some funds have no expense ratio, so the total understates the true cost.")
    return {
        "has_investments": True,
        "currency": currency,
        "funds": funds,
        "funds_without_cost_data": unknown,
        "fund_count": len(funds) + len(unknown),
        "total_portfolio_value": round(total_value, 2),
        "fund_value_with_cost_data": round(priced_value, 2),
        "total_annual_cost": round(total_cost, 2),
        "weighted_avg_expense_ratio_pct": round(total_cost / priced_value * 100, 4) if priced_value else None,
        "cost_over_10_years_flat": round(total_cost * 10, 2),
        "notes": notes,
    }


# --- registration ---------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "rebalance_plan_tool",
            "description": (
                "Deterministic rebalance plan by asset class: current versus target allocation, "
                "drift in percentage points, and either the contribution split of new cash "
                "(preferred, no selling) or full buy/sell amounts. Buckets: equity, bond, cash, "
                "crypto, other. If target_allocation is omitted, the investor profile's target "
                "is used. Describes trades only; nothing is executed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "target_allocation": {
                        "type": "object",
                        "description": (
                            "Asset class to target percentage, summing to 100, e.g. "
                            "{\"equity\": 70, \"bond\": 25, \"cash\": 5}."
                        ),
                        "additionalProperties": {"type": "number"},
                    },
                    "new_cash": {
                        "type": "number",
                        "description": "New money to invest, in the portfolio currency. Default 0.",
                    },
                    "prefer_contributions": {
                        "type": "boolean",
                        "description": "Use new cash to close drift before any selling. Default true.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fund_costs_tool",
            "description": (
                "Expense ratios of the funds and ETFs the user holds, with the annual cost in "
                "the portfolio currency, the weighted average ratio and a list of funds with no "
                "cost data. Stocks and crypto are skipped."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

DISPATCH = {
    "rebalance_plan_tool": rebalance_plan_tool,
    "get_fund_costs_tool": get_fund_costs_tool,
}
NEEDS_USER_EMAIL: set[str] = set()
