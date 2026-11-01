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
