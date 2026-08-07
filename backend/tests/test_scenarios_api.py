"""backend/app/routers/scenarios.py — ownership isolation, spec immutability, the
per-user cap, and the track-record endpoint. Per docs/investments/02-backtesting-sandbox.md
Part 7.
"""

from datetime import date, timedelta

import pandas as pd
import pytest

import main
from app.models.scenario import Scenario
from app.models.user import User
from app.services import scenario_service
from app.utils.security import get_current_user_authenticated


class _Meta:
    currency = "EUR"
    quote_type = "equity"


def _fake_price_history(symbols, start, end, *, db, refresh=False):
    idx = pd.bdate_range(start, end)
    if len(idx) == 0:
        idx = pd.bdate_range(start, start + timedelta(days=5))
    return {sym: pd.DataFrame({"close": [100.0] * len(idx)}, index=idx) for sym in symbols}


def _fake_symbol_meta(db, symbol, *, refresh=False):
    return _Meta()


def _fake_risk_free(db, start, end, *, override_annual=None):
    idx = pd.date_range(start, end, freq="D")
    return pd.Series(0.02, index=idx), "fallback_constant"


def _fake_to_currency(frame, from_ccy, to_ccy, db):
    return frame, False


@pytest.fixture(autouse=True)
def _patch_market_data(monkeypatch):
    monkeypatch.setattr(scenario_service, "get_price_history", _fake_price_history)
    monkeypatch.setattr(scenario_service, "get_symbol_meta", _fake_symbol_meta)
    monkeypatch.setattr(scenario_service, "get_risk_free_rate", _fake_risk_free)
    monkeypatch.setattr(scenario_service, "to_currency", _fake_to_currency)


def _spec_payload(**overrides):
    payload = {
        "symbol": "TST",
        "start_date": (date.today() - timedelta(days=300)).isoformat(),
        "end_date": None,
        "initial_amount": 1000.0,
        "currency": "EUR",
        "contribution_amount": 0.0,
        "contribution_freq": "none",
        "benchmark": None,
        "cost_bps": 10.0,
        "cost_flat": 0.0,
        "dividend_treatment": "reinvest",
        "dividend_withholding_pct": 0.0,
        "kind": "backtest",
    }
    payload.update(overrides)
    return payload


def test_preview_does_not_persist(client):
    resp = client.post("/api/scenarios/preview", json=_spec_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["scenario"]["final_value"] > 0
    listed = client.get("/api/scenarios")
    assert listed.json() == []


def test_create_and_get_scenario(client):
    resp = client.post(
        "/api/scenarios", json=_spec_payload(name="MSFT test", note="testing")
    )
    assert resp.status_code == 201, resp.text
    scenario_id = resp.json()["id"]

    detail = client.get(f"/api/scenarios/{scenario_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["name"] == "MSFT test"
    assert body["result"]["scenario"]["final_value"] > 0


def test_ownership_isolation(client, db):
    resp = client.post("/api/scenarios", json=_spec_payload(name="Owner scenario"))
    scenario_id = resp.json()["id"]

    other = User(email="other@example.com", hashed_password="x", full_name="Other", is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)

    main.app.dependency_overrides[get_current_user_authenticated] = lambda: other
    try:
        resp = client.get(f"/api/scenarios/{scenario_id}")
        assert resp.status_code == 404
    finally:
        main.app.dependency_overrides[get_current_user_authenticated] = lambda: db.query(
            User
        ).filter(User.email == "test@example.com").first()


def test_spec_immutability_on_patch(client):
    resp = client.post("/api/scenarios", json=_spec_payload(name="Locked spec"))
    scenario_id = resp.json()["id"]
    original_start = resp.json()["start_date"]

    patch_resp = client.patch(
        f"/api/scenarios/{scenario_id}",
        json={"name": "Renamed", "start_date": "2020-01-01"},
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["name"] == "Renamed"
    assert body["start_date"] == original_start


def test_per_user_scenario_cap(client, monkeypatch):
    monkeypatch.setattr(scenario_service.settings, "SCENARIO_MAX_PER_USER", 1)
    first = client.post("/api/scenarios", json=_spec_payload(name="First"))
    assert first.status_code == 201
    second = client.post("/api/scenarios", json=_spec_payload(name="Second"))
    assert second.status_code == 422


def test_track_record_endpoint_seeded(client, db, seed_user):
    today = date.today()
    closed_win = Scenario(
        user_id=seed_user.id, name="Winner", kind="backtest", symbol="TST",
        start_date=today - timedelta(days=200), end_date=today - timedelta(days=10),
        initial_amount=1000.0, currency="EUR", contribution_amount=0.0,
        contribution_freq="none", benchmark="^GSPC", cost_bps=10.0, cost_flat=0.0,
        dividend_treatment="reinvest", dividend_withholding_pct=0.0, status="closed",
        last_value=1200.0, last_return_pct=0.20, last_benchmark_return_pct=0.10,
    )
    closed_loss = Scenario(
        user_id=seed_user.id, name="Loser", kind="backtest", symbol="TST",
        start_date=today - timedelta(days=200), end_date=today - timedelta(days=10),
        initial_amount=1000.0, currency="EUR", contribution_amount=0.0,
        contribution_freq="none", benchmark="^GSPC", cost_bps=10.0, cost_flat=0.0,
        dividend_treatment="reinvest", dividend_withholding_pct=0.0, status="closed",
        last_value=900.0, last_return_pct=-0.10, last_benchmark_return_pct=0.05,
    )
    db.add_all([closed_win, closed_loss])
    db.commit()

    resp = client.get("/api/scenarios/track-record")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert body["count_beating_benchmark"] == 1
    assert body["verdict_key"] == "too_few"
    assert body["hit_rate"] == pytest.approx(0.5)
