"""Token-type and session-invalidation checks on the real auth dependencies.

Unlike the shared `client` fixture, these tests do NOT override the auth
dependencies — the point is to exercise the JWT checks themselves.
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import main
from app.database import get_db
from app.utils.security import create_access_token, create_refresh_token


@pytest.fixture()
def raw_client(db):
    def _get_db_override():
        yield db

    main.app.dependency_overrides[get_db] = _get_db_override
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _invalidate_sessions(db, user):
    # Simulates a password reset/change: every token issued before now dies.
    user.sessions_valid_from = datetime.utcnow() + timedelta(seconds=5)
    db.commit()


def test_access_token_is_accepted(raw_client, seed_user):
    token = create_access_token({"sub": str(seed_user.id)})
    assert raw_client.get("/api/auth/me", headers=_bearer(token)).status_code == 200


def test_refresh_token_is_rejected_as_access_token(raw_client, seed_user):
    token = create_refresh_token({"sub": str(seed_user.id)})
    assert raw_client.get("/api/auth/me", headers=_bearer(token)).status_code == 401


def test_refresh_token_rejected_on_document_download(raw_client, seed_user):
    token = create_refresh_token({"sub": str(seed_user.id)})
    resp = raw_client.get(f"/api/documents/whatever/download?token={token}")
    assert resp.status_code == 401


def test_document_token_rejected_after_password_reset(raw_client, db, seed_user):
    token = create_access_token({"sub": str(seed_user.id)})
    _invalidate_sessions(db, seed_user)
    resp = raw_client.get(f"/api/documents/whatever/download?token={token}")
    assert resp.status_code == 401


def test_refresh_rejected_after_password_reset(raw_client, db, seed_user):
    refresh = create_refresh_token({"sub": str(seed_user.id)})
    assert raw_client.post(f"/api/auth/refresh?refresh_token={refresh}").status_code == 200

    _invalidate_sessions(db, seed_user)
    assert raw_client.post(f"/api/auth/refresh?refresh_token={refresh}").status_code == 401


def test_access_token_cannot_be_used_to_refresh(raw_client, seed_user):
    token = create_access_token({"sub": str(seed_user.id)})
    assert raw_client.post(f"/api/auth/refresh?refresh_token={token}").status_code == 401
