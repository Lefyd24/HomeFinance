"""Tools for the financial-health-review skill: deterministic analysis of the user's own
transactions and recurring expenses.

Transaction semantics deliberately match `TransactionService.get_totals`: only rows with
type "income" or "expense" count, so transfers (including retagged linked-account legs)
and internal moves are never double-counted; nothing is FX-converted (the app sums raw
amounts everywhere, so a note is attached when more than one account currency exists);
pending bank rows are included exactly as the app's own totals include them. Every query
is scoped to `user_id`, which is injected server-side and never appears in a schema.

Must not import app.services.ai_service (circular).
"""
import re
import statistics
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Account, Category, Transaction
from app.models.recurring_expense import RecurringExpense, RecurringExpensePayment

UNCATEGORISED = "Uncategorised"
MAX_MONTHS = 36
CREEP_THRESHOLD_PCT = 5.0


def _today() -> date:
    return date.today()


# --- shared helpers ------------------------------------------------------------


def _clamp(value, default: int, lo: int, hi: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(lo, min(number, hi))


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _complete_months(months: int) -> tuple[list[str], date, date]:
    """The last `months` complete calendar months, oldest first, with the date bounds."""
    today = _today()
    first_of_this_month = today.replace(day=1)
    end = first_of_this_month - timedelta(days=1)
    year, month = first_of_this_month.year, first_of_this_month.month
    keys: list[str] = []
    for _ in range(months):
        month -= 1
        if month == 0:
            month, year = 12, year - 1
        keys.append(f"{year:04d}-{month:02d}")
    keys.reverse()
    start = date(int(keys[0][:4]), int(keys[0][5:]), 1)
    return keys, start, end


def _currency_note(db: Session, user_id: int) -> Optional[str]:
    rows = (
        db.query(Account.currency)
        .join(Transaction, Transaction.account_id == Account.id)
        .filter(Transaction.user_id == user_id)
        .distinct()
        .all()
    )
    currencies = sorted({(r[0] or "").upper() for r in rows if r[0]})
    if len(currencies) > 1:
        return (
            f"Transactions span several account currencies ({', '.join(currencies)}); amounts "
            "are summed as recorded, without FX conversion, exactly as the app's own totals are."
        )
    return None


def _rows(db: Session, user_id: int, start: date, end: date, tx_type: str):
    return (
        db.query(
            Transaction.id,
            Transaction.date,
            Transaction.amount,
            Transaction.description,
            Transaction.category_id,
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == tx_type,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .all()
    )


def _category_names(db: Session, user_id: int) -> dict[int, str]:
    rows = (
        db.query(Category.id, Category.name)
        .filter((Category.user_id == user_id) | (Category.user_id.is_(None)))
        .all()
    )
    return {r[0]: r[1] for r in rows}


def _trim_leading_empty(keys: list[str], active: set[str]) -> list[str]:
    for i, key in enumerate(keys):
        if key in active:
            return keys[i:]
    return []


def _pct_change(new: float, old: Optional[float]) -> Optional[float]:
    if old is None or old <= 0:
        return None
    return round((new - old) / old * 100, 1)


# --- get_cashflow_trend_tool ----------------------------------------------------


def get_cashflow_trend_tool(db: Session, user_id: int, months: int = 12) -> dict:
    """Monthly income, expenses, net and savings rate over the last N complete months."""
    months = _clamp(months, 12, 1, MAX_MONTHS)
    keys, start, end = _complete_months(months)

    income: dict[str, float] = defaultdict(float)
    expenses: dict[str, float] = defaultdict(float)
    for row in _rows(db, user_id, start, end, "income"):
        income[_month_key(row.date)] += float(row.amount)
    for row in _rows(db, user_id, start, end, "expense"):
        expenses[_month_key(row.date)] += float(row.amount)

    active = set(income) | set(expenses)
    analysed = _trim_leading_empty(keys, active)
    notes: list[str] = []
    currency_note = _currency_note(db, user_id)
    if currency_note:
        notes.append(currency_note)

    result: dict = {
        "months_requested": months,
        "months_analyzed": len(analysed),
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "months": [],
        "summary": None,
        "current_month_partial": None,
        "data_notes": notes,
    }

    # The in-progress month, shown separately so it never distorts a monthly average.
    today = _today()
    cm_start = today.replace(day=1)
    cm_income = sum(float(r.amount) for r in _rows(db, user_id, cm_start, today, "income"))
    cm_expenses = sum(float(r.amount) for r in _rows(db, user_id, cm_start, today, "expense"))
    if cm_income or cm_expenses:
        result["current_month_partial"] = {
            "month": _month_key(today),
            "days_elapsed": today.day,
            "income": round(cm_income, 2),
            "expenses": round(cm_expenses, 2),
            "net": round(cm_income - cm_expenses, 2),
            "note": "Month in progress: do not compare directly with complete months.",
        }

    if not analysed:
        notes.append("No income or expense transactions in this period.")
        return result

    rows = []
    for key in analysed:
        inc, exp = income.get(key, 0.0), expenses.get(key, 0.0)
        net = inc - exp
        rows.append(
            {
                "month": key,
                "income": round(inc, 2),
                "expenses": round(exp, 2),
                "net": round(net, 2),
                "savings_rate_pct": round(net / inc * 100, 1) if inc > 0 else None,
            }
        )
    # Rolling 3-month averages (shorter at the start of the series).
    for i, row in enumerate(rows):
        window = rows[max(0, i - 2) : i + 1]
        w_income = sum(r["income"] for r in window)
        w_net = sum(r["net"] for r in window)
        row["rolling_3m_avg_net"] = round(w_net / len(window), 2)
        row["rolling_3m_savings_rate_pct"] = round(w_net / w_income * 100, 1) if w_income > 0 else None
    result["months"] = rows

    total_income = sum(r["income"] for r in rows)
    total_expenses = sum(r["expenses"] for r in rows)
    total_net = total_income - total_expenses
    incomes = [r["income"] for r in rows]
    mean_income = statistics.fmean(incomes)
    cv = None
    if len(incomes) >= 3 and mean_income > 0:
        cv = round(statistics.pstdev(incomes) / mean_income * 100, 1)
    if cv is None:
        stability = "unknown"
    elif cv < 10:
        stability = "stable"
    elif cv < 25:
        stability = "moderately variable"
    else:
        stability = "highly variable"
    negative_months = sum(1 for r in rows if r["net"] < 0)

    result["summary"] = {
        "avg_monthly_income": round(total_income / len(rows), 2),
        "avg_monthly_expenses": round(total_expenses / len(rows), 2),
        "avg_monthly_net": round(total_net / len(rows), 2),
        "overall_savings_rate_pct": round(total_net / total_income * 100, 1) if total_income > 0 else None,
        "income_cv_pct": cv,
        "income_stability": stability,
        "months_with_negative_net": negative_months,
        "best_month": max(rows, key=lambda r: r["net"])["month"],
        "worst_month": min(rows, key=lambda r: r["net"])["month"],
    }
    if len(rows) < 3:
        notes.append(
            f"Only {len(rows)} month(s) of history: averages and stability are indicative at best."
        )
    if total_income <= 0:
        notes.append(
            "No income recorded in this period, so savings rate is undefined. Income may be "
            "booked on an account that is not tracked, or typed as a transfer."
        )
    return result


# --- get_category_trends_tool ----------------------------------------------------


def get_category_trends_tool(db: Session, user_id: int, months: int = 6, top_n: int = 8) -> dict:
    """Per-category monthly expense totals, MoM change versus the trailing average, top movers."""
    months = _clamp(months, 6, 1, MAX_MONTHS)
    top_n = _clamp(top_n, 8, 1, 25)
    keys, start, end = _complete_months(months)
    names = _category_names(db, user_id)

    per_cat: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    active: set[str] = set()
    uncategorised_total = 0.0
    grand_total = 0.0
    for row in _rows(db, user_id, start, end, "expense"):
        key = _month_key(row.date)
        name = names.get(row.category_id) if row.category_id is not None else None
        if name is None:
            name = UNCATEGORISED
            uncategorised_total += float(row.amount)
        per_cat[name][key] += float(row.amount)
        active.add(key)
        grand_total += float(row.amount)

    analysed = _trim_leading_empty(keys, active)
    notes: list[str] = []
    currency_note = _currency_note(db, user_id)
    if currency_note:
        notes.append(currency_note)
    result: dict = {
        "months_requested": months,
        "months_analyzed": len(analysed),
        "months": analysed,
        "total_expenses": round(grand_total, 2),
        "categories": [],
        "biggest_increases": [],
        "biggest_decreases": [],
        "uncategorised_share_pct": None,
        "data_notes": notes,
    }
    if not analysed:
        notes.append("No expense transactions in this period.")
        return result

    n = len(analysed)
    entries = []
    for name, by_month in per_cat.items():
        series = [round(by_month.get(k, 0.0), 2) for k in analysed]
        total = sum(series)
        last = series[-1]
        previous = series[-2] if n >= 2 else None
        earlier = series[:-1]
        trailing_avg = statistics.fmean(earlier) if earlier else None
        entries.append(
            {
                "category": name,
                "monthly": series,
                "total": round(total, 2),
                "avg_monthly": round(total / n, 2),
                "share_pct": round(total / grand_total * 100, 1) if grand_total else None,
                "last_month": last,
                "previous_month": previous,
                "mom_change_pct": _pct_change(last, previous) if previous is not None else None,
                "trailing_avg_excl_last": round(trailing_avg, 2) if trailing_avg is not None else None,
                "vs_trailing_avg_pct": _pct_change(last, trailing_avg) if trailing_avg else None,
                "vs_trailing_avg_amount": round(last - trailing_avg, 2) if trailing_avg is not None else None,
            }
        )
    entries.sort(key=lambda e: e["total"], reverse=True)
    top, rest = entries[:top_n], entries[top_n:]
    result["categories"] = top
    if rest:
        rest_total = sum(e["total"] for e in rest)
        result["other_categories"] = {
            "count": len(rest),
            "total": round(rest_total, 2),
            "share_pct": round(rest_total / grand_total * 100, 1) if grand_total else None,
        }

    if n >= 3:
        movers = [e for e in entries if e["vs_trailing_avg_amount"] is not None and e["trailing_avg_excl_last"]]
        ups = sorted((e for e in movers if e["vs_trailing_avg_amount"] > 0), key=lambda e: -e["vs_trailing_avg_amount"])
        downs = sorted((e for e in movers if e["vs_trailing_avg_amount"] < 0), key=lambda e: e["vs_trailing_avg_amount"])
        pick = ("category", "last_month", "trailing_avg_excl_last", "vs_trailing_avg_amount", "vs_trailing_avg_pct")
        result["biggest_increases"] = [{k: e[k] for k in pick} for e in ups[:3]]
        result["biggest_decreases"] = [{k: e[k] for k in pick} for e in downs[:3]]
    else:
        notes.append("Fewer than 3 months of expenses: trailing-average comparisons were skipped.")

    if grand_total > 0:
        share = round(uncategorised_total / grand_total * 100, 1)
        result["uncategorised_share_pct"] = share
        if share >= 15:
            notes.append(
                f"{share}% of spending is uncategorised, so the category picture is incomplete."
            )
    return result


# --- detect_spending_anomalies_tool ------------------------------------------------


def _normalise_merchant(description: Optional[str]) -> str:
    text = re.sub(r"[^a-zͰ-Ͽἀ-῿ ]+", " ", (description or "").lower())
    return " ".join(text.split()[:4])


def detect_spending_anomalies_tool(db: Session, user_id: int, months: int = 6) -> dict:
    """Unusually large expenses, spiking category-months, and newly recurring merchants."""
    months = _clamp(months, 6, 2, MAX_MONTHS)
    keys, start, end = _complete_months(months)
    names = _category_names(db, user_id)
    rows = _rows(db, user_id, start, end, "expense")

    notes: list[str] = []
    currency_note = _currency_note(db, user_id)
    if currency_note:
        notes.append(currency_note)
    result: dict = {
        "months_requested": months,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "transactions_analyzed": len(rows),
        "large_transactions": [],
        "category_spikes": [],
        "new_recurring_merchants": [],
        "data_notes": notes,
    }
    if not rows:
        notes.append("No expense transactions in this period.")
        return result

    by_cat_tx: dict[str, list] = defaultdict(list)
    by_cat_month: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    active_months: set[str] = set()
    for row in rows:
        name = names.get(row.category_id) if row.category_id is not None else None
        name = name or UNCATEGORISED
        by_cat_tx[name].append(row)
        month = _month_key(row.date)
        by_cat_month[name][month] += float(row.amount)
        active_months.add(month)
    analysed = _trim_leading_empty(keys, active_months)
    if len(analysed) < 4:
        notes.append(
            f"Only {len(analysed)} month(s) of history: category-spike detection needs at "
            "least 4 months and large-transaction detection is less reliable."
        )

    # 1. Large transactions: above the category's IQR fence AND at least twice its median.
    large = []
    for name, txs in by_cat_tx.items():
        if name == UNCATEGORISED or len(txs) < 5:
            continue
        amounts = [float(t.amount) for t in txs]
        q1, median, q3 = statistics.quantiles(amounts, n=4, method="inclusive")
        fence = q3 + 1.5 * (q3 - q1)
        for t in txs:
            amount = float(t.amount)
            if amount > fence and amount >= 2 * median:
                large.append(
                    {
                        "id": t.id,
                        "date": t.date.isoformat(),
                        "description": t.description,
                        "category": name,
                        "amount": round(amount, 2),
                        "category_median": round(median, 2),
                        "threshold": round(max(fence, 2 * median), 2),
                    }
                )
    large.sort(key=lambda r: -r["amount"])
    result["large_transactions"] = large[:10]

    # 2. Category-month spikes against a leave-one-out baseline of the other months.
    spikes = []
    for name, by_month in by_cat_month.items():
        series = {k: by_month.get(k, 0.0) for k in analysed}
        if len(series) < 4:
            continue
        for month, amount in series.items():
            others = [v for k, v in series.items() if k != month]
            mean = statistics.fmean(others)
            std = statistics.stdev(others) if len(others) > 1 else 0.0
            if mean <= 0 or amount <= mean * 1.25:
                continue
            if std > 0:
                z = (amount - mean) / std
                if z < 2:
                    continue
                z_out: Optional[float] = round(z, 1)
            elif amount > mean * 1.5:
                z_out = None
            else:
                continue
            spikes.append(
                {
                    "category": name,
                    "month": month,
                    "amount": round(amount, 2),
                    "baseline_avg": round(mean, 2),
                    "excess": round(amount - mean, 2),
                    "z_score": z_out,
                }
            )
    spikes.sort(key=lambda r: -r["excess"])
    result["category_spikes"] = spikes[:10]

    # 3. Merchants that look recurring and started recently (first ever sighting in the last
    #    3 complete months, seen in >= 2 distinct months, amounts within ~15% of each other).
    history = (
        db.query(Transaction.date, Transaction.amount, Transaction.description)
        .filter(Transaction.user_id == user_id, Transaction.type == "expense", Transaction.date <= end)
        .all()
    )
    merchants: dict[str, list] = defaultdict(list)
    for h in history:
        key = _normalise_merchant(h.description)
        if key:
            merchants[key].append(h)
    recent_cutoff_key = analysed[max(0, len(analysed) - 3)] if analysed else keys[-1]
    new_recurring = []
    for key, txs in merchants.items():
        first = min(t.date for t in txs)
        if _month_key(first) < recent_cutoff_key:
            continue
        months_seen = {_month_key(t.date) for t in txs}
        if len(months_seen) < 2:
            continue
        amounts = [float(t.amount) for t in txs]
        mean = statistics.fmean(amounts)
        if mean <= 0 or statistics.pstdev(amounts) / mean > 0.15:
            continue
        new_recurring.append(
            {
                "merchant": key,
                "first_seen": first.isoformat(),
                "occurrences": len(txs),
                "months_seen": len(months_seen),
                "typical_amount": round(mean, 2),
                "annualised_if_monthly": round(mean * 12, 2),
            }
        )
    new_recurring.sort(key=lambda r: -r["typical_amount"])
    result["new_recurring_merchants"] = new_recurring[:10]
    return result


# --- get_subscription_audit_tool --------------------------------------------------


def _cycles_per_year(interval: int, unit: str) -> float:
    interval = max(1, int(interval or 1))
    unit = (unit or "months").lower()
    if unit.startswith("day"):
        return 365.0 / interval
    if unit.startswith("week"):
        return 52.0 / interval
    if unit.startswith("year"):
        return 1.0 / interval
    return 12.0 / interval


def get_subscription_audit_tool(db: Session, user_id: int) -> dict:
    """Active recurring expenses: annualised cost, price changes over time, possible duplicates."""
    expenses = (
        db.query(RecurringExpense)
        .filter(RecurringExpense.user_id == user_id, RecurringExpense.is_active == True)  # noqa: E712
        .all()
    )
    notes: list[str] = []
    result: dict = {
        "count": len(expenses),
        "items": [],
        "total_annual_cost": 0.0,
        "total_monthly_equivalent": 0.0,
        "by_category": [],
        "price_increases": [],
        "possible_duplicates": [],
        "data_notes": notes,
    }
    if not expenses:
        notes.append("No active recurring expenses are recorded.")
        return result

    payments_by_expense: dict[int, list] = defaultdict(list)
    payment_rows = (
        db.query(RecurringExpensePayment)
        .filter(
            RecurringExpensePayment.user_id == user_id,
            RecurringExpensePayment.recurring_expense_id.in_([e.id for e in expenses]),
        )
        .order_by(RecurringExpensePayment.payment_date.asc(), RecurringExpensePayment.id.asc())
        .all()
    )
    for p in payment_rows:
        payments_by_expense[p.recurring_expense_id].append(p)

    today = _today()
    items = []
    by_category: dict[str, float] = defaultdict(float)
    for e in expenses:
        cycles = _cycles_per_year(e.recurrence_interval, e.recurrence_unit)
        annual = float(e.amount) * cycles
        payments = payments_by_expense.get(e.id, [])
        first_amount = float(payments[0].amount) if payments else None
        last_amount = float(payments[-1].amount) if payments else None
        change = None
        if first_amount and last_amount is not None and len(payments) >= 2:
            change = _pct_change(last_amount, first_amount)
        item = {
            "id": e.id,
            "name": e.name,
            "category": e.category.name if e.category else None,
            "amount": round(float(e.amount), 2),
            "every": f"{e.recurrence_interval} {e.recurrence_unit}",
            "annual_cost": round(annual, 2),
            "monthly_equivalent": round(annual / 12, 2),
            "payments_recorded": len(payments),
            "first_payment_amount": round(first_amount, 2) if first_amount is not None else None,
            "latest_payment_amount": round(last_amount, 2) if last_amount is not None else None,
            "price_change_pct": change,
            "next_due_date": e.next_due_date.isoformat() if e.next_due_date else None,
            "overdue": bool(e.next_due_date and e.next_due_date < today - timedelta(days=7)),
        }
        items.append(item)
        by_category[item["category"] or UNCATEGORISED] += annual
        if change is not None and change >= CREEP_THRESHOLD_PCT:
            result["price_increases"].append(
                {
                    "name": e.name,
                    "from": item["first_payment_amount"],
                    "to": item["latest_payment_amount"],
                    "change_pct": change,
                    "extra_annual_cost": round((last_amount - first_amount) * cycles, 2),
                }
            )

    items.sort(key=lambda i: -i["annual_cost"])
    result["items"] = items
    total = sum(i["annual_cost"] for i in items)
    result["total_annual_cost"] = round(total, 2)
    result["total_monthly_equivalent"] = round(total / 12, 2)
    result["by_category"] = [
        {"category": c, "annual_cost": round(v, 2), "share_pct": round(v / total * 100, 1) if total else None}
        for c, v in sorted(by_category.items(), key=lambda kv: -kv[1])
    ]
    result["price_increases"].sort(key=lambda r: -r["extra_annual_cost"])

    groups: dict[str, list[str]] = defaultdict(list)
    for e in expenses:
        key = _normalise_merchant(e.name)
        if key:
            groups[key].append(e.name)
    result["possible_duplicates"] = [names for names in groups.values() if len(names) > 1]

    if not payment_rows:
        notes.append(
            "No payment history is recorded for these items, so price changes over time cannot "
            "be detected; only the current amounts are shown."
        )
    return result


# --- registration ----------------------------------------------------------------


def _int_param(default: int, description: str) -> dict:
    return {"type": "integer", "description": description, "default": default}


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_category_trends_tool",
            "description": (
                "Expense totals per category for each of the last N complete months, with the "
                "last month's change versus the previous month and versus the trailing average, "
                "share of spending, the biggest increases/decreases, and the uncategorised share. "
                "Transfers are excluded."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "months": _int_param(6, "Complete months to analyse, 1-36. Default 6."),
                    "top_n": _int_param(8, "Categories to list individually, 1-25. Default 8."),
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cashflow_trend_tool",
            "description": (
                "Monthly income, expenses, net and savings rate for the last N complete months, "
                "with 3-month rolling averages, overall savings rate and an income-stability "
                "measure. Also shows the in-progress month separately. Transfers are excluded."
            ),
            "parameters": {
                "type": "object",
                "properties": {"months": _int_param(12, "Complete months, 1-36. Default 12.")},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "detect_spending_anomalies_tool",
            "description": (
                "Statistical outliers in the user's spending: unusually large transactions "
                "within a category, category-months that spiked versus the other months, and "
                "merchants that look newly recurring."
            ),
            "parameters": {
                "type": "object",
                "properties": {"months": _int_param(6, "Complete months to scan, 2-36. Default 6.")},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_subscription_audit_tool",
            "description": (
                "Audit of active recurring expenses: annualised cost per item and in total, by "
                "category, price increases between the first and latest recorded payment, "
                "overdue items and possible duplicates."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

DISPATCH = {
    "get_category_trends_tool": get_category_trends_tool,
    "get_cashflow_trend_tool": get_cashflow_trend_tool,
    "detect_spending_anomalies_tool": detect_spending_anomalies_tool,
    "get_subscription_audit_tool": get_subscription_audit_tool,
}
NEEDS_USER_EMAIL: set[str] = set()
