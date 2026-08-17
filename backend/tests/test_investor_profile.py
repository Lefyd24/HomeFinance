"""Investor profile: validation, revision logging, undo, and API ownership.

The validation tests matter more than usual here because the AI advisor writes
through the same `apply_updates` path — these are the guardrails on a model's
tool call, not just on a form.
"""
import pytest

from app.models import User
from app.models.investor_profile import InvestorProfile, InvestorProfileRevision
from app.services import investor_profile_service as svc


# --- service: validation ---------------------------------------------------


def test_unset_profile_reads_as_not_set(db, seed_user):
    profile = svc.to_dict(svc.get_profile(db, seed_user.id))
    assert profile["is_set"] is False
    # Nothing known is, by definition, not current — so the advisor asks.
    assert profile["is_stale"] is True
    assert profile["risk_tolerance"] is None


def test_apply_updates_normalizes_and_persists(db, seed_user):
    result = svc.apply_updates(
        db,
        seed_user.id,
        {
            "risk_tolerance": "  Balanced ",
            "horizon_years": "12",
            "excluded_symbols": ["tsla", " nvda "],
            "target_allocation": {"Equity": 70, "bond": 20, "cash": 10},
        },
    )

    profile = result["profile"]
    assert profile["risk_tolerance"] == "balanced"
    assert profile["horizon_years"] == 12
    assert profile["excluded_symbols"] == ["TSLA", "NVDA"]
    assert profile["target_allocation"] == {"equity": 70.0, "bond": 20.0, "cash": 10.0}
    assert profile["is_set"] is True
    assert profile["updated_by"] == "user"


def test_unknown_field_is_rejected(db, seed_user):
    with pytest.raises(svc.ProfileValidationError, match="Not editable"):
        svc.apply_updates(db, seed_user.id, {"user_id": 999})


def test_bad_enum_is_rejected(db, seed_user):
    with pytest.raises(svc.ProfileValidationError, match="risk_tolerance must be one of"):
        svc.apply_updates(db, seed_user.id, {"risk_tolerance": "yolo"})


def test_allocation_not_summing_to_100_is_rejected(db, seed_user):
    with pytest.raises(svc.ProfileValidationError, match="sum to about 100"):
        svc.apply_updates(db, seed_user.id, {"target_allocation": {"equity": 50, "cash": 10}})


def test_allocation_within_tolerance_is_accepted(db, seed_user):
    result = svc.apply_updates(
        db, seed_user.id, {"target_allocation": {"equity": 70, "bond": 25, "cash": 6}}
    )
    assert result["profile"]["target_allocation"]["bond"] == 25.0


def test_unknown_asset_class_is_rejected(db, seed_user):
    with pytest.raises(svc.ProfileValidationError, match="Unknown asset class"):
        svc.apply_updates(db, seed_user.id, {"target_allocation": {"equity": 100, "gold": 0}})


def test_out_of_range_numbers_are_rejected(db, seed_user):
    with pytest.raises(svc.ProfileValidationError, match="between 0 and 100"):
        svc.apply_updates(db, seed_user.id, {"horizon_years": 500})
    with pytest.raises(svc.ProfileValidationError, match="between 0 and 100"):
        svc.apply_updates(db, seed_user.id, {"max_single_position_pct": 150})


def test_a_rejected_field_writes_nothing(db, seed_user):
    """A partially applied profile would be worse than a rejected one."""
    with pytest.raises(svc.ProfileValidationError):
        svc.apply_updates(
            db, seed_user.id, {"risk_tolerance": "growth", "horizon_years": -5}
        )

    assert svc.get_profile(db, seed_user.id) is None


# --- service: revisions ----------------------------------------------------


def test_agent_change_records_a_revision_with_its_reason(db, seed_user):
    svc.apply_updates(db, seed_user.id, {"horizon_years": 10})
    svc.apply_updates(
        db,
        seed_user.id,
        {"horizon_years": 3},
        source="agent",
        reason="User said they need the money for a house in about three years.",
    )

    revisions = svc.list_revisions(db, seed_user.id)
    assert [r["new_value"] for r in revisions] == [3, 10]

    agent_revision = revisions[0]
    assert agent_revision["source"] == "agent"
    assert agent_revision["old_value"] == 10
    assert "house" in agent_revision["reason"]
    assert svc.get_profile(db, seed_user.id).updated_by == "agent"


def test_no_op_update_records_no_revision(db, seed_user):
    svc.apply_updates(db, seed_user.id, {"risk_tolerance": "growth"})
    result = svc.apply_updates(db, seed_user.id, {"risk_tolerance": "growth"})

    assert result["changes"] == []
    assert len(svc.list_revisions(db, seed_user.id)) == 1


def test_undo_restores_the_previous_value_and_keeps_history(db, seed_user):
    svc.apply_updates(db, seed_user.id, {"horizon_years": 10})
    svc.apply_updates(db, seed_user.id, {"horizon_years": 3}, source="agent", reason="because")

    agent_revision_id = svc.list_revisions(db, seed_user.id)[0]["id"]
    result = svc.undo_revision(db, seed_user.id, agent_revision_id)

    assert result["profile"]["horizon_years"] == 10
    # The undone revision is marked, not deleted — the advisor's history stays intact.
    revisions = svc.list_revisions(db, seed_user.id)
    undone = next(r for r in revisions if r["id"] == agent_revision_id)
    assert undone["undone_at"] is not None
    assert len(revisions) == 3


def test_undo_cannot_be_replayed(db, seed_user):
    svc.apply_updates(db, seed_user.id, {"horizon_years": 10})
    svc.apply_updates(db, seed_user.id, {"horizon_years": 3}, source="agent")
    revision_id = svc.list_revisions(db, seed_user.id)[0]["id"]

    svc.undo_revision(db, seed_user.id, revision_id)
    with pytest.raises(svc.ProfileValidationError, match="already been undone"):
        svc.undo_revision(db, seed_user.id, revision_id)


def test_undo_of_another_users_revision_is_not_found(db, seed_user):
    other = User(email="other@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)

    svc.apply_updates(db, other.id, {"horizon_years": 7})
    other_revision_id = svc.list_revisions(db, other.id)[0]["id"]

    with pytest.raises(svc.ProfileValidationError, match="Revision not found"):
        svc.undo_revision(db, seed_user.id, other_revision_id)


def test_deleting_a_profile_cascades_to_revisions(db, seed_user):
    svc.apply_updates(db, seed_user.id, {"horizon_years": 10})
    profile = svc.get_profile(db, seed_user.id)

    db.delete(profile)
    db.commit()

    assert db.query(InvestorProfileRevision).count() == 0
    assert db.query(InvestorProfile).count() == 0


# --- API -------------------------------------------------------------------


def test_get_returns_unset_profile(client):
    response = client.get("/api/investor-profile")
    assert response.status_code == 200
    assert response.json()["is_set"] is False


def test_put_then_get_round_trips(client):
    response = client.put(
        "/api/investor-profile",
        json={"risk_tolerance": "growth", "horizon_years": 15, "max_single_position_pct": 20},
    )
    assert response.status_code == 200

    body = client.get("/api/investor-profile").json()
    assert body["risk_tolerance"] == "growth"
    assert body["horizon_years"] == 15
    assert body["max_single_position_pct"] == 20.0
    assert body["is_set"] is True


def test_put_rejects_a_bad_value_with_422(client):
    response = client.put("/api/investor-profile", json={"risk_tolerance": "reckless"})
    assert response.status_code == 422
    assert "risk_tolerance" in response.json()["detail"]


def test_omitted_fields_are_left_alone(client):
    client.put("/api/investor-profile", json={"risk_tolerance": "growth", "horizon_years": 15})
    client.put("/api/investor-profile", json={"horizon_years": 20})

    body = client.get("/api/investor-profile").json()
    assert body["risk_tolerance"] == "growth"
    assert body["horizon_years"] == 20


def test_explicit_null_clears_a_field(client):
    client.put("/api/investor-profile", json={"risk_tolerance": "growth"})
    client.put("/api/investor-profile", json={"risk_tolerance": None})

    assert client.get("/api/investor-profile").json()["risk_tolerance"] is None


def test_options_lists_the_allowed_values(client):
    body = client.get("/api/investor-profile/options").json()
    assert "aggressive" in body["risk_tolerances"]
    assert "equity" in body["allocation_classes"]
    assert "risk_tolerance" in body["editable_fields"]
    assert "user_id" not in body["editable_fields"]


def test_revisions_and_undo_over_the_api(client):
    client.put("/api/investor-profile", json={"horizon_years": 10})
    client.put("/api/investor-profile", json={"horizon_years": 3})

    revisions = client.get("/api/investor-profile/revisions").json()
    assert revisions[0]["new_value"] == 3

    response = client.post(f"/api/investor-profile/revisions/{revisions[0]['id']}/undo")
    assert response.status_code == 200
    assert response.json()["horizon_years"] == 10


def test_undo_of_a_missing_revision_is_404(client):
    assert client.post("/api/investor-profile/revisions/9999/undo").status_code == 404
