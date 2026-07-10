import logging
from datetime import datetime, date

from apscheduler.schedulers.background import BackgroundScheduler

from app.models import User
from app.models.notification import NotificationSettings, NotificationRule
from app.services import notification_service as ns

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
    for rule in db.query(NotificationRule).filter(
        NotificationRule.user_id == user.id,
        NotificationRule.type == "scheduled_report",
        NotificationRule.is_active == True,
    ).all():
        rn = ns.report_due(db, user, rule, now)
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
    if not app_settings.NOTIFICATIONS_ENABLED:
        logger.info("Notifications disabled; scheduler not started")
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        lambda: run_tick(session_factory, app_settings),
        "interval",
        hours=1,
        id="notif_tick",
        next_run_time=datetime.now(),
    )
    _scheduler.start()
    logger.info("Notification scheduler started")


def shutdown_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
