"""API behaviour tests for categorisation rules."""

from tests.factories import make_account, make_category, make_transaction


def _rule_payload(category_id, **overrides):
    payload = {
        "name": "Supermarkets",
        "category_id": category_id,
        "match_type": "all",
        "priority": 10,
        "is_active": True,
        "conditions": [
            {"field": "description", "operator": "contains", "value": "SKLAVENITIS"}
        ],
    }
    payload.update(overrides)
    return payload


def test_create_and_list_rules(client, db, seed_user):
    cat = make_category(db, seed_user, name="Groceries")

    created = client.post("/api/rules", json=_rule_payload(cat.id))
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Supermarkets"
    assert body["category_name"] == "Groceries"
    assert len(body["conditions"]) == 1

    listed = client.get("/api/rules")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_preview_returns_match_count_and_sample(client, db, seed_user):
    account = make_account(db, seed_user)
    make_transaction(db, seed_user, account, description="SKLAVENITIS A", category=None)
    make_transaction(db, seed_user, account, description="other shop", category=None)

    res = client.post(
        "/api/rules/preview",
        json={
            "match_type": "all",
            "conditions": [
                {"field": "description", "operator": "contains", "value": "SKLAVENITIS"}
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["match_count"] == 1
    assert len(data["sample"]) == 1
    assert "SKLAVENITIS" in data["sample"][0]["description"]


def test_apply_rule_back_propagates_to_past_transactions(client, db, seed_user):
    account = make_account(db, seed_user)
    cat = make_category(db, seed_user, name="Groceries")
    tx = make_transaction(
        db, seed_user, account, description="SKLAVENITIS past", category=None
    )

    created = client.post("/api/rules", json=_rule_payload(cat.id)).json()
    res = client.post(f"/api/rules/{created['id']}/apply", json={"include_categorised": False})
    assert res.status_code == 200
    assert res.json()["updated"] == 1

    db.refresh(tx)
    assert tx.category_id == cat.id


def test_create_with_apply_to_existing(client, db, seed_user):
    account = make_account(db, seed_user)
    cat = make_category(db, seed_user, name="Groceries")
    tx = make_transaction(
        db, seed_user, account, description="SKLAVENITIS past", category=None
    )

    res = client.post(
        "/api/rules",
        json=_rule_payload(cat.id, apply_to_existing=True),
    )
    assert res.status_code == 201
    db.refresh(tx)
    assert tx.category_id == cat.id


def test_cannot_create_rule_for_another_users_category(client, db, seed_user):
    from app.models import User

    other = User(email="other@example.com", hashed_password="x", full_name="Other", is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    foreign = make_category(db, other, name="Foreign")

    res = client.post("/api/rules", json=_rule_payload(foreign.id))
    assert res.status_code == 400


def test_delete_category_blocked_when_rules_reference_it(client, db, seed_user):
    cat = make_category(db, seed_user, name="Groceries")
    client.post("/api/rules", json=_rule_payload(cat.id))

    res = client.delete(f"/api/categories/{cat.id}")
    assert res.status_code == 400
    assert "categorisation rules" in res.json()["detail"].lower()


def test_rejects_pathological_regex_on_create(client, db, seed_user):
    cat = make_category(db, seed_user, name="Groceries")
    res = client.post(
        "/api/rules",
        json=_rule_payload(
            cat.id,
            conditions=[{"field": "description", "operator": "regex", "value": "(a+)+$"}],
        ),
    )
    assert res.status_code == 422


def test_user_cannot_apply_another_users_rule(client, db, seed_user):
    from app.models import User
    from app.models.category_rule import CategoryRule, CategoryRuleCondition

    other = User(email="other2@example.com", hashed_password="x", full_name="Other", is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)
    cat = make_category(db, other, name="Groceries")
    rule = CategoryRule(
        user_id=other.id,
        name="Foreign",
        category_id=cat.id,
        match_type="all",
        priority=10,
        is_active=True,
    )
    db.add(rule)
    db.flush()
    db.add(
        CategoryRuleCondition(
            rule_id=rule.id,
            field="description",
            operator="contains",
            value="x",
        )
    )
    db.commit()

    res = client.post(f"/api/rules/{rule.id}/apply")
    assert res.status_code == 404
