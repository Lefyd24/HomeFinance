from app.models.notification import NotificationSettings, NotificationRule


def test_get_settings_creates_defaults(client, db, seed_user):
    resp = client.get("/api/notifications/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == seed_user.id
    assert data["email_enabled"] is True
    assert data["smtp_password_set"] is False
    assert "smtp_password" not in data
    assert db.query(NotificationSettings).filter_by(user_id=seed_user.id).count() == 1


def test_put_settings_encrypts_password(client, db, seed_user, monkeypatch):
    monkeypatch.setenv("NOTIFICATION_ENCRYPTION_KEY", "test-key-please-change-1234567890")
    from importlib import reload
    from app.utils import crypto as crypto_mod
    reload(crypto_mod)

    resp = client.put(
        "/api/notifications/settings",
        json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_user": "user@example.com",
            "smtp_password": "secret-pass",
            "email_enabled": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["smtp_host"] == "smtp.example.com"
    assert data["smtp_password_set"] is True
    assert "smtp_password" not in data

    row = db.query(NotificationSettings).filter_by(user_id=seed_user.id).first()
    assert row.smtp_password_encrypted is not None
    assert row.smtp_password_encrypted != "secret-pass"
    assert crypto_mod.decrypt(row.smtp_password_encrypted) == "secret-pass"


def test_rule_crud(client, db, seed_user):
    create = client.post(
        "/api/notifications/rules",
        json={
            "type": "balance_below",
            "name": "Low checking",
            "target_id": 1,
            "threshold": 100.0,
            "channels": "email,push",
        },
    )
    assert create.status_code == 201
    rule_id = create.json()["id"]
    assert create.json()["name"] == "Low checking"
    assert create.json()["user_id"] == seed_user.id

    listing = client.get("/api/notifications/rules")
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["id"] == rule_id

    updated = client.put(
        f"/api/notifications/rules/{rule_id}",
        json={"name": "Low balance alert", "threshold": 50.0},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Low balance alert"
    assert updated.json()["threshold"] == 50.0

    deleted = client.delete(f"/api/notifications/rules/{rule_id}")
    assert deleted.status_code == 204
    assert client.get("/api/notifications/rules").json() == []


def test_vapid_public_key(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.notifications.settings.VAPID_PUBLIC_KEY",
        "test-vapid-public-key",
    )
    resp = client.get("/api/notifications/push/vapid-public-key")
    assert resp.status_code == 200
    assert resp.json() == {"key": "test-vapid-public-key"}


def test_send_test_notification(client, db, seed_user, monkeypatch):
    from app.models.notification import PushSubscription

    db.add(
        NotificationSettings(
            user_id=seed_user.id,
            email_enabled=True,
            push_enabled=True,
        )
    )
    db.add(
        PushSubscription(
            user_id=seed_user.id,
            endpoint="https://push.example.com/sub",
            p256dh="key",
            auth="auth",
        )
    )
    db.commit()

    sent = {"email": False, "push": False}

    def fake_email_detailed(user, notif, settings_row, app_settings):
        sent["email"] = True
        return True, None

    def fake_push(db_sess, user, notif, app_settings):
        sent["push"] = True
        return True

    import app.services.notification_service as ns

    monkeypatch.setattr(ns, "_send_email_detailed", fake_email_detailed)
    monkeypatch.setattr(ns, "_send_push", fake_push)

    resp = client.post("/api/notifications/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] is True
    assert body["push"] is True
    assert sent["email"] is True
    assert sent["push"] is True
