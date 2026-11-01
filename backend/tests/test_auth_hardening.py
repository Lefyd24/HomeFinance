"""Auth hardening: refresh cookie, logout revocation, rate limits, doc auth, upload cap."""

import io
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import main
from app.config import settings
from app.database import get_db
from app.models import User
from app.utils import rate_limit
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
)

PASSWORD = "secret-pass-1"


@pytest.fixture(autouse=True)
def _fresh_limiters():
    rate_limit.ip_limiter._buckets.clear()
    rate_limit.email_limiter._buckets.clear()
    yield
    rate_limit.ip_limiter._buckets.clear()
    rate_limit.email_limiter._buckets.clear()


@pytest.fixture()
def raw_client(db):
    def _get_db_override():
        yield db

    main.app.dependency_overrides[get_db] = _get_db_override
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


@pytest.fixture()
def user(db):
    u = User(
        email="login@example.com",
        hashed_password=get_password_hash(PASSWORD),
        full_name="L",
        is_active=True,
        email_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _cookie(token):
    return {"Cookie": f"refresh_token={token}"}


def _login(c, user):
    return c.post("/api/auth/login", data={"username": user.email, "password": PASSWORD})


def _refresh_cookie_value(resp):
    return resp.headers["set-cookie"].split(";")[0].split("=", 1)[1]


def test_login_sets_hardened_refresh_cookie(raw_client, user):
    resp = _login(raw_client, user)
    assert resp.status_code == 200
    assert not resp.json().get("refresh_token")
    cookie = resp.headers["set-cookie"].lower()
    assert cookie.startswith("refresh_token=")
    for part in ("httponly", "secure", "samesite=strict", "path=/api/auth"):
        assert part in cookie
    assert f"max-age={settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60}" in cookie


def test_refresh_needs_cookie_not_query(raw_client, user):
    token = create_refresh_token({"sub": str(user.id)})
    assert raw_client.post("/api/auth/refresh").status_code == 401
    assert raw_client.post(f"/api/auth/refresh?refresh_token={token}").status_code == 401
    ok = raw_client.post("/api/auth/refresh", headers=_cookie(token))
    assert ok.status_code == 200
    assert not ok.json().get("refresh_token")
    assert "refresh_token=" in ok.headers["set-cookie"]


def test_logout_revokes_old_tokens_and_login_still_works(raw_client, user):
    login = _login(raw_client, user)
    access = login.json()["access_token"]
    refresh = _refresh_cookie_value(login)

    out = raw_client.post("/api/auth/logout", headers=_bearer(access))
    assert out.status_code == 200
    cleared = out.headers["set-cookie"].lower()
    assert "refresh_token=" in cleared and "path=/api/auth" in cleared
    assert "max-age=0" in cleared or "expires=" in cleared

    assert raw_client.get("/api/auth/me", headers=_bearer(access)).status_code == 401
    assert raw_client.post("/api/auth/refresh", headers=_cookie(refresh)).status_code == 401

    again = _login(raw_client, user)
    assert again.status_code == 200
    assert (
        raw_client.get(
            "/api/auth/me", headers=_bearer(again.json()["access_token"])
        ).status_code
        == 200
    )


def test_logout_with_only_refresh_cookie_revokes_it(raw_client, user):
    refresh = _refresh_cookie_value(_login(raw_client, user))
    out = raw_client.post("/api/auth/logout", headers=_cookie(refresh))
    assert out.status_code == 200
    assert raw_client.post("/api/auth/refresh", headers=_cookie(refresh)).status_code == 401


def test_expired_access_token_rejected(raw_client, user):
    token = create_access_token({"sub": str(user.id)}, timedelta(seconds=-5))
    assert raw_client.get("/api/auth/me", headers=_bearer(token)).status_code == 401


def test_refresh_token_not_accepted_as_access(raw_client, user):
    token = create_refresh_token({"sub": str(user.id)})
    assert raw_client.get("/api/auth/me", headers=_bearer(token)).status_code == 401


def test_reset_token_single_use_and_expiry(raw_client, db, user):
    from app.services import auth_tokens

    tok = auth_tokens.create_user_token(db, user.id, "password_reset", 30)
    body = {"token": tok, "new_password": "brand-new-pass"}
    assert raw_client.post("/api/auth/reset-password", json=body).status_code == 200
    assert raw_client.post("/api/auth/reset-password", json=body).status_code == 400

    expired = auth_tokens.create_user_token(db, user.id, "password_reset", -1)
    body["token"] = expired
    assert raw_client.post("/api/auth/reset-password", json=body).status_code == 400


def test_refresh_and_reset_are_rate_limited(raw_client):
    n = settings.RATE_LIMIT_PER_IP_MAX
    codes = [raw_client.post("/api/auth/refresh").status_code for _ in range(n + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {401}

    rate_limit.ip_limiter._buckets.clear()
    body = {"token": "nope", "new_password": "brand-new-pass"}
    codes = [
        raw_client.post("/api/auth/reset-password", json=body).status_code
        for _ in range(n + 1)
    ]
    assert codes[-1] == 429


def test_successful_login_keeps_ip_bucket(raw_client, user):
    key = "ip:testclient"
    assert _login(raw_client, user).status_code == 200
    assert _login(raw_client, user).status_code == 200
    assert len(rate_limit.ip_limiter._buckets[key].hits) == 2


def test_documents_query_token_rejected_header_works(raw_client, user):
    token = create_access_token({"sub": str(user.id)})
    assert (
        raw_client.get(f"/api/documents/x/download?token={token}").status_code == 401
    )
    # Authenticated, so the missing document is a 404 rather than 401.
    resp = raw_client.get("/api/documents/x/download", headers=_bearer(token))
    assert resp.status_code == 404


def test_upload_over_cap_rejected_without_full_read(raw_client, user, monkeypatch):
    monkeypatch.setattr(settings, "DOCUMENTS_MAX_FILE_SIZE", 10)
    token = create_access_token({"sub": str(user.id)})
    resp = raw_client.post(
        "/api/documents/upload",
        headers=_bearer(token),
        data={"title": "t"},
        files={"file": ("a.txt", io.BytesIO(b"x" * 100), "text/plain")},
    )
    assert resp.status_code == 413
