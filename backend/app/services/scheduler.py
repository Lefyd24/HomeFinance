import logging
from datetime import datetime, date

from apscheduler.schedulers.background import BackgroundScheduler

from app.models import User
from app.models.notification import NotificationSettings, NotificationRule
from app.services import notification_service as ns
from app.services.investment_sync_service import sync_all_investment_accounts

logger = logging.getLogger("app.notifications")
_scheduler = None


def _get_or_create_settings(db, user_id: int) -> NotificationSettings:
    row = db.query(NotificationSettings).filter(
        NotificationSettings.user_id == user_id
    ).first()
    if row is None:
        row = NotificationSettings(user_id=user_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def evaluate_for_user(db, user, app_settings):
    """Evaluate all notification rules for one user and dispatch."""
    settings_row = _get_or_create_settings(db, user.id)
    today = date.today()
    now = datetime.utcnow()
    default_days = settings_row.default_days_before or 3
    notifs = []
    notifs += ns.due_recurring(db, user, today, default_days)
    notifs += ns.due_debts(db, user, today, default_days)
    notifs += ns.balance_breaches(db, user)
    notifs += ns.budget_breaches(db, user, today)
    notifs += ns.investment_return_breaches(db, user)
    for rule in db.query(NotificationRule).filter(
        NotificationRule.user_id == user.id,
        NotificationRule.type.in_(["scheduled_report", "investment_scheduled"]),
        NotificationRule.is_active == True,
    ).all():
        rn = (
            ns.report_due(db, user, rule, now)
            if rule.type == "scheduled_report"
            else ns.investment_scheduled_due(db, user, rule, now)
        )
        if rn:
            notifs.append(rn)
            rule.last_fired_at = now
    stats = ns.dispatch(db, user, notifs, settings_row, app_settings)
    db.commit()
    return {
        "evaluated": len(notifs),
        "sent": stats["sent"],
        "skipped_dedupe": stats["skipped_dedupe"],
        "skipped_quiet": stats["skipped_quiet"],
        "failed": stats["failed"],
        "pending": [
            {"type": n.type, "title": n.title}
            for n in notifs
        ],
    }


def run_tick(session_factory, app_settings):
    db = session_factory()
    try:
        users = db.query(User).filter(User.is_active == True).all()
        for user in users:
            evaluate_for_user(db, user, app_settings)
    except Exception:
        logger.exception("Notification tick failed")
    finally:
        db.close()


def start_scheduler(app_settings, session_factory):
    global _scheduler
    jobs_needed = app_settings.NOTIFICATIONS_ENABLED or app_settings.INVESTMENT_SYNC_ENABLED
    if not jobs_needed:
        logger.info("Notifications and investment sync both disabled; scheduler not started")
        return

    _scheduler = BackgroundScheduler(daemon=True)

    if app_settings.NOTIFICATIONS_ENABLED:
        _scheduler.add_job(
            lambda: run_tick(session_factory, app_settings),
            "interval",
            hours=1,
            id="notif_tick",
            next_run_time=datetime.now(),
        )
    else:
        logger.info("Notifications disabled; notif_tick not scheduled")

    if app_settings.INVESTMENT_SYNC_ENABLED:
        _scheduler.add_job(
            lambda: sync_all_investment_accounts(session_factory),
            "interval",
            hours=app_settings.INVESTMENT_SYNC_INTERVAL_HOURS,
            id="investment_sync_tick",
            next_run_time=datetime.now(),
        )
    else:
        logger.info("Investment sync disabled; investment_sync_tick not scheduled")

    _scheduler.start()
    logger.info("Background scheduler started")


def shutdown_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
