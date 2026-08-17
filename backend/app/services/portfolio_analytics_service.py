"""Portfolio-level aggregates: what you hold, how it's spread, and how risky it is.

Everything the AI advisor says about the portfolio as a whole is computed here,
in Python, and handed to the model as finished numbers. The model never derives
a percentage or a ratio itself — see `docs/investments/05-portfolio-advisor-agent.md`.

Two rules this module inherits from the rest of the app and must not break:

1. **Never sum across currencies.** Positions carry `*_base` columns restating
   them in their account's currency; totals across *accounts* only exist when the
   accounts agree on a currency. When they don't, the totals are `None` with a
   stated reason — the same choice `portfolioInsights.ts::aggregateTotals` makes
   on the frontend ("the totals refuse to exist rather than quietly adding euros
   to dollars").
2. **Returns are time-weighted.** `PortfolioSnapshot.total_value` moves when you
   deposit money, and a deposit is not a return. Daily returns here are adjusted
   for external cash flows (§`_daily_returns_from_snapshots`), or the resulting
   Sharpe ratio would mostly measure how often you got paid.

The allocation logic here duplicates `frontend/app/src/investments/portfolioInsights.ts`.
That is knowingly accepted for now; the intended direction is for the frontend to
read these numbers from the backend rather than recomputing them.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Account,
    InvestmentTransaction,
    MarketSymbolMeta,
    PortfolioPosition,
    PortfolioSnapshot,
)
from app.services.analytics import relation, returns as returns_mod, risk
from app.services.market_data import (
    DEFAULT_BENCHMARK,
    get_price_history,
    get_risk_free_rate,
    yahoo_candidates,
)
from app.services.position_history_service import get_symbol_override

logger = logging.getLogger("app")

#: Sharpe, Sortino and the market model all return None below 60 observations
#: (see analytics/risk.py). Stated here so the tool result can explain a null
#: rather than just omitting the metric.
MIN_RISK_OBSERVATIONS = 60

PERIOD_DAYS = {
    "1m": 31,
    "3m": 92,
    "6m": 183,
    "1y": 365,
    "3y": 1095,
    "5y": 1826,
    "max": None,
}

#: `PortfolioSnapshot` is written once per sync, and a sync can be missed, so a
#: day-over-day step longer than this is treated as a gap rather than a return.
MAX_SNAPSHOT_GAP_DAYS = 5

#: Broker transaction types that move money in or out of the account without
#: being a return. Buys and sells are internal — they move value between cash
#: and positions and net to zero at the portfolio level.
EXTERNAL_FLOW_TYPES = ("deposit", "withdrawal")

#: A daily portfolio return beyond this is not a market move on a diversified
#: holding — it is money arriving or leaving that the cash reconstruction below
#: failed to catch. Such a step is dropped and counted, never winsorised: a
#: silently shrunk outlier is a lie, a declared gap is a limitation.
MAX_PLAUSIBLE_DAILY_RETURN = 0.35

#: `MarketSymbolMeta.quote_type` values grouped into the asset classes the
#: profile's target allocation is expressed in. These are the app's own
#: normalised, lowercase values written by `market_data.get_symbol_meta` —
#: NOT yfinance's raw `quoteType` (which is "EQUITY"/"CRYPTOCURRENCY"/…).
_QUOTE_TYPE_TO_ASSET_CLASS = {
    "stock": "equity",
    "etf": "equity",  # refined below by name when it's obviously a bond fund
    "mutual_fund": "equity",
    "index": "equity",
    "crypto": "crypto",
    "currency": "cash",
}

#: The quote types whose name is worth checking for a bond fund.
_FUND_QUOTE_TYPES = ("etf", "mutual_fund")

#: Fund names containing one of these are counted as bonds rather than equity.
#: Crude, and labelled as such in the output — a bond ETF sitting in the equity
#: bucket would misstate the one number the allocation exists to report.
_BOND_NAME_HINTS = ("BOND", "TREASURY", "GILT", "AGGREGATE", "FIXED INCOME", "OBLIGATION")


# --- position-level helpers (also used by routers/investments.py) ----------


def base_market_value(position: PortfolioPosition) -> float:
    """A position's market value in the account's currency.

    Falls back to the native value for rows written before the base-currency
    columns existed, and for single-currency accounts where they are equal.
    """
    return (
        position.market_value_base
        if position.market_value_base is not None
        else position.market_value
    )


def base_cost_basis(position: PortfolioPosition) -> Optional[float]:
    if position.cost_basis_base is not None:
        return position.cost_basis_base
    if position.cost_basis is not None:
        return position.cost_basis
    if position.avg_price is not None:
        return position.avg_price * position.quantity
    return None


def get_investment_accounts(db: Session, user_id: int) -> list[Account]:
    return (
        db.query(Account)
        .filter(
            Account.user_id == user_id,
            Account.provider.isnot(None),
            Account.is_active == True,  # noqa: E712
        )
        .order_by(Account.id)
        .all()
    )


def _shared_currency(accounts: list[Account]) -> Optional[str]:
    """The one currency every account reports in, or None if they disagree."""
    currencies = {(a.currency or "").upper() for a in accounts if a.currency}
    return currencies.pop() if len(currencies) == 1 else None


def _positions_for(db: Session, accounts: list[Account]) -> list[PortfolioPosition]:
    if not accounts:
        return []
    return (
        db.query(PortfolioPosition)
        .filter(PortfolioPosition.account_id.in_([a.id for a in accounts]))
        .all()
    )


# --- overview --------------------------------------------------------------


def portfolio_overview(db: Session, user_id: int) -> dict:
    """Total value, cost, unrealized P&L and day change, per account and combined."""
    accounts = get_investment_accounts(db, user_id)
    if not accounts:
        return {
            "has_investments": False,
            "accounts": [],
            "note": "No investment accounts are connected.",
        }

    shared = _shared_currency(accounts)
    now = datetime.utcnow()

    account_blocks = []
    combined_value = 0.0
    combined_cost = 0.0
    combined_cash = 0.0
    day_change = 0.0
    day_change_covered = 0.0
    # Accounts holding positions whose cost basis the broker never reported.
    # Their value must not be folded into a combined profit figure, or the
    # whole holding reads as gain.
    accounts_without_cost: list[str] = []

    for account in accounts:
        positions = [p for p in _positions_for(db, [account])]
        market_value = sum(base_market_value(p) for p in positions)
        cost = sum(base_cost_basis(p) or 0.0 for p in positions)
        if positions and not cost:
            accounts_without_cost.append(account.name)

        snapshot = (
            db.query(PortfolioSnapshot)
            .filter(PortfolioSnapshot.account_id == account.id)
            .order_by(PortfolioSnapshot.date.desc())
            .first()
        )
        cash = round(snapshot.cash_balance or 0.0, 2) if snapshot else 0.0

        # Size-weighted, matching routers/investments.py::_to_response — a plain
        # average of the percentages lets a tiny holding outvote the portfolio.
        account_day_change = 0.0
        covered = 0.0
        for position in positions:
            if position.day_change_pct is None:
                continue
            value = base_market_value(position)
            previous = (
                value / (1 + position.day_change_pct / 100)
                if position.day_change_pct != -100
                else 0.0
            )
            account_day_change += value - previous
            covered += previous

        account_blocks.append(
            {
                "account_id": account.id,
                "name": account.name,
                "provider": account.provider,
                "currency": account.currency,
                "total_value": round(account.balance, 2),
                "positions_value": round(market_value, 2),
                "cash_balance": cash,
                "cost_basis": round(cost, 2),
                "unrealized_pnl": round(market_value - cost, 2) if cost else None,
                "return_pct": round((market_value - cost) / cost * 100, 2) if cost else None,
                "day_change": round(account_day_change, 2) if covered > 0 else None,
                "day_change_pct": (
                    round(account_day_change / covered * 100, 2) if covered > 0 else None
                ),
                "position_count": len(positions),
                "last_synced_at": (
                    account.last_synced_at.isoformat() if account.last_synced_at else None
                ),
                "sync_age_hours": (
                    round((now - account.last_synced_at).total_seconds() / 3600, 1)
                    if account.last_synced_at
                    else None
                ),
            }
        )

        combined_value += account.balance
        combined_cost += cost
        combined_cash += cash
        day_change += account_day_change
        day_change_covered += covered

    result = {
        "has_investments": True,
        "accounts": account_blocks,
        "currency": shared,
    }

    if shared is None:
        result["combined"] = None
        result["note"] = (
            "Accounts report in different currencies "
            f"({', '.join(sorted({a.currency or '?' for a in accounts}))}), so there is no "
            "meaningful combined total. Use the per-account figures."
        )
    else:
        # A combined profit figure is only meaningful when every account
        # contributing value also contributed a cost. Otherwise the accounts
        # missing one have their entire holding counted as gain.
        pnl_is_meaningful = bool(combined_cost) and not accounts_without_cost

        result["combined"] = {
            "currency": shared,
            "total_value": round(combined_value, 2),
            "cash_balance": round(combined_cash, 2),
            "positions_value": round(combined_value - combined_cash, 2),
            "cost_basis": round(combined_cost, 2),
            "unrealized_pnl": (
                round(combined_value - combined_cash - combined_cost, 2)
                if pnl_is_meaningful
                else None
            ),
            "return_pct": (
                round((combined_value - combined_cash - combined_cost) / combined_cost * 100, 2)
                if pnl_is_meaningful
                else None
            ),
            "day_change": round(day_change, 2) if day_change_covered > 0 else None,
            "day_change_pct": (
                round(day_change / day_change_covered * 100, 2) if day_change_covered > 0 else None
            ),
        }
        if accounts_without_cost:
            result["combined"]["pnl_unavailable_because"] = (
                f"{', '.join(accounts_without_cost)} did not report a cost basis, so a "
                "combined profit figure would count those holdings entirely as gain. "
                "Use the per-account figures."
            )

    return result


# --- positions -------------------------------------------------------------


def portfolio_positions(
    db: Session,
    user_id: int,
    account_id: Optional[int] = None,
    min_weight_pct: Optional[float] = None,
) -> dict:
    """Holdings with weights. Weights are within each account when the accounts
    report in different currencies, and across the whole portfolio when they agree."""
    accounts = get_investment_accounts(db, user_id)
    if account_id is not None:
        accounts = [a for a in accounts if a.id == account_id]
        if not accounts:
            return {"error": f"No investment account with id {account_id}."}

    positions = _positions_for(db, accounts)
    if not positions:
        return {"positions": [], "count": 0, "note": "No holdings found."}

    shared = _shared_currency(accounts)
    account_by_id = {a.id: a for a in accounts}

    portfolio_total = sum(base_market_value(p) for p in positions) if shared else 0.0
    account_totals: dict[int, float] = {}
    for position in positions:
        account_totals[position.account_id] = account_totals.get(
            position.account_id, 0.0
        ) + base_market_value(position)

    rows = []
    for position in positions:
        value = base_market_value(position)
        cost = base_cost_basis(position)
        denominator = portfolio_total if shared else account_totals.get(position.account_id, 0.0)
        weight = round(value / denominator * 100, 2) if denominator else None

        if min_weight_pct is not None and (weight is None or weight < min_weight_pct):
            continue

        rows.append(
            {
                "symbol": position.symbol,
                "name": position.name,
                "account_id": position.account_id,
                "account_name": account_by_id[position.account_id].name,
                "quantity": position.quantity,
                "avg_price": position.avg_price,
                "current_price": position.current_price,
                "currency": position.currency,
                "market_value": round(value, 2),
                "cost_basis": round(cost, 2) if cost is not None else None,
                "unrealized_pnl": round(value - cost, 2) if cost is not None else None,
                "unrealized_return_pct": (
                    round((value - cost) / cost * 100, 2) if cost else None
                ),
                "weight_pct": weight,
                "day_change_pct": position.day_change_pct,
                "exchange": position.exchange,
            }
        )

    rows.sort(key=lambda r: r["market_value"], reverse=True)

    return {
        "positions": rows,
        "count": len(rows),
        "currency": shared,
        "weights_are_relative_to": (
            "the whole portfolio" if shared else "each position's own account"
        ),
    }


# --- allocation ------------------------------------------------------------


def _yahoo_symbol_guess(db: Session, position: PortfolioPosition, provider: Optional[str]) -> str:
    """Best-guess Yahoo ticker without a network call.

    Prefers the user's pinned override, then the suffix heuristic's first
    candidate. Only used to look up already-cached metadata, so a wrong guess
    costs an "unknown" bucket, never a wrong number.
    """
    override = get_symbol_override(db, position.account_id, position.symbol)
    if override:
        return override
    candidates = yahoo_candidates(position.symbol, provider)
    return candidates[0] if candidates else position.symbol


def _asset_class(meta: Optional[MarketSymbolMeta], name: Optional[str]) -> str:
    if meta is None or not meta.quote_type:
        return "unknown"
    quote_type = meta.quote_type.strip().lower()
    asset_class = _QUOTE_TYPE_TO_ASSET_CLASS.get(quote_type, "other")
    if asset_class == "equity" and quote_type in _FUND_QUOTE_TYPES:
        haystack = f"{name or ''} {meta.name or ''}".upper()
        if any(hint in haystack for hint in _BOND_NAME_HINTS):
            return "bond"
    return asset_class


def portfolio_allocation(db: Session, user_id: int, top_n: int = 10) -> dict:
    """Concentration, asset-class split, currency exposure and cash drag.

    Reads only *cached* symbol metadata — no network calls, because a portfolio
    of 30 holdings would otherwise mean 30 round trips inside one tool call. The
    share of the portfolio whose asset class could be identified is reported as
    `asset_class_coverage_pct` rather than silently bucketing the rest.
    """
    accounts = get_investment_accounts(db, user_id)
    positions = _positions_for(db, accounts)
    if not positions:
        return {"has_investments": False, "note": "No holdings found."}

    shared = _shared_currency(accounts)
    if shared is None:
        return {
            "has_investments": True,
            "error": (
                "Accounts report in different currencies "
                f"({', '.join(sorted({a.currency or '?' for a in accounts}))}), so portfolio-wide "
                "allocation percentages would be meaningless. Ask about one account at a time."
            ),
        }

    provider_by_account = {a.id: a.provider for a in accounts}
    total_positions_value = sum(base_market_value(p) for p in positions)

    cash = 0.0
    for account in accounts:
        snapshot = (
            db.query(PortfolioSnapshot)
            .filter(PortfolioSnapshot.account_id == account.id)
            .order_by(PortfolioSnapshot.date.desc())
            .first()
        )
        if snapshot:
            cash += snapshot.cash_balance or 0.0
    total_value = total_positions_value + cash

    if total_value <= 0:
        return {"has_investments": True, "note": "Portfolio has no value to allocate."}

    # Cached metadata only, one query rather than one per symbol.
    guesses = {p.symbol: _yahoo_symbol_guess(db, p, provider_by_account.get(p.account_id)) for p in positions}
    meta_rows = (
        db.query(MarketSymbolMeta)
        .filter(MarketSymbolMeta.symbol.in_(list(set(guesses.values()))))
        .all()
    )
    meta_by_symbol = {row.symbol: row for row in meta_rows}

    by_asset_class: dict[str, float] = {}
    by_currency: dict[str, float] = {}
    identified_value = 0.0
    holdings: dict[str, dict] = {}

    for position in positions:
        value = base_market_value(position)
        meta = meta_by_symbol.get(guesses[position.symbol])
        asset_class = _asset_class(meta, position.name)
        if asset_class != "unknown":
            identified_value += value
        by_asset_class[asset_class] = by_asset_class.get(asset_class, 0.0) + value

        currency = (position.currency or shared).upper()
        by_currency[currency] = by_currency.get(currency, 0.0) + value

        # The same ticker can be held in more than one account.
        existing = holdings.setdefault(
            position.symbol, {"symbol": position.symbol, "name": position.name, "value": 0.0}
        )
        existing["value"] += value

    by_asset_class["cash"] = by_asset_class.get("cash", 0.0) + cash
    by_currency[shared] = by_currency.get(shared, 0.0) + cash

    ranked = sorted(holdings.values(), key=lambda h: h["value"], reverse=True)
    weights = [h["value"] / total_value * 100 for h in ranked]

    # Herfindahl-Hirschman index over portfolio weights: 10000 is everything in
    # one holding, 10000/n is a perfectly even split across n holdings.
    hhi = round(sum(w * w for w in weights), 1)

    return {
        "has_investments": True,
        "currency": shared,
        "total_value": round(total_value, 2),
        "asset_class": {
            name: round(value / total_value * 100, 2)
            for name, value in sorted(by_asset_class.items(), key=lambda kv: -kv[1])
            if value > 0
        },
        "asset_class_coverage_pct": round(
            (identified_value + cash) / total_value * 100, 1
        ),
        "asset_class_note": (
            "Asset classes come from cached market metadata; holdings never looked up "
            "elsewhere in the app show as 'unknown'. Bond funds are detected by name, "
            "so a bond ETF with an unusual name may be counted as equity."
        ),
        "currency_exposure": {
            name: round(value / total_value * 100, 2)
            for name, value in sorted(by_currency.items(), key=lambda kv: -kv[1])
        },
        "concentration": {
            "largest_position": (
                {
                    "symbol": ranked[0]["symbol"],
                    "name": ranked[0]["name"],
                    "weight_pct": round(weights[0], 2),
                }
                if ranked
                else None
            ),
            "top_holdings": [
                {
                    "symbol": holding["symbol"],
                    "name": holding["name"],
                    "weight_pct": round(weight, 2),
                }
                for holding, weight in list(zip(ranked, weights))[: max(1, top_n)]
            ],
            "top_5_weight_pct": round(sum(weights[:5]), 2),
            "holding_count": len(ranked),
            "hhi": hhi,
            "effective_holdings": round(10000 / hhi, 1) if hhi else None,
            "hhi_note": (
                "HHI is the sum of squared percentage weights. 10000 means everything sits "
                "in one holding; 'effective_holdings' is how many equally-sized positions "
                "would give the same concentration."
            ),
        },
        "cash": {
            "amount": round(cash, 2),
            "weight_pct": round(cash / total_value * 100, 2),
        },
    }


# --- risk ------------------------------------------------------------------


def _internal_cash_effect(db: Session, account_ids: list[int], start: date) -> dict[date, float]:
    """Per day, the net effect on cash of activity *inside* the portfolio.

    Buys and fees take cash out, sales and dividends put it back. `amount` is
    already signed from the account's perspective, so this is a plain sum.
    Deposits and withdrawals are excluded — they are exactly what we are trying
    to isolate.
    """
    if not account_ids:
        return {}

    rows = (
        db.query(InvestmentTransaction)
        .filter(
            InvestmentTransaction.account_id.in_(account_ids),
            InvestmentTransaction.type.notin_(EXTERNAL_FLOW_TYPES),
            InvestmentTransaction.date >= datetime.combine(start, datetime.min.time()),
        )
        .all()
    )

    effect: dict[date, float] = {}
    for row in rows:
        day = row.date.date() if isinstance(row.date, datetime) else row.date
        effect[day] = effect.get(day, 0.0) + (row.amount or 0.0)
    return effect


def _daily_returns_from_snapshots(
    db: Session, accounts: list[Account], start: date
) -> tuple[Optional[pd.Series], dict]:
    """Time-weighted daily returns of total portfolio value.

    `total_value` rises when you pay money in, and a deposit is not a return. If
    that is not corrected for, a transfer reads as a spectacular one-day gain and
    every risk metric downstream is wrong — a portfolio funded by monthly
    contributions can easily show a triple-digit "return" and a "volatility" that
    is really just the size of the payments.

    **Neither broker reliably reports deposits**: Freedom24 and Binance emit
    buys, sells, fees and fx, and nothing for money crossing the account
    boundary. So the flow is reconstructed from cash instead. Over a step,

        Δcash = (recorded internal activity) + (external flow)

    since every euro of cash movement is one or the other. Rearranged, the flow
    we cannot see is `F = Δcash − Σ(internal amounts)`, which needs only data
    both brokers do provide.

    The return is then Simple Dietz, `(V_t − V_{t−1} − F) / (V_{t−1} + F/2)`,
    which weights the flow at the middle of the period. That matters when the
    flow is large next to the balance: assuming a deposit landed at the start
    understates the return, at the end overstates it, and on a small portfolio
    being funded monthly the two answers differ by more than the return itself.
    """
    account_ids = [a.id for a in accounts]
    rows = (
        db.query(PortfolioSnapshot)
        .filter(
            PortfolioSnapshot.account_id.in_(account_ids),
            PortfolioSnapshot.date >= start,
        )
        .order_by(PortfolioSnapshot.date)
        .all()
    )
    if not rows:
        return None, {"reason": "No portfolio snapshots recorded yet."}

    # A date counts only when every account reported on it — otherwise the total
    # dips by a whole account's value and reads as a crash. Same rule as
    # portfolioInsights.ts::mergeHistory.
    by_date: dict[date, dict[int, tuple[float, float]]] = {}
    for row in rows:
        by_date.setdefault(row.date, {})[row.account_id] = (
            row.total_value,
            row.cash_balance or 0.0,
        )

    complete = {
        day: (
            sum(total for total, _ in values.values()),
            sum(cash for _, cash in values.values()),
        )
        for day, values in by_date.items()
        if len(values) == len(account_ids)
    }
    if len(complete) < 2:
        return None, {
            "reason": (
                f"Only {len(complete)} day(s) where all {len(account_ids)} account(s) reported "
                "a snapshot — not enough to measure returns."
            )
        }

    internal = _internal_cash_effect(db, account_ids, start)

    ordered = sorted(complete.items())
    index: list[date] = []
    values: list[float] = []
    skipped_gaps = 0
    skipped_implausible = 0
    total_flow = 0.0

    for i in range(1, len(ordered)):
        previous_day, (previous_value, previous_cash) = ordered[i - 1]
        day, (value, cash) = ordered[i]

        if (day - previous_day).days > MAX_SNAPSHOT_GAP_DAYS:
            skipped_gaps += 1
            continue
        if previous_value <= 0:
            continue

        internal_effect = sum(
            amount for txn_day, amount in internal.items() if previous_day < txn_day <= day
        )
        flow = (cash - previous_cash) - internal_effect

        # Simple Dietz: the flow is assumed to have been available for half the
        # period. Guard the denominator — a withdrawal of nearly the whole
        # balance can drive it to zero or below.
        denominator = previous_value + flow / 2
        if denominator <= 0:
            skipped_implausible += 1
            continue

        daily_return = (value - previous_value - flow) / denominator

        if abs(daily_return) > MAX_PLAUSIBLE_DAILY_RETURN:
            skipped_implausible += 1
            continue

        index.append(day)
        values.append(daily_return)
        total_flow += flow

    if not values:
        # Sufficiency for a given metric is judged later against
        # MIN_RISK_OBSERVATIONS; this only guards the empty case.
        return None, {
            "reason": (
                "Snapshot history exists but no usable daily step could be measured — "
                "the days are too far apart, or the value moves are dominated by money "
                "being paid in and out."
            )
        }

    series = pd.Series(values, index=pd.to_datetime(index), name="portfolio")
    meta = {
        "method": "snapshots",
        "observations": len(series),
        "start": index[0].isoformat(),
        "end": index[-1].isoformat(),
        "cash_flow_adjusted": True,
        "net_external_flow": round(total_flow, 2),
        "gaps_skipped": skipped_gaps,
        "steps_dropped_as_unexplained": skipped_implausible,
        "method_note": (
            "Time-weighted daily returns (Simple Dietz) from recorded portfolio snapshots. "
            "Neither broker reports deposits, so money paid in or out is reconstructed from "
            "the cash balance and known trades, and excluded from performance."
        ),
    }
    if skipped_implausible:
        meta["dropped_note"] = (
            f"{skipped_implausible} day(s) moved more than "
            f"{int(MAX_PLAUSIBLE_DAILY_RETURN * 100)}% even after that correction, which on a "
            "portfolio like this means an unrecorded transfer rather than a market move. Those "
            "days were left out rather than counted as performance."
        )
    return series, meta


def _daily_returns_synthetic(
    db: Session, accounts: list[Account], positions: list[PortfolioPosition], start: date, end: date
) -> tuple[Optional[pd.Series], dict]:
    """Returns of *today's* holdings held at today's weights over the period.

    A backward-looking approximation used when snapshot history is too short: it
    assumes you always held what you hold now, which flatters a portfolio whose
    winners were bought late. Labelled as such in the output.
    """
    provider_by_account = {a.id: a.provider for a in accounts}
    weight_by_symbol: dict[str, float] = {}
    for position in positions:
        symbol = _yahoo_symbol_guess(db, position, provider_by_account.get(position.account_id))
        weight_by_symbol[symbol] = weight_by_symbol.get(symbol, 0.0) + base_market_value(position)

    total = sum(weight_by_symbol.values())
    if total <= 0:
        return None, {"reason": "Holdings have no market value."}

    symbols = list(weight_by_symbol)
    try:
        histories = get_price_history(symbols, start, end, db=db)
    except Exception as exc:
        logger.warning("Synthetic portfolio series failed: %s", exc)
        return None, {"reason": f"Could not fetch price history: {exc}"}

    # get_price_history returns one OHLCV frame per symbol; a symbol Yahoo
    # doesn't list simply won't be in the dict.
    resolved = [s for s in symbols if s in histories and not histories[s].empty]
    if not resolved:
        return None, {"reason": "None of the holdings could be matched to market data."}

    frame = pd.DataFrame({s: histories[s]["close"] for s in resolved})
    frame = frame.dropna(how="all").ffill().dropna()
    if len(frame) < 2:
        return None, {"reason": "Not enough overlapping price history for these holdings."}

    weights = pd.Series({s: weight_by_symbol[s] for s in resolved})
    weights = weights / weights.sum()

    asset_returns = frame.pct_change().dropna()
    series = (asset_returns * weights).sum(axis=1)
    series.name = "portfolio"

    covered = sum(weight_by_symbol[s] for s in resolved) / total * 100
    return series, {
        "method": "synthetic",
        "observations": len(series),
        "start": series.index[0].date().isoformat(),
        "end": series.index[-1].date().isoformat(),
        "cash_flow_adjusted": False,
        "holdings_covered_pct": round(covered, 1),
        "method_note": (
            "Not enough snapshot history, so this reconstructs the period as if today's "
            "holdings had been held at today's weights throughout. It ignores when you "
            "actually bought, which tends to flatter a portfolio whose winners were "
            f"bought late. Covers {round(covered, 1)}% of portfolio value."
        ),
    }


def portfolio_risk(
    db: Session,
    user_id: int,
    period: str = "1y",
    benchmark: Optional[str] = None,
) -> dict:
    """Risk and risk-adjusted return for the portfolio as a whole."""
    if period not in PERIOD_DAYS:
        return {"error": f"period must be one of {', '.join(PERIOD_DAYS)}"}

    accounts = get_investment_accounts(db, user_id)
    positions = _positions_for(db, accounts)
    if not positions:
        return {"has_investments": False, "note": "No holdings found."}

    shared = _shared_currency(accounts)
    if shared is None:
        return {
            "has_investments": True,
            "error": (
                "Accounts report in different currencies, so a single portfolio return "
                "series would be meaningless. Ask about one account at a time."
            ),
        }

    end = date.today()
    days = PERIOD_DAYS[period]
    start = end - timedelta(days=days) if days else end - timedelta(days=365 * 15)

    series, meta = _daily_returns_from_snapshots(db, accounts, start)
    fallback_reason = None
    if series is None or len(series) < MIN_RISK_OBSERVATIONS:
        fallback_reason = meta.get("reason") or (
            f"Only {len(series)} snapshot day(s), fewer than the "
            f"{MIN_RISK_OBSERVATIONS} needed for risk-adjusted metrics."
        )
        synthetic, synthetic_meta = _daily_returns_synthetic(db, accounts, positions, start, end)
        if synthetic is not None:
            series, meta = synthetic, synthetic_meta
            meta["fell_back_because"] = fallback_reason
        elif series is None:
            return {
                "has_investments": True,
                "error": "Could not build a portfolio return series.",
                "snapshot_problem": fallback_reason,
                "price_problem": synthetic_meta.get("reason"),
            }

    benchmark_symbol = (benchmark or settings.ANALYTICS_DEFAULT_BENCHMARK or DEFAULT_BENCHMARK).strip()
    annualization = 252

    series_start = series.index[0].date()
    rf_series, rf_source = get_risk_free_rate(db, series_start, end)
    # Compound the annualised rate down to a daily one, as comparison_service does —
    # dividing by 252 would overstate it slightly and make every Sharpe a little low.
    rf_annual_aligned = rf_series.reindex(series.index).ffill().bfill()
    rf_periodic = (1 + rf_annual_aligned) ** (1 / annualization) - 1
    rf_annual = float(rf_series.mean())

    wealth = (1 + series).cumprod()
    drawdown = returns_mod.max_drawdown(series)
    sharpe_result = risk.sharpe(series, rf_periodic, annualization)
    sortino_value = risk.sortino(series, 0.0, annualization)
    cagr_value = returns_mod.cagr(wealth)
    volatility = returns_mod.annualized_vol(series, annualization)
    var95 = risk.historical_var(series, 0.95)
    cvar95 = risk.cvar(series, 0.95)

    result = {
        "has_investments": True,
        "currency": shared,
        "period": period,
        "series": meta,
        "risk_free_rate_annual": round(rf_annual, 4),
        "risk_free_rate_source": rf_source,
        "performance": {
            "cumulative_return_pct": round((float(wealth.iloc[-1]) - 1) * 100, 2),
            "cagr_pct": round(cagr_value * 100, 2) if cagr_value is not None else None,
        },
        "risk": {
            "annualized_volatility_pct": (
                round(volatility * 100, 2) if volatility is not None else None
            ),
            "max_drawdown_pct": round(drawdown.depth * 100, 2) if drawdown else None,
            "current_drawdown_pct": round(drawdown.current_dd * 100, 2) if drawdown else None,
            "days_under_water": drawdown.days_under_water if drawdown else None,
            "var_95_daily_pct": round(var95 * 100, 2) if var95 is not None else None,
            "cvar_95_daily_pct": round(cvar95 * 100, 2) if cvar95 is not None else None,
            "var_note": (
                "VaR is the daily loss exceeded 5% of the time; CVaR is the average loss "
                "on those worst 5% of days."
            ),
        },
        "risk_adjusted": {
            "sharpe": round(sharpe_result.value, 2) if sharpe_result else None,
            "sharpe_ci": (
                [round(sharpe_result.ci_low, 2), round(sharpe_result.ci_high, 2)]
                if sharpe_result
                else None
            ),
            "sortino": round(sortino_value, 2) if sortino_value is not None else None,
        },
    }

    if len(series) < MIN_RISK_OBSERVATIONS:
        result["risk_adjusted"]["unavailable_because"] = (
            f"Sharpe and Sortino need at least {MIN_RISK_OBSERVATIONS} observations; "
            f"this series has {len(series)}."
        )

    # Benchmark relation — a separate try, so a failed benchmark fetch doesn't
    # cost the caller everything above.
    try:
        bench_history = get_price_history([benchmark_symbol], series_start, end, db=db)
        if benchmark_symbol in bench_history and not bench_history[benchmark_symbol].empty:
            bench_returns = bench_history[benchmark_symbol]["close"].pct_change().dropna()
            aligned = pd.concat([series, bench_returns], axis=1, join="inner").dropna()
            if len(aligned) >= MIN_RISK_OBSERVATIONS:
                rf_aligned = rf_periodic.reindex(aligned.index).ffill().bfill()
                model = relation.market_model(
                    aligned.iloc[:, 0] - rf_aligned,
                    aligned.iloc[:, 1] - rf_aligned,
                    annualization,
                )
                bench_wealth = (1 + aligned.iloc[:, 1]).cumprod()
                result["vs_benchmark"] = {
                    "symbol": benchmark_symbol,
                    "benchmark_return_pct": round((float(bench_wealth.iloc[-1]) - 1) * 100, 2),
                    "beta": round(model.beta, 2) if model else None,
                    "alpha_annual_pct": round(model.alpha_annual * 100, 2) if model else None,
                    "alpha_is_significant": (
                        bool(model.alpha_pvalue < 0.05) if model else None
                    ),
                    "r_squared": round(model.r_squared, 2) if model else None,
                    "correlation": round(float(aligned.iloc[:, 0].corr(aligned.iloc[:, 1])), 2),
                }
            else:
                result["vs_benchmark"] = {
                    "symbol": benchmark_symbol,
                    "unavailable_because": (
                        f"Only {len(aligned)} overlapping days with the benchmark; "
                        f"beta needs {MIN_RISK_OBSERVATIONS}."
                    ),
                }
    except Exception as exc:
        logger.warning("Portfolio benchmark comparison failed: %s", exc)
        result["vs_benchmark"] = {"symbol": benchmark_symbol, "error": str(exc)}

    return result
