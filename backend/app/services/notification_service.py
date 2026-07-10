import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import func

from app.models import Account, Budget, Transaction
from app.models.recurring_expense import RecurringExpense
from app.models.debt import Debt
from app.models.notification import NotificationRule, NotificationLog, PushSubscription
from app.routers.budgets import get_period_dates
from app.services import mail_service, push_service
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
            out.append(Notification(
                dedupe_key=f"recurring:{r.id}:{r.next_due_date.isoformat()}",
                type="recurring_due",
                title=f"{r.name} due soon",
                body=f"€{r.amount:.2f} due on {r.next_due_date.isoformat()}."))
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
            out.append(Notification(
                dedupe_key=f"debt:{d.id}:{d.next_payment_date.isoformat()}",
                type="debt_due",
                title=f"{d.name} payment due soon",
                body=f"€{amt:.2f} due on {d.next_payment_date.isoformat()}."))
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
                channels=_parse_channels(rule.channels)))
        else:
            logger.info(
                "Balance rule %s not triggered: %s balance=%.2f threshold=%.2f",
                rule.id, acc.name, balance, threshold,
            )
    return out


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
                channels=_parse_channels(rule.channels)))
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
        body=_build_report_html(db, user, rule),
        channels=_parse_channels(rule.channels))


def _build_report_html(db, user, rule):
    return f"<h2>{rule.name}</h2><p>Your scheduled {rule.report_type} summary.</p>"


def _in_quiet_hours(settings_row, now):
    s = getattr(settings_row, "quiet_hours_start", None)
    e = getattr(settings_row, "quiet_hours_end", None)
    if s is None or e is None:
        return False
    h = now.hour
    return (s <= h < e) if s < e else (h >= s or h < e)


def _send_email(user, notif, settings_row, app_settings):
    cfg = mail_service.resolve_smtp_config(settings_row, app_settings)
    if not cfg:
        return False
    html = f"<div style='font-family:sans-serif'><h2>{notif.title}</h2><p>{notif.body}</p></div>"
    return mail_service.send_email(user.email, notif.title, html, cfg)


def _send_push(db, user, notif, app_settings):
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    ok = False
    for sub in subs:
        try:
            if push_service.send_push(sub, {"title": notif.title, "body": notif.body}, app_settings):
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
