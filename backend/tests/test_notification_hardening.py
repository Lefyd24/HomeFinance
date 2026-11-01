import socket
from datetime import date

import pytest
import requests

from app.models import User
from app.models.notification import NotificationRule
from tests.factories import make_budget


def _resolve_to(monkeypatch, ip):
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(socket.AF_INET, 0, 0, "", (ip, 0))]
    )


class _Row:
    smtp_host = "evil.example"
    smtp_port = 25
    smtp_user = None
    smtp_password_encrypted = None
    smtp_from = None
    smtp_use_tls = False
    user_id = 1


class _App:
    SMTP_HOST = "env.smtp"
    SMTP_PORT = 587
    SMTP_USER = "global-user"
    SMTP_PASSWORD = "global-pw"
    SMTP_FROM = None
    SMTP_USE_TLS = True


def test_own_host_never_gets_global_credentials():
    from app.services.mail_service import resolve_smtp_config

    cfg = resolve_smtp_config(_Row(), _App())
    assert cfg.host == "evil.example"
    assert cfg.user is None and cfg.password is None


def test_no_row_host_uses_global_set():
    from app.services.mail_service import resolve_smtp_config

    row = _Row()
    row.smtp_host = None
    cfg = resolve_smtp_config(row, _App())
    assert (cfg.host, cfg.user, cfg.password) == ("env.smtp", "global-user", "global-pw")


def test_no_row_host_ignores_row_user():
    from app.services.mail_service import resolve_smtp_config

    row = _Row()
    row.smtp_host = None
    row.smtp_user = "someone-else"
    cfg = resolve_smtp_config(row, _App())
    assert (cfg.host, cfg.user, cfg.password) == ("env.smtp", "global-user", "global-pw")


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.1.2.3", "169.254.169.254"])
def test_put_settings_rejects_private_smtp_host(client, monkeypatch, ip):
    _resolve_to(monkeypatch, ip)
    resp = client.put("/api/notifications/settings", json={"smtp_host": "smtp.example.com"})
    assert resp.status_code == 422


def test_budget_rule_on_foreign_budget_404(client, db):
    other = User(email="o@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    budget = make_budget(db, other)
    resp = client.post(
        "/api/notifications/rules",
        json={"type": "budget_percent", "name": "x", "target_id": budget.id, "threshold": 0.0,
              "channels": "email"},
    )
    assert resp.status_code == 404


def test_budget_breaches_ignores_foreign_budget(db, seed_user):
    from app.services import notification_service as ns

    other = User(email="o@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    budget = make_budget(db, other)
    db.add(NotificationRule(user_id=seed_user.id, type="budget_percent", name="x",
                            target_id=budget.id, threshold=0.0, channels="email", is_active=True))
    db.commit()
    assert ns.budget_breaches(db, seed_user, date.today()) == []


@pytest.mark.parametrize("endpoint,ip", [
    ("http://push.example.com/x", "93.184.216.34"),
    ("https://push.example.com/x", "127.0.0.1"),
])
def test_push_subscribe_rejects_bad_endpoint(client, monkeypatch, endpoint, ip):
    _resolve_to(monkeypatch, ip)
    resp = client.post("/api/notifications/push/subscribe",
                       json={"endpoint": endpoint, "p256dh": "a", "auth": "b"})
    assert resp.status_code == 422


def test_send_push_swallows_connection_error(monkeypatch):
    import app.services.push_service as p

    seen = {}

    def boom(**k):
        seen.update(k)
        raise requests.ConnectionError("down")

    monkeypatch.setattr(p, "webpush", boom)

    class Sub: endpoint = "https://x"; p256dh = "a"; auth = "b"
    class App: VAPID_PRIVATE_KEY = "k"; VAPID_PUBLIC_KEY = "pub"; VAPID_SUBJECT = "mailto:a@b"

    assert p.send_push(Sub(), {"title": "Hi"}, App()) is False
    assert seen["timeout"] == 10


def test_run_tick_continues_after_user_failure(db, seed_user, monkeypatch):
    from app.services import scheduler

    db.add(User(email="o@example.com", hashed_password="x", is_active=True))
    db.commit()
    seen = []

    def fake_eval(_db, user, _app):
        seen.append(user.id)
        if len(seen) == 1:
            raise RuntimeError("boom")

    monkeypatch.setattr(scheduler, "evaluate_for_user", fake_eval)

    class App: NOTIFICATIONS_ENABLED = True

    rolled = []
    monkeypatch.setattr(db, "rollback", lambda: rolled.append(1))
    scheduler.run_tick(lambda: db, app_settings=App())
    assert rolled
    assert len(seen) == 2
