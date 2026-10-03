from app.config import settings
from fastapi.testclient import TestClient
import main


def test_legal_unconfigured_by_default(monkeypatch):
    monkeypatch.setattr(settings, "LEGAL_OPERATOR_NAME", None)
    monkeypatch.setattr(settings, "LEGAL_CONTACT_EMAIL", "  ")
    monkeypatch.setattr(settings, "LEGAL_JURISDICTION", None)
    with TestClient(main.app) as c:
        body = c.get("/api/legal").json()
    assert body == {
        "operator": None,
        "contact_email": None,
        "jurisdiction": None,
        "configured": False,
    }


def test_legal_configured_and_public(monkeypatch):
    monkeypatch.setattr(settings, "LEGAL_OPERATOR_NAME", " Jane Doe ")
    monkeypatch.setattr(settings, "LEGAL_CONTACT_EMAIL", "jane@example.com")
    monkeypatch.setattr(settings, "LEGAL_JURISDICTION", "Ireland")
    # No auth override and no token: the endpoint must be reachable anonymously.
    with TestClient(main.app) as c:
        r = c.get("/api/legal")
    assert r.status_code == 200
    assert r.json() == {
        "operator": "Jane Doe",
        "contact_email": "jane@example.com",
        "jurisdiction": "Ireland",
        "configured": True,
    }
