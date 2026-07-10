from datetime import date, timedelta

from tests.factories import make_account, make_recurring
from app.models.notification import NotificationSettings, NotificationLog


class _FakeApp:
    NOTIFICATIONS_ENABLED = True
    SMTP_HOST = None
    VAPID_PRIVATE_KEY = None


def test_run_tick_creates_log(db, seed_user, monkeypatch):
    from app.services import scheduler
    import app.services.notification_service as ns

    acc = make_account(db, seed_user)
    make_recurring(
        db,
        seed_user,
        account=acc,
        name="Spotify",
        amount=10,
        next_due_date=date.today() + timedelta(days=1),
        notify=True,
        days_before=3,
    )
    db.add(NotificationSettings(user_id=seed_user.id, email_enabled=True))
    db.commit()
    monkeypatch.setattr(ns, "_send_email", lambda *a, **k: True)
    scheduler.run_tick(lambda: db, app_settings=_FakeApp())
    assert db.query(NotificationLog).count() >= 1
