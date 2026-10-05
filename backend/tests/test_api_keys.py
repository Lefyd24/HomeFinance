"""API keys (multiple, hashed, read/full scope), last login, and admin invite deletion.

Unlike most API tests these do NOT use the shared `client` fixture, which
overrides the auth dependencies - the point here is the real auth path.
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import main
from app.database import get_db
from app.models import ApiKey, User
from app.models.invite_code import InviteCode
from app.services import auth_tokens
from app.utils.security import create_access_token, get_password_hash


@pytest.fixture()
def raw_client(db):
    def _get_db_override():
        yield db

    main.app.dependency_overrides[get_db] = _get_db_override
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


def _user(db, email="u@example.com", admin=False, active=True):
    u = User(
        email=email,
        hashed_password=get_password_hash("secret-pass-1"),
        full_name="U",
        is_active=active,
        is_admin=admin,
        email_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _jwt(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _create_key(client, user, name="k", scope="read"):
    r = client.post(
        "/api/auth/api-keys", json={"name": name, "scope": scope}, headers=_jwt(user)
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------- key CRUD


def test_create_list_revoke(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user, name="Grafana")
    assert created["key"].startswith("pf_")
    assert created["api_key"]["name"] == "Grafana"
    assert created["api_key"]["last_four"] == created["key"][-4:]

    listed = raw_client.get("/api/auth/api-keys", headers=_jwt(user)).json()
    assert [k["name"] for k in listed] == ["Grafana"]
    assert "key" not in listed[0] and "key_hash" not in listed[0]

    r = raw_client.delete(
        f"/api/auth/api-keys/{created['api_key']['id']}", headers=_jwt(user)
    )
    assert r.status_code == 204
    assert raw_client.get("/api/auth/api-keys", headers=_jwt(user)).json() == []


def test_only_hash_is_stored(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user)
    row = db.query(ApiKey).one()
    assert row.key_hash == auth_tokens.hash_token(created["key"])
    assert created["key"] not in (row.key_hash, row.key_prefix, row.last_four)


def test_multiple_keys_and_cap(raw_client, db):
    user = _user(db)
    for i in range(10):
        _create_key(raw_client, user, name=f"k{i}")
    r = raw_client.post(
        "/api/auth/api-keys", json={"name": "one-too-many"}, headers=_jwt(user)
    )
    assert r.status_code == 400
    # Revoking frees a slot.
    first = raw_client.get("/api/auth/api-keys", headers=_jwt(user)).json()[0]
    raw_client.delete(f"/api/auth/api-keys/{first['id']}", headers=_jwt(user))
    assert (
        raw_client.post(
            "/api/auth/api-keys", json={"name": "ok"}, headers=_jwt(user)
        ).status_code
        == 201
    )


def test_cannot_revoke_another_users_key(raw_client, db):
    owner = _user(db, "a@example.com")
    other = _user(db, "b@example.com")
    created = _create_key(raw_client, owner)
    r = raw_client.delete(
        f"/api/auth/api-keys/{created['api_key']['id']}", headers=_jwt(other)
    )
    assert r.status_code == 404


def test_invalid_scope_rejected(raw_client, db):
    user = _user(db)
    r = raw_client.post(
        "/api/auth/api-keys", json={"name": "x", "scope": "admin"}, headers=_jwt(user)
    )
    assert r.status_code == 422


# ---------------------------------------------------------------- auth path


def test_key_authenticates_and_tracks_last_used(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user)
    assert created["api_key"]["last_used_at"] is None

    r = raw_client.get("/api/accounts", headers={"X-API-Key": created["key"]})
    assert r.status_code == 200
    db.expire_all()
    first = db.query(ApiKey).one().last_used_at
    assert first is not None

    # Second call within a minute does not rewrite the timestamp.
    raw_client.get("/api/accounts", headers={"X-API-Key": created["key"]})
    db.expire_all()
    assert db.query(ApiKey).one().last_used_at == first


def test_revoked_key_rejected(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user)
    raw_client.delete(
        f"/api/auth/api-keys/{created['api_key']['id']}", headers=_jwt(user)
    )
    r = raw_client.get("/api/accounts", headers={"X-API-Key": created["key"]})
    assert r.status_code == 401


def test_inactive_user_key_rejected(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user)
    user.is_active = False
    db.commit()
    r = raw_client.get("/api/accounts", headers={"X-API-Key": created["key"]})
    assert r.status_code == 401


def test_read_key_cannot_write(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user, scope="read")
    headers = {"X-API-Key": created["key"]}
    assert raw_client.get("/api/accounts", headers=headers).status_code == 200
    r = raw_client.post(
        "/api/accounts", json={"name": "A", "type": "checking"}, headers=headers
    )
    assert r.status_code == 403
    assert "read-only" in r.json()["detail"]


def test_full_key_can_write(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user, scope="full")
    r = raw_client.post(
        "/api/accounts",
        json={"name": "A", "type": "checking", "balance": 0},
        headers={"X-API-Key": created["key"]},
    )
    assert r.status_code != 403 and r.status_code != 401


def test_key_cannot_manage_keys(raw_client, db):
    user = _user(db)
    created = _create_key(raw_client, user, scope="full")
    headers = {"X-API-Key": created["key"]}
    assert raw_client.get("/api/auth/api-keys", headers=headers).status_code == 401
    assert (
        raw_client.post(
            "/api/auth/api-keys", json={"name": "x"}, headers=headers
        ).status_code
        == 401
    )


def test_unknown_key_rejected(raw_client, db):
    _user(db)
    r = raw_client.get("/api/accounts", headers={"X-API-Key": "pf_nope"})
    assert r.status_code == 401


# ---------------------------------------------------------------- last login


def test_login_sets_last_login(raw_client, db):
    user = _user(db)
    assert user.last_login_at is None

    bad = raw_client.post(
        "/api/auth/login", data={"username": user.email, "password": "wrong"}
    )
    assert bad.status_code == 401
    db.refresh(user)
    assert user.last_login_at is None

    ok = raw_client.post(
        "/api/auth/login", data={"username": user.email, "password": "secret-pass-1"}
    )
    assert ok.status_code == 200
    db.refresh(user)
    assert user.last_login_at is not None


def test_refresh_throttles_last_login(raw_client, db):
    from app.utils.security import create_refresh_token

    user = _user(db)
    recent = datetime.utcnow() - timedelta(minutes=1)
    user.last_login_at = recent
    db.commit()
    token = create_refresh_token({"sub": str(user.id)})

    assert raw_client.post(f"/api/auth/refresh?refresh_token={token}").status_code == 200
    db.refresh(user)
    assert user.last_login_at == recent  # within 15 min: untouched

    user.last_login_at = datetime.utcnow() - timedelta(hours=2)
    db.commit()
    assert raw_client.post(f"/api/auth/refresh?refresh_token={token}").status_code == 200
    db.refresh(user)
    assert user.last_login_at > datetime.utcnow() - timedelta(minutes=1)


def test_admin_users_list_includes_last_login(raw_client, db):
    admin = _user(db, "admin@example.com", admin=True)
    admin.last_login_at = datetime(2026, 1, 2, 3, 4, 5)
    _user(db, "never@example.com")
    db.commit()
    rows = raw_client.get("/api/admin/users", headers=_jwt(admin)).json()
    by_email = {r["email"]: r for r in rows}
    assert by_email["admin@example.com"]["last_login_at"].startswith("2026-01-02")
    assert by_email["never@example.com"]["last_login_at"] is None


# ---------------------------------------------------------------- invite delete


def _invite(db, admin, **kw):
    code = auth_tokens.generate_invite_code()
    inv = InviteCode(
        code_hash=auth_tokens.hash_token(code), created_by_user_id=admin.id, **kw
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return code, inv


def test_delete_used_invite_keeps_user(raw_client, db):
    admin = _user(db, "admin@example.com", admin=True)
    invitee = _user(db, "invitee@example.com")
    _, inv = _invite(
        db, admin, used_at=datetime.utcnow(), used_by_user_id=invitee.id
    )

    listed = raw_client.get("/api/admin/invites", headers=_jwt(admin)).json()
    assert listed[0]["used_by_email"] == "invitee@example.com"

    r = raw_client.delete(f"/api/admin/invites/{inv.id}", headers=_jwt(admin))
    assert r.status_code == 204
    assert db.query(InviteCode).count() == 0
    db.expire_all()
    kept = db.query(User).filter(User.email == "invitee@example.com").one()
    assert kept.is_active


def test_delete_unused_invite_blocks_registration(raw_client, db):
    admin = _user(db, "admin@example.com", admin=True)
    code, inv = _invite(db, admin)
    assert (
        raw_client.delete(f"/api/admin/invites/{inv.id}", headers=_jwt(admin)).status_code
        == 204
    )
    r = raw_client.post(
        "/api/auth/register",
        json={
            "email": "new@example.com",
            "password": "Str0ng-pass-123",
            "full_name": "New",
            "invite_code": code,
        },
    )
    assert r.status_code >= 400
    assert db.query(User).filter(User.email == "new@example.com").count() == 0


def test_delete_invite_requires_admin_and_existing(raw_client, db):
    admin = _user(db, "admin@example.com", admin=True)
    plain = _user(db, "plain@example.com")
    _, inv = _invite(db, admin)
    assert (
        raw_client.delete(f"/api/admin/invites/{inv.id}", headers=_jwt(plain)).status_code
        == 403
    )
    assert (
        raw_client.delete("/api/admin/invites/9999", headers=_jwt(admin)).status_code
        == 404
    )
