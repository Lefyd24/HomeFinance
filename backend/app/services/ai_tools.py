"""Read-only "tool" functions the AI chat agent can call.

Every function takes `db` and `user_id` as plain arguments supplied by the
router from the authenticated user — never from the LLM's tool-call
arguments. This is the security boundary: the JSON schemas handed to
DeepSeek (see ai_service.AI_TOOLS) never expose `user_id` or an email
recipient, so the model has no way to reach another user's data or redirect
the email tool.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Account, Budget, Debt, RecurringExpense
from app.routers.budgets import calculate_budget_progress
from app.routers.notifications import _get_or_create_settings
from app.services import mail_service, email_templates
from app.services.transaction_service import TransactionService

MAX_TRANSACTIONS_LIMIT = 200


def get_transactions_tool(
    db: Session,
    user_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None,
    category_id: Optional[int] = None,
    account_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """List transactions matching the given filters."""
    parsed_start = date.fromisoformat(start_date) if start_date else None
    parsed_end = date.fromisoformat(end_date) if end_date else None
    clamped_limit = max(1, min(int(limit or 50), MAX_TRANSACTIONS_LIMIT))

    transactions, total = TransactionService.get_transactions(
        db,
        user_id,
        skip=0,
        limit=clamped_limit,
        start_date=parsed_start,
        end_date=parsed_end,
        account_id=account_id,
        category_id=category_id,
        type=type,
        search=search,
    )

    return {
        "count": total,
        "returned": len(transactions),
        "transactions": [
            {
                "id": t.id,
                "date": t.date.isoformat() if t.date else None,
                "description": t.description,
                "amount": float(t.amount),
                "type": t.type,
                "category": t.category.name if t.category else None,
                "account": t.account.name if t.account else None,
            }
            for t in transactions
        ],
    }

def get_totals_tool(
    db: Session,
    user_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group_by: Optional[str] = None,
) -> dict:
    """Get total income, expenses, and net for a period.

    Optionally group into a per-period summary with group_by of day, month, or year.
    """
    parsed_start = date.fromisoformat(start_date) if start_date else None
    parsed_end = date.fromisoformat(end_date) if end_date else None
    return TransactionService.get_totals(
        db,
        user_id,
        start_date=parsed_start,
        end_date=parsed_end,
        group_by=group_by,
    )


def get_account_balances_tool(db: Session, user_id: int) -> dict:
    """List account balances and the total across all active accounts."""
    accounts = (
        db.query(Account)
        .filter(Account.user_id == user_id, Account.is_active == True)  # noqa: E712
        .all()
    )
    return {
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "type": a.type,
                "currency": a.currency,
                "balance": float(a.balance),
            }
            for a in accounts
        ],
        "total_balance": float(sum(a.balance for a in accounts)),
    }


def get_budgets_status_tool(db: Session, user_id: int, active_only: bool = True) -> dict:
    """List budgets with their current-period spend, remaining, and percentage used."""
    query = db.query(Budget).filter(Budget.user_id == user_id)
    if active_only:
        query = query.filter(Budget.is_active == True)  # noqa: E712
    budgets = query.all()

    results = []
    for b in budgets:
        progress = calculate_budget_progress(db, b)
        results.append(
            {
                "id": progress.id,
                "name": progress.name,
                "amount": float(progress.amount),
                "period": progress.period,
                "spent": float(progress.spent),
                "remaining": float(progress.remaining),
                "percentage": progress.percentage,
                "period_start": progress.period_start.isoformat() if progress.period_start else None,
                "period_end": progress.period_end.isoformat() if progress.period_end else None,
            }
        )
    return {"budgets": results}


def get_recurring_expenses_tool(
    db: Session,
    user_id: int,
    active_only: bool = True,
    upcoming_days: Optional[int] = None,
) -> dict:
    """List recurring expenses, optionally limited to those due within N days."""
    query = db.query(RecurringExpense).filter(RecurringExpense.user_id == user_id)
    if active_only:
        query = query.filter(RecurringExpense.is_active == True)  # noqa: E712
    if upcoming_days is not None:
        cutoff = date.today() + timedelta(days=max(0, int(upcoming_days)))
        query = query.filter(RecurringExpense.next_due_date <= cutoff)
    expenses = query.order_by(RecurringExpense.next_due_date.asc()).all()

    return {
        "recurring_expenses": [
            {
                "id": e.id,
                "name": e.name,
                "amount": float(e.amount),
                "next_due_date": e.next_due_date.isoformat() if e.next_due_date else None,
                "recurrence_interval": e.recurrence_interval,
                "recurrence_unit": e.recurrence_unit,
                "category": e.category.name if e.category else None,
                "account": e.account.name if e.account else None,
            }
            for e in expenses
        ]
    }


def get_debts_tool(db: Session, user_id: int, active_only: bool = True) -> dict:
    """List debts with balances, interest rates, and next payment info."""
    query = db.query(Debt).filter(Debt.user_id == user_id)
    if active_only:
        query = query.filter(Debt.is_active == True)  # noqa: E712
    debts = query.all()

    return {
        "debts": [
            {
                "id": d.id,
                "name": d.name,
                "creditor": d.creditor,
                "type": d.custom_type if d.type == "custom" else d.type,
                "current_balance": float(d.current_balance),
                "original_balance": float(d.original_balance),
                "interest_rate": d.interest_rate,
                "minimum_payment": d.minimum_payment,
                "next_payment_date": d.next_payment_date.isoformat() if d.next_payment_date else None,
                "is_paid_off": d.is_paid_off,
            }
            for d in debts
        ],
        "total_debt": float(sum(d.current_balance for d in debts)),
    }


def send_analysis_email_tool(
    db: Session,
    user_id: int,
    subject: str,
    analysis_text: str,
    *,
    user_email: str,
) -> dict:
    """Email the current user a copy of the AI's analysis. Recipient is always
    the logged-in user's own account email — never model-supplied."""
    settings_row = _get_or_create_settings(db, user_id)
    if not settings_row.email_enabled:
        return {"sent": False, "to": user_email, "error": "Email notifications are disabled in settings."}

    from app.config import settings as app_settings

    cfg = mail_service.resolve_smtp_config(settings_row, app_settings)
    if cfg is None:
        return {"sent": False, "to": user_email, "error": "No SMTP configuration available."}

    paragraphs = [p.strip() for p in analysis_text.split("\n\n") if p.strip()]
    body_html = "".join(email_templates._p(p) for p in paragraphs) or email_templates._p(analysis_text)
    title = subject or "Your Financial Analysis"
    html, text = email_templates.render(title=title, body_html=body_html, preheader="AI-generated financial analysis")

    ok, err = mail_service.send_email_detailed(user_email, title, html, cfg, text=text)
    return {"sent": ok, "to": user_email, "error": err}
