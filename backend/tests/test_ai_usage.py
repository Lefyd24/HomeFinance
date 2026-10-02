from datetime import datetime, timezone

from fastapi.testclient import TestClient

import main
from app.database import get_db
from app.models import User
from app.models.ai_usage import AiUsage
from app.services import ai_usage_service as svc

NOW = datetime(2026, 10, 15, 12, 0, 0)


def _add(db, user_id, model, cost, created_at=NOW, prompt=100, completion=50):
    db.add(AiUsage(user_id=user_id, model=model, cost_usd=cost, prompt_tokens=prompt,
                   completion_tokens=completion, created_at=created_at))
    db.commit()


def _other_user(db):
    u = User(email="other@example.com", hashed_password="x", full_name="O", is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_record_and_summary(db, seed_user):
    svc.record_usage(db, seed_user.id, "m/a", {"prompt_tokens": 10, "completion_tokens": 5,
                                               "cost_usd": 0.5, "cost_estimated": True})
    svc.record_usage(db, seed_user.id, "m/a", {})  # tolerant of missing keys
    s = svc.usage_summary(db, seed_user.id)
    assert s["turns"] == 2
    assert s["prompt_tokens"] == 10 and s["completion_tokens"] == 5
    assert s["cost_usd"] == 0.5 and s["household_cost_usd"] == 0.5
    assert s["month"] == datetime.utcnow().strftime("%Y-%m")
    assert db.query(AiUsage).order_by(AiUsage.id).first().cost_estimated is True


def test_month_boundary(db, seed_user):
    _add(db, seed_user.id, "m/a", 9.0, datetime(2026, 9, 30, 23, 59, 59))
    _add(db, seed_user.id, "m/a", 1.0, datetime(2026, 10, 1, 0, 0, 0))
    _add(db, seed_user.id, "m/a", 5.0, datetime(2026, 11, 1, 0, 0, 0))
    assert svc.household_month_spend(db, NOW) == 1.0
    assert svc.usage_summary(db, seed_user.id, NOW)["turns"] == 1


def test_december_rollover(db, seed_user):
    _add(db, seed_user.id, "m/a", 2.0, datetime(2026, 12, 31, 23, 0, 0))
    _add(db, seed_user.id, "m/a", 7.0, datetime(2027, 1, 1))
    assert svc.household_month_spend(db, datetime(2026, 12, 5)) == 2.0


def test_other_user_only_in_household(db, seed_user):
    other = _other_user(db)
    _add(db, seed_user.id, "m/a", 1.0)
    _add(db, other.id, "m/a", 3.0)
    s = svc.usage_summary(db, seed_user.id, NOW)
    assert s["cost_usd"] == 1.0 and s["turns"] == 1
    assert s["household_cost_usd"] == 4.0


def test_by_model_sorted_by_cost_desc(db, seed_user):
    _add(db, seed_user.id, "cheap", 0.1)
    _add(db, seed_user.id, "pricey", 2.0)
    _add(db, seed_user.id, "pricey", 1.0)
    _add(db, seed_user.id, "mid", 0.5)
    by = svc.usage_summary(db, seed_user.id, NOW)["by_model"]
    assert [m["model"] for m in by] == ["pricey", "mid", "cheap"]
    assert by[0]["turns"] == 2 and by[0]["cost_usd"] == 3.0


def test_aware_now_converted_to_utc(db, seed_user):
    _add(db, seed_user.id, "m/a", 1.0)
    assert svc.household_month_spend(db, NOW.replace(tzinfo=timezone.utc)) == 1.0


def test_endpoint_shape(client, db, seed_user):
    _add(db, seed_user.id, "m/a", 1.0, created_at=datetime.utcnow())
    r = client.get("/api/ai/usage")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"month", "cost_usd", "turns", "prompt_tokens", "completion_tokens",
                         "household_cost_usd", "cap_usd", "by_model"}
    assert body["turns"] == 1 and body["by_model"][0]["model"] == "m/a"


def test_endpoint_requires_auth(db):
    def _db():
        yield db

    main.app.dependency_overrides[get_db] = _db
    try:
        with TestClient(main.app) as c:
            assert c.get("/api/ai/usage").status_code in (401, 403)
    finally:
        main.app.dependency_overrides.clear()
