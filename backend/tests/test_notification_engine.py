from datetime import date, timedelta

from tests.factories import make_account, make_recurring


def test_due_recurring_within_window(db, seed_user):
    from app.services import notification_service as ns
    acc = make_account(db, seed_user)
    make_recurring(db, seed_user, acc, name="Netflix", amount=10,
                   next_due=date.today() + timedelta(days=2), notify=True, days_before=3)
    out = ns.due_recurring(db, seed_user, date.today(), default_days=3)
    assert any(n.type == "recurring_due" and "Netflix" in n.title for n in out)


def test_due_recurring_outside_window(db, seed_user):
    from app.services import notification_service as ns
    acc = make_account(db, seed_user)
    make_recurring(db, seed_user, acc, name="Rent", amount=800,
                   next_due=date.today() + timedelta(days=20), notify=True, days_before=3)
    out = ns.due_recurring(db, seed_user, date.today(), default_days=3)
    assert out == []


def test_dispatch_dedupes(db, seed_user, monkeypatch):
    from app.services import notification_service as ns
    from app.models.notification import NotificationLog
    n = ns.Notification(dedupe_key="k1", type="t", title="T", body="b", channels=["email"])
    class S: email_enabled=True; push_enabled=False; quiet_hours_start=None; quiet_hours_end=None
    monkeypatch.setattr(ns, "_send_email", lambda *a, **k: True)
    ns.dispatch(db, seed_user, [n], S(), app_settings=None)
    ns.dispatch(db, seed_user, [n], S(), app_settings=None)
    assert db.query(NotificationLog).filter_by(dedupe_key="k1").count() == 1


def test_dispatch_retries_after_failed_send(db, seed_user, monkeypatch):
    from app.services import notification_service as ns
    from app.models.notification import NotificationLog
    n = ns.Notification(dedupe_key="k2", type="t", title="T", body="b", channels=["email"])
    class S: email_enabled=True; push_enabled=False; quiet_hours_start=None; quiet_hours_end=None
    outcomes = iter([False, True])
    monkeypatch.setattr(ns, "_send_email", lambda *a, **k: next(outcomes))
    stats1 = ns.dispatch(db, seed_user, [n], S(), app_settings=None)
    assert stats1["failed"] == 1
    assert db.query(NotificationLog).filter_by(dedupe_key="k2").count() == 0
    stats2 = ns.dispatch(db, seed_user, [n], S(), app_settings=None)
    assert stats2["sent"] == 1
    assert db.query(NotificationLog).filter_by(dedupe_key="k2").count() == 1


def test_dispatch_retries_stale_empty_log(db, seed_user, monkeypatch):
    from app.services import notification_service as ns
    from app.models.notification import NotificationLog
    db.add(NotificationLog(
        user_id=seed_user.id, dedupe_key="k3", type="t", title="Old", body="b", channels_sent="",
    ))
    db.commit()
    n = ns.Notification(dedupe_key="k3", type="t", title="T", body="b", channels=["email"])
    class S: email_enabled=True; push_enabled=False; quiet_hours_start=None; quiet_hours_end=None
    monkeypatch.setattr(ns, "_send_email", lambda *a, **k: True)
    stats = ns.dispatch(db, seed_user, [n], S(), app_settings=None)
    row = db.query(NotificationLog).filter_by(dedupe_key="k3").first()
    assert stats["sent"] == 1
    assert row.channels_sent == "email"
    assert row.title == "T"


def test_balance_rule_via_evaluate(db, seed_user, monkeypatch):
    from tests.factories import make_account
    from app.models.notification import NotificationRule, NotificationSettings
    from app.services.scheduler import evaluate_for_user
    import app.services.notification_service as ns

    acc = make_account(db, seed_user, name="Checking", balance=80.0)
    db.add(NotificationSettings(user_id=seed_user.id, email_enabled=True, smtp_host="smtp.test"))
    db.add(NotificationRule(
        user_id=seed_user.id, type="balance_below", name="Low checking",
        target_id=acc.id, threshold=150.0, channels="email", is_active=True,
    ))
    db.commit()

    sent = []
    monkeypatch.setattr(ns, "_send_email", lambda *a, **k: sent.append(1) or True)

    class App:
        SMTP_HOST = "smtp.test"
        BANK_SYNC_ENABLED = False
        EB_CONSENT_WARN_DAYS = 7

    result = evaluate_for_user(db, seed_user, App())
    assert result["evaluated"] == 1
    assert result["sent"] == 1
    assert sent
