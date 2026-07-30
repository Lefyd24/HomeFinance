import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import func

from app.models import Account, Budget, PortfolioPosition, Transaction
from app.models.recurring_expense import RecurringExpense
from app.models.debt import Debt
from app.models.notification import NotificationRule, NotificationLog, PushSubscription
from app.routers.budgets import get_period_dates
from app.services import mail_service, push_service, email_templates
from app.services.push_service import PushGone

logger = logging.getLogger("app.notifications")


def _parse_channels(channels: str | None) -> list[str]:
    return [c.strip() for c in (channels or "email").split(",") if c.strip()]


@dataclass
class Notification:
    dedupe_key: str
    type: str
    title: str
    body: str
    channels: list = field(default_factory=lambda: ["email"])
    # Structured data for building a typed HTML email (see email_templates.py).
    # `body` stays short plain text — it's what push notifications and the
    # NotificationLog show, so it must never carry HTML.
    meta: dict = field(default_factory=dict)


def _window(next_due, today, days):
    return next_due is not None and today <= next_due <= today + timedelta(days=days)


def due_recurring(db, user, today, default_days):
    out = []
    items = db.query(RecurringExpense).filter(
        RecurringExpense.user_id == user.id,
        RecurringExpense.is_active == True,
        RecurringExpense.notify_enabled == True,
    ).all()
    for r in items:
        days = r.notify_days_before or default_days
        if _window(r.next_due_date, today, days):
            delta = (r.next_due_date - today).days
            out.append(Notification(
                dedupe_key=f"recurring:{r.id}:{r.next_due_date.isoformat()}",
                type="recurring_due",
                title=f"{r.name} due soon",
                body=f"€{r.amount:.2f} due on {r.next_due_date.isoformat()}.",
                meta={"name": r.name, "amount": float(r.amount or 0),
                      "due_date": r.next_due_date.isoformat(), "days_until_due": delta}))
    return out


def due_debts(db, user, today, default_days):
    out = []
    items = db.query(Debt).filter(
        Debt.user_id == user.id, Debt.is_active == True, Debt.notify_enabled == True,
    ).all()
    for d in items:
        days = d.notify_days_before or default_days
        if _window(d.next_payment_date, today, days):
            amt = d.minimum_payment or 0
            delta = (d.next_payment_date - today).days
            out.append(Notification(
                dedupe_key=f"debt:{d.id}:{d.next_payment_date.isoformat()}",
                type="debt_due",
                title=f"{d.name} payment due soon",
                body=f"€{amt:.2f} due on {d.next_payment_date.isoformat()}.",
                meta={"name": d.name, "amount": float(amt or 0),
                      "due_date": d.next_payment_date.isoformat(), "days_until_due": delta}))
    return out


def balance_breaches(db, user):
    out = []
    rules = db.query(NotificationRule).filter(
        NotificationRule.user_id == user.id, NotificationRule.is_active == True,
        NotificationRule.type == "balance_below",
    ).all()
    for rule in rules:
        if rule.target_id is None:
            logger.warning("Balance rule %s has no target account", rule.id)
            continue
        acc = db.query(Account).filter(
            Account.id == rule.target_id,
            Account.user_id == user.id,
        ).first()
        if not acc:
            logger.warning(
                "Balance rule %s: account id=%s not found for user %s",
                rule.id, rule.target_id, user.id,
            )
            continue
        threshold = float(rule.threshold or 0)
        balance = float(acc.balance or 0)
        if balance < threshold:
            logger.info(
                "Balance rule %s triggered: %s balance=%.2f threshold=%.2f",
                rule.id, acc.name, balance, threshold,
            )
            out.append(Notification(
                dedupe_key=f"balance:{rule.id}:{date.today().isoformat()}",
                type="balance_below",
                title=f"Low balance: {acc.name}",
                body=f"{acc.name} is €{balance:.2f} (below €{threshold:.2f}).",
                channels=_parse_channels(rule.channels),
                meta={"account_name": acc.name, "balance": balance, "threshold": threshold}))
        else:
            logger.info(
                "Balance rule %s not triggered: %s balance=%.2f threshold=%.2f",
                rule.id, acc.name, balance, threshold,
            )
    return out


def _portfolio_return_pct(db, account_id: int) -> float | None:
    positions = db.query(PortfolioPosition).filter(PortfolioPosition.account_id == account_id).all()
    cost_basis = sum((p.avg_price or 0) * p.quantity for p in positions if p.avg_price is not None)
    market_value = sum(p.market_value for p in positions)
    if not cost_basis:
        return None
    return (market_value - cost_basis) / cost_basis * 100


def investment_return_breaches(db, user):
    out = []
    rules = db.query(NotificationRule).filter(
        NotificationRule.user_id == user.id, NotificationRule.is_active == True,
        NotificationRule.type == "investment_return_below",
    ).all()
    for rule in rules:
        if rule.target_id is None:
            continue
        acc = db.query(Account).filter(
            Account.id == rule.target_id, Account.user_id == user.id,
            Account.provider.isnot(None),
        ).first()
        if not acc:
            continue
        return_pct = _portfolio_return_pct(db, acc.id)
        if return_pct is None:
            continue
        threshold = float(rule.threshold or 0)
        if return_pct < threshold:
            out.append(Notification(
                dedupe_key=f"investment_return:{rule.id}:{date.today().isoformat()}",
                type="investment_return_below",
                title=f"Portfolio return alert: {acc.name}",
                body=f"{acc.name} return is {return_pct:.1f}% (below {threshold:.1f}%).",
                channels=_parse_channels(rule.channels),
                meta={"account_name": acc.name, "return_pct": return_pct, "threshold": threshold}))
    return out


def investment_scheduled_due(db, user, rule, now):
    if rule.type != "investment_scheduled":
        return None
    last = rule.last_fired_at
    due = last is None
    if not due and rule.schedule_kind == "every_n_days":
        due = now - last >= timedelta(days=rule.schedule_value or 7)
    elif not due and rule.schedule_kind == "weekly":
        due = now - last >= timedelta(days=7)
    elif not due and rule.schedule_kind == "monthly":
        due = now - last >= timedelta(days=30)
    if not due or rule.target_id is None:
        return None
    acc = db.query(Account).filter(
        Account.id == rule.target_id, Account.user_id == user.id,
        Account.provider.isnot(None),
    ).first()
    if not acc:
        return None
    return_pct = _portfolio_return_pct(db, acc.id)
    body = f"{acc.name} is worth {acc.currency} {acc.balance:.2f}"
    body += f", overall return {return_pct:.1f}%." if return_pct is not None else "."
    return Notification(
        dedupe_key=f"rule:{rule.id}:{now.date().isoformat()}",
        type="investment_scheduled",
        title=f"{acc.name} portfolio summary",
        body=body,
        channels=_parse_channels(rule.channels),
        meta={"account_name": acc.name, "balance": float(acc.balance or 0), "return_pct": return_pct})


def budget_breaches(db, user, today):
    out = []
    rules = db.query(NotificationRule).filter(
        NotificationRule.user_id == user.id, NotificationRule.is_active == True,
        NotificationRule.type == "budget_percent",
    ).all()
    for rule in rules:
        budget = db.query(Budget).filter(Budget.id == rule.target_id).first()
        if not budget:
            continue
        limit = float(getattr(budget, "amount", 0) or 0)
        spent = _budget_spend(db, user, budget, today)
        pct = (spent / limit * 100) if limit else 0
        if pct >= (rule.threshold or 100):
            out.append(Notification(
                dedupe_key=f"budget:{rule.id}:{today.strftime('%Y-%m')}",
                type="budget_percent",
                title=f"Budget alert: {budget.name}",
                body=f"You've used {pct:.0f}% of {budget.name} (€{spent:.0f}/€{limit:.0f}).",
                channels=_parse_channels(rule.channels),
                meta={"budget_name": budget.name, "pct": pct, "spent": spent, "limit": limit}))
    return out


def _budget_spend(db, user, budget, today):
    category_ids = [bc.category_id for bc in budget.budget_categories]
    period_start, period_end = get_period_dates(budget, today)
    query = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id == user.id, Transaction.type == "expense")
    if category_ids:
        query = query.filter(Transaction.category_id.in_(category_ids))
    if period_start:
        query = query.filter(Transaction.date >= period_start)
    if period_end:
        query = query.filter(Transaction.date <= period_end)
    return float(query.scalar() or 0)


def report_due(db, user, rule, now):
    if rule.type != "scheduled_report":
        return None
    last = rule.last_fired_at
    due = False
    if last is None:
        due = True
    elif rule.schedule_kind == "every_n_days":
        due = now - last >= timedelta(days=rule.schedule_value or 7)
    elif rule.schedule_kind == "weekly":
        due = now - last >= timedelta(days=7)
    elif rule.schedule_kind == "monthly":
        due = now - last >= timedelta(days=30)
    if not due:
        return None
    return Notification(
        dedupe_key=f"rule:{rule.id}:{now.date().isoformat()}",
        type="scheduled_report",
        title=f"Your {rule.report_type or 'finance'} report",
        body=f"Your scheduled {rule.report_type} summary is ready.",
        channels=_parse_channels(rule.channels),
        meta={"rule_name": rule.name, "report_type": rule.report_type})


def _in_quiet_hours(settings_row, now):
    s = getattr(settings_row, "quiet_hours_start", None)
    e = getattr(settings_row, "quiet_hours_end", None)
    if s is None or e is None:
        return False
    h = now.hour
    return (s <= h < e) if s < e else (h >= s or h < e)


def _render_email(notif) -> tuple[str, str]:
    """Build the (html, text) parts for a Notification via email_templates."""
    m = notif.meta or {}
    if notif.type == "recurring_due":
        return email_templates.recurring_due(
            m.get("name", notif.title), m.get("amount", 0),
            m.get("due_date", ""), m.get("days_until_due", 0))
    if notif.type == "debt_due":
        return email_templates.debt_due(
            m.get("name", notif.title), m.get("amount", 0),
            m.get("due_date", ""), m.get("days_until_due", 0))
    if notif.type == "balance_below":
        return email_templates.balance_below(
            m.get("account_name", notif.title), m.get("balance", 0), m.get("threshold", 0))
    if notif.type == "budget_percent":
        return email_templates.budget_percent(
            m.get("budget_name", notif.title), m.get("pct", 0), m.get("spent", 0), m.get("limit", 0))
    if notif.type == "scheduled_report":
        return email_templates.scheduled_report(m.get("rule_name", notif.title), m.get("report_type", ""))
    if notif.type == "test":
        return email_templates.test_notification(notif.title, notif.body)
    return email_templates.render(notif.title, f"<p style='margin:0;font-size:14px;'>{notif.body}</p>")


def _send_email(user, notif, settings_row, app_settings):
    ok, _detail = _send_email_detailed(user, notif, settings_row, app_settings)
    return ok


def _send_email_detailed(user, notif, settings_row, app_settings):
    """Like _send_email but also returns an error string on failure."""
    cfg = mail_service.resolve_smtp_config(settings_row, app_settings)
    if not cfg:
        return False, "No SMTP host configured"
    if cfg.password_needs_reentry:
        return False, "SMTP password needs re-entering in Notification Settings"
    html_body, text_body = _render_email(notif)
    return mail_service.send_email_detailed(user.email, notif.title, html_body, cfg, text=text_body)


# React Router paths (frontend/app/src/App.tsx) — note "/recurring", which is
# not a straight rename of the old recurring-expenses.html page.
_NOTIF_URLS = {
    "recurring_due": "/recurring",
    "debt_due": "/debts",
    "balance_below": "/accounts",
    "budget_percent": "/budgets",
    "scheduled_report": "/reports",
    "investment_return_below": "/investments",
    "investment_scheduled": "/investments",
}


def _send_push(db, user, notif, app_settings):
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    ok = False
    payload = {
        "title": notif.title,
        "body": notif.body,
        "tag": notif.dedupe_key,
        "url": _NOTIF_URLS.get(notif.type, "/dashboard"),
    }
    for sub in subs:
        try:
            if push_service.send_push(sub, payload, app_settings):
                ok = True
        except PushGone:
            db.delete(sub)
    db.commit()
    return ok


def dispatch(db, user, notifications, settings_row, app_settings):
    now = datetime.utcnow()
    stats = {"sent": 0, "skipped_dedupe": 0, "skipped_quiet": 0, "failed": 0}
    for n in notifications:
        exists = db.query(NotificationLog).filter(
            NotificationLog.user_id == user.id,
            NotificationLog.dedupe_key == n.dedupe_key).first()
        if exists and (exists.channels_sent or "").strip():
            stats["skipped_dedupe"] += 1
            continue
        if _in_quiet_hours(settings_row, now):
            stats["skipped_quiet"] += 1
            continue
        sent = []
        if "email" in n.channels and getattr(settings_row, "email_enabled", True):
            if _send_email(user, n, settings_row, app_settings):
                sent.append("email")
        if "push" in n.channels and getattr(settings_row, "push_enabled", False):
            if _send_push(db, user, n, app_settings):
                sent.append("push")
        if not sent:
            stats["failed"] += 1
            logger.warning(
                "Notification not delivered (will retry): user=%s type=%s key=%s channels=%s",
                user.id, n.type, n.dedupe_key, n.channels,
            )
            continue
        channels_sent = ",".join(sent)
        if exists:
            exists.type = n.type
            exists.title = n.title
            exists.body = n.body
            exists.channels_sent = channels_sent
        else:
            db.add(NotificationLog(
                user_id=user.id, dedupe_key=n.dedupe_key, type=n.type,
                title=n.title, body=n.body, channels_sent=channels_sent,
            ))
        db.commit()
        stats["sent"] += 1
    return stats
