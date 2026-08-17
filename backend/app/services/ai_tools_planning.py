"""Tools that connect the portfolio to the rest of the user's financial life.

These are what make the advisor's answers *personal* rather than generic. Each
one wraps a calculator that already exists in `advisor_service` or
`forecast_service`, because the model must never do the arithmetic itself — a
confidently wrong compound-interest figure is the characteristic failure mode of
an LLM giving financial advice.

Same contract as `ai_tools.py`: `(db, user_id, ...)`, with `user_id` supplied by
the router from the authenticated user and never present in the JSON schema
handed to the model.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Debt, FinancialGoal, RecurringExpense
from app.services.advisor_service import (
    EmergencyFundCalculator,
    InvestmentCalculator,
    LoanCalculator,
    NetWorthTracker,
)
from app.services.forecast_service import CashflowProjector

#: Debt above this rate is treated as beating any plausible market return, so
#: the surplus calculation assumes you clear it before investing. Roughly the
#: long-run real return on equities, rounded up — stated in the output so the
#: assumption is visible rather than buried.
HIGH_INTEREST_THRESHOLD = 0.08


def get_net_worth_tool(db: Session, user_id: int, include_history: bool = False) -> dict:
    """Assets minus liabilities, broken down by account type."""
    tracker = NetWorthTracker(db, user_id)
    result = {"current": tracker.calculate_current()}
    if include_history:
        result["history_12m"] = tracker.get_history(months=12)
    return result


def get_emergency_fund_status_tool(db: Session, user_id: int) -> dict:
    """How many months of expenses the user's liquid assets cover, and the gap
    to a recommended cushion."""
    return EmergencyFundCalculator(db, user_id).calculate_recommendation()


def get_goals_tool(db: Session, user_id: int, active_only: bool = True) -> dict:
    """Savings goals with target amounts, dates and progress."""
    query = db.query(FinancialGoal).filter(FinancialGoal.user_id == user_id)
    if active_only:
        query = query.filter(FinancialGoal.status == "active")
    goals = query.order_by(FinancialGoal.target_date.asc().nullslast()).all()

    today = date.today()
    rows = []
    for goal in goals:
        target = float(goal.target_amount or 0)
        current = float(goal.current_amount or 0)
        months_left = None
        if goal.target_date:
            months_left = max(
                0, round((goal.target_date - today).days / 30.44, 1)
            )
        rows.append(
            {
                "id": goal.id,
                "name": goal.name,
                "target_amount": target,
                "current_amount": current,
                "remaining": round(target - current, 2),
                "progress_pct": round(current / target * 100, 1) if target else None,
                "currency": goal.currency,
                "target_date": goal.target_date.isoformat() if goal.target_date else None,
                "months_remaining": months_left,
                "required_monthly": (
                    round((target - current) / months_left, 2)
                    if months_left and months_left > 0 and target > current
                    else None
                ),
                "status": goal.status,
                "is_primary": goal.is_primary,
            }
        )
    return {"goals": rows, "count": len(rows)}


def get_investable_surplus_tool(db: Session, user_id: int, months_lookback: int = 6) -> dict:
    """How much the user can realistically invest each month.

    Average net cashflow, less the emergency-fund shortfall spread over a year,
    less the minimum payments on high-interest debt. Every deduction is returned
    separately with its reasoning so the advisor can explain the number rather
    than just assert it.
    """
    months = max(1, min(int(months_lookback or 6), 24))
    cashflow = CashflowProjector(db, user_id).get_average_cashflow(months=months)
    monthly_net = float(cashflow.get("monthly_net") or 0.0)

    emergency = EmergencyFundCalculator(db, user_id).calculate_recommendation()
    # `gap_to_recommended` is already floored at zero and is present even in the
    # calculator's no-expense-data branch, where it is 0.
    shortfall = float(emergency.get("gap_to_recommended") or 0.0)
    # Spread the shortfall over a year rather than demanding it all at once —
    # "invest nothing until the fund is full" is advice nobody follows.
    emergency_monthly = round(shortfall / 12, 2) if shortfall > 0 else 0.0

    high_interest_debts = [
        debt
        for debt in db.query(Debt)
        .filter(Debt.user_id == user_id, Debt.is_active == True)  # noqa: E712
        .all()
        if not debt.is_paid_off
        and (debt.interest_rate or 0) >= HIGH_INTEREST_THRESHOLD
    ]
    high_interest_monthly = round(
        sum(float(d.minimum_payment or 0.0) for d in high_interest_debts), 2
    )

    surplus = round(monthly_net - emergency_monthly - high_interest_monthly, 2)

    return {
        "months_of_history_used": months,
        "average_monthly_income": round(float(cashflow.get("monthly_income") or 0.0), 2),
        "average_monthly_expenses": round(float(cashflow.get("monthly_expenses") or 0.0), 2),
        "average_monthly_net": round(monthly_net, 2),
        "deductions": {
            "emergency_fund_topup": emergency_monthly,
            "emergency_fund_shortfall_total": round(shortfall, 2),
            "emergency_fund_status": emergency.get("status"),
            "emergency_fund_months_covered": (
                emergency.get("current_coverage", {}).get("months_covered")
            ),
            "high_interest_debt_payments": high_interest_monthly,
            "high_interest_debts": [
                {
                    "name": d.name,
                    "interest_rate_pct": round((d.interest_rate or 0) * 100, 2),
                    "minimum_payment": float(d.minimum_payment or 0.0),
                    "balance": float(d.current_balance or 0.0),
                }
                for d in high_interest_debts
            ],
        },
        "investable_monthly_surplus": surplus,
        "assumptions": [
            f"Averaged over the last {months} months of recorded transactions.",
            f"Any emergency-fund shortfall is topped up over 12 months ({emergency_monthly}/month).",
            f"Debt above {round(HIGH_INTEREST_THRESHOLD * 100)}% is treated as beating a "
            "plausible market return, so its minimum payments come out first.",
            "Irregular one-off income or spending in the lookback window will skew this.",
        ],
    }


def project_investment_tool(
    db: Session,
    user_id: int,
    years: int,
    annual_return_pct: float,
    principal: float = 0.0,
    monthly_contribution: float = 0.0,
) -> dict:
    """Compound-growth projection. Use this instead of calculating growth yourself."""
    if years <= 0 or years > 60:
        return {"error": "years must be between 1 and 60"}
    if annual_return_pct < -50 or annual_return_pct > 50:
        return {"error": "annual_return_pct must be between -50 and 50"}

    result = InvestmentCalculator.calculate_compound_interest(
        principal=float(principal or 0.0),
        annual_rate=float(annual_return_pct) / 100.0,
        years=int(years),
        compounds_per_year=12,
        monthly_contribution=float(monthly_contribution or 0.0),
    )
    result["assumptions"] = [
        f"A constant {annual_return_pct}% annual return, compounded monthly.",
        "Real returns are not constant — this is a smooth curve through a bumpy reality, "
        "not a forecast. It ignores tax, fees and inflation.",
    ]
    return result


def compare_invest_vs_debt_payoff_tool(
    db: Session,
    user_id: int,
    debt_id: int,
    monthly_amount: float,
    assumed_annual_return_pct: float = 7.0,
) -> dict:
    """Put a spare monthly amount against a debt, or invest it — which ends up ahead?

    Both sides are computed here so the comparison is arithmetic rather than
    intuition. The result includes the break-even return: the market return at
    which the two choices are equivalent.
    """
    debt = (
        db.query(Debt)
        .filter(Debt.id == debt_id, Debt.user_id == user_id)
        .first()
    )
    if debt is None:
        return {"error": f"No debt with id {debt_id}."}
    if debt.is_paid_off or (debt.current_balance or 0) <= 0:
        return {"error": f"{debt.name} is already paid off."}

    monthly_amount = float(monthly_amount or 0.0)
    if monthly_amount <= 0:
        return {"error": "monthly_amount must be greater than zero."}

    balance = float(debt.current_balance)
    annual_rate = float(debt.interest_rate or 0.0)
    minimum_payment = float(debt.minimum_payment or 0.0)

    if minimum_payment <= 0:
        return {
            "error": (
                f"{debt.name} has no minimum payment recorded, so its repayment schedule "
                "cannot be modelled. Add one on the debt to compare."
            )
        }

    # Remaining term at the current minimum payment.
    monthly_rate = annual_rate / 12
    if monthly_rate > 0 and minimum_payment <= balance * monthly_rate:
        return {
            "error": (
                f"The minimum payment on {debt.name} does not cover its monthly interest, "
                "so the balance never falls. Clearing this debt is the only option worth "
                "modelling."
            )
        }

    remaining_months = 0
    simulated = balance
    while simulated > 0 and remaining_months < 720:
        simulated = simulated * (1 + monthly_rate) - minimum_payment
        remaining_months += 1

    payoff = LoanCalculator.calculate_early_payoff(
        principal=balance,
        annual_rate=annual_rate,
        term_months=remaining_months,
        extra_monthly_payment=monthly_amount,
    )
    interest_saved = float(payoff.get("interest_saved") or 0.0)

    years = max(1, round(remaining_months / 12))
    investing = InvestmentCalculator.calculate_compound_interest(
        principal=0.0,
        annual_rate=float(assumed_annual_return_pct) / 100.0,
        years=years,
        compounds_per_year=12,
        monthly_contribution=monthly_amount,
    )
    investment_gain = float(investing.get("total_interest") or 0.0)

    return {
        "debt": {
            "id": debt.id,
            "name": debt.name,
            "balance": round(balance, 2),
            "interest_rate_pct": round(annual_rate * 100, 2),
            "minimum_payment": minimum_payment,
            "months_remaining_at_minimum": remaining_months,
        },
        "monthly_amount": monthly_amount,
        "horizon_years": years,
        "pay_down_debt": {
            "interest_saved": round(interest_saved, 2),
            "months_saved": payoff.get("months_saved"),
            "new_payoff_months": payoff.get("new_term_months"),
        },
        "invest_instead": {
            "assumed_annual_return_pct": assumed_annual_return_pct,
            "final_balance": round(float(investing.get("final_balance") or 0.0), 2),
            "total_contributed": round(float(investing.get("total_contributions") or 0.0), 2),
            "investment_gain": round(investment_gain, 2),
        },
        "verdict": {
            "better_on_these_numbers": (
                "pay_down_debt" if interest_saved > investment_gain else "invest"
            ),
            "difference": round(abs(investment_gain - interest_saved), 2),
            "break_even_note": (
                f"Paying the debt down is a guaranteed {round(annual_rate * 100, 2)}% return. "
                f"Investing only wins if it beats that after tax and fees — and unlike the "
                f"debt saving, it is not guaranteed."
            ),
        },
        "assumptions": [
            f"Compares over {years} year(s), the debt's remaining term at its minimum payment.",
            "Investment growth assumes a constant return and ignores tax, fees and volatility.",
            "Ignores the psychological value of being debt-free, which is real and not modelled.",
        ],
    }


def get_recurring_commitments_tool(
    db: Session, user_id: int, active_only: bool = True
) -> dict:
    """Total monthly cost of recurring commitments, normalised to a monthly figure.

    Separate from `get_recurring_expenses_tool`, which lists them: this answers
    "what is already spoken for each month" in one number.
    """
    query = db.query(RecurringExpense).filter(RecurringExpense.user_id == user_id)
    if active_only:
        query = query.filter(RecurringExpense.is_active == True)  # noqa: E712

    # Normalise every recurrence to a monthly equivalent.
    per_month = {"days": 30.44, "weeks": 4.35, "months": 1.0, "years": 1 / 12}
    total = 0.0
    rows = []
    for expense in query.all():
        unit = (expense.recurrence_unit or "months").lower()
        interval = max(1, int(expense.recurrence_interval or 1))
        factor = per_month.get(unit)
        if factor is None:
            continue
        monthly = float(expense.amount or 0.0) * factor / interval
        total += monthly
        rows.append(
            {
                "name": expense.name,
                "amount": float(expense.amount or 0.0),
                "every": f"{interval} {unit}",
                "monthly_equivalent": round(monthly, 2),
            }
        )

    rows.sort(key=lambda r: r["monthly_equivalent"], reverse=True)
    return {
        "monthly_total": round(total, 2),
        "count": len(rows),
        "commitments": rows,
    }


# --- tool registration -----------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_net_worth_tool",
            "description": (
                "Total assets minus liabilities, broken down by account type. Use this to "
                "put a holding or a portfolio in the context of everything the user owns."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "include_history": {
                        "type": "boolean",
                        "description": "Also return the last 12 months of net worth",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_emergency_fund_status_tool",
            "description": (
                "How many months of expenses the user's liquid savings cover, and the gap "
                "to a recommended cushion. Check this before advising anyone to invest more."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_goals_tool",
            "description": (
                "The user's savings goals with target amounts, target dates, progress and "
                "the monthly saving each still requires. Goal horizons are what make an "
                "investment horizon concrete."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "active_only": {"type": "boolean", "description": "Default true"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_investable_surplus_tool",
            "description": (
                "How much the user can realistically invest each month: average net "
                "cashflow, less an emergency-fund top-up, less high-interest debt payments. "
                "Every deduction and assumption is returned so you can explain the figure. "
                "Use this instead of estimating what they can afford."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "months_lookback": {
                        "type": "integer",
                        "description": "Months of history to average over, default 6, max 24",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recurring_commitments_tool",
            "description": (
                "The total monthly cost of recurring bills and subscriptions, with every "
                "recurrence normalised to a monthly figure."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "active_only": {"type": "boolean", "description": "Default true"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "project_investment_tool",
            "description": (
                "Compound-growth projection for a lump sum and/or a monthly contribution. "
                "ALWAYS use this instead of working out growth yourself — you will get it "
                "wrong. Returns the final balance, total contributed, total growth and a "
                "year-by-year breakdown."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "years": {"type": "integer", "description": "1 to 60"},
                    "annual_return_pct": {
                        "type": "number",
                        "description": "Assumed annual return as a percentage, e.g. 7 for 7%",
                    },
                    "principal": {"type": "number", "description": "Starting amount, default 0"},
                    "monthly_contribution": {"type": "number", "description": "Default 0"},
                },
                "required": ["years", "annual_return_pct"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_invest_vs_debt_payoff_tool",
            "description": (
                "For a spare monthly amount: compare putting it against a specific debt "
                "versus investing it. Returns interest saved, investment growth, which wins "
                "on these numbers, and the guaranteed return that clearing the debt "
                "represents. Use this for any 'should I pay off X or invest' question — "
                "get the debt's id from get_debts_tool first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "debt_id": {"type": "integer"},
                    "monthly_amount": {"type": "number"},
                    "assumed_annual_return_pct": {
                        "type": "number",
                        "description": "Assumed market return, default 7",
                    },
                },
                "required": ["debt_id", "monthly_amount"],
            },
        },
    },
]

DISPATCH = {
    "get_net_worth_tool": get_net_worth_tool,
    "get_emergency_fund_status_tool": get_emergency_fund_status_tool,
    "get_goals_tool": get_goals_tool,
    "get_investable_surplus_tool": get_investable_surplus_tool,
    "get_recurring_commitments_tool": get_recurring_commitments_tool,
    "project_investment_tool": project_investment_tool,
    "compare_invest_vs_debt_payoff_tool": compare_invest_vs_debt_payoff_tool,
}
