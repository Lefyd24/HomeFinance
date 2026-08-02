"""Behaviour tests for categorisation rules."""

from tests.factories import make_account, make_category, make_transaction


def _make_rule(db, user, category, *, name="Rule", match_type="all", priority=100,
               is_active=True, stop_on_match=True, conditions=None):
    from app.models.category_rule import CategoryRule, CategoryRuleCondition

    rule = CategoryRule(
        user_id=user.id,
        name=name,
        category_id=category.id,
        match_type=match_type,
        priority=priority,
        is_active=is_active,
        stop_on_match=stop_on_match,
    )
    db.add(rule)
    db.flush()
    for cond in conditions or []:
        db.add(
            CategoryRuleCondition(
                rule_id=rule.id,
                field=cond["field"],
                operator=cond["operator"],
                value=cond.get("value"),
                value_to=cond.get("value_to"),
            )
        )
    db.commit()
    db.refresh(rule)
    return rule


def test_categorise_assigns_category_when_description_contains_match(db, seed_user):
    from app.services import rule_service

    cat = make_category(db, seed_user, name="Groceries")
    _make_rule(
        db,
        seed_user,
        cat,
        conditions=[{"field": "description", "operator": "contains", "value": "SKLAVENITIS"}],
    )

    result = rule_service.categorise(
        db,
        seed_user.id,
        {
            "description": "Purchase at SKLAVENITIS ATHENS",
            "amount": 42.5,
            "type": "expense",
            "account_id": 1,
            "category_id": None,
        },
    )

    assert result == cat.id


def test_categorise_matches_greek_accents_and_case_insensitively(db, seed_user):
    from app.services import rule_service

    cat = make_category(db, seed_user, name="Groceries")
    _make_rule(
        db,
        seed_user,
        cat,
        conditions=[{"field": "description", "operator": "contains", "value": "σκλαβενίτης"}],
    )

    result = rule_service.categorise(
        db,
        seed_user.id,
        {"description": "ΣΚΛΑΒΕΝΙΤΗΣ ΑΜΑΡΟΥΣΙΟΥ", "amount": 10, "type": "expense", "category_id": None},
    )
    assert result == cat.id


def test_categorise_skips_already_categorised_transactions(db, seed_user):
    from app.services import rule_service

    groceries = make_category(db, seed_user, name="Groceries")
    dining = make_category(db, seed_user, name="Dining")
    _make_rule(
        db,
        seed_user,
        groceries,
        conditions=[{"field": "description", "operator": "contains", "value": "cafe"}],
    )

    result = rule_service.categorise(
        db,
        seed_user.id,
        {
            "description": "cafe downtown",
            "amount": 8,
            "type": "expense",
            "category_id": dining.id,
        },
    )
    assert result is None


def test_categorise_first_match_by_priority_wins(db, seed_user):
    from app.services import rule_service

    groceries = make_category(db, seed_user, name="Groceries")
    shopping = make_category(db, seed_user, name="Shopping")
    _make_rule(
        db,
        seed_user,
        shopping,
        name="Later",
        priority=20,
        conditions=[{"field": "description", "operator": "contains", "value": "market"}],
    )
    _make_rule(
        db,
        seed_user,
        groceries,
        name="Earlier",
        priority=10,
        conditions=[{"field": "description", "operator": "contains", "value": "market"}],
    )

    result = rule_service.categorise(
        db,
        seed_user.id,
        {"description": "local market", "amount": 5, "type": "expense", "category_id": None},
    )
    assert result == groceries.id


def test_categorise_skips_inactive_rules(db, seed_user):
    from app.services import rule_service

    cat = make_category(db, seed_user, name="Groceries")
    _make_rule(
        db,
        seed_user,
        cat,
        is_active=False,
        conditions=[{"field": "description", "operator": "contains", "value": "SKLAVENITIS"}],
    )

    result = rule_service.categorise(
        db,
        seed_user.id,
        {"description": "SKLAVENITIS", "amount": 1, "type": "expense", "category_id": None},
    )
    assert result is None


def test_categorise_match_type_any_ors_conditions(db, seed_user):
    from app.services import rule_service

    cat = make_category(db, seed_user, name="Food")
    _make_rule(
        db,
        seed_user,
        cat,
        match_type="any",
        conditions=[
            {"field": "description", "operator": "contains", "value": "pizza"},
            {"field": "description", "operator": "contains", "value": "sushi"},
        ],
    )

    result = rule_service.categorise(
        db,
        seed_user.id,
        {"description": "fresh sushi box", "amount": 12, "type": "expense", "category_id": None},
    )
    assert result == cat.id


def test_categorise_amount_between_is_inclusive_on_abs_value(db, seed_user):
    from app.services import rule_service

    cat = make_category(db, seed_user, name="Small")
    _make_rule(
        db,
        seed_user,
        cat,
        conditions=[
            {"field": "amount", "operator": "between", "value": "5", "value_to": "20"},
            {"field": "type", "operator": "eq", "value": "expense"},
        ],
    )

    assert (
        rule_service.categorise(
            db,
            seed_user.id,
            {"description": "x", "amount": 20, "type": "expense", "category_id": None},
        )
        == cat.id
    )
    assert (
        rule_service.categorise(
            db,
            seed_user.id,
            {"description": "x", "amount": 4.99, "type": "expense", "category_id": None},
        )
        is None
    )


def test_pathological_regex_is_rejected():
    from app.services import rule_service
    import pytest

    with pytest.raises(ValueError):
        rule_service.validate_regex("(a+)+$")


def test_apply_to_existing_back_propagates_only_uncategorised(db, seed_user):
    from app.services import rule_service

    account = make_account(db, seed_user)
    groceries = make_category(db, seed_user, name="Groceries")
    dining = make_category(db, seed_user, name="Dining")
    rule = _make_rule(
        db,
        seed_user,
        groceries,
        conditions=[{"field": "description", "operator": "contains", "value": "SKLAVENITIS"}],
    )
    uncategorised = make_transaction(
        db, seed_user, account, description="SKLAVENITIS run", category=None
    )
    already = make_transaction(
        db, seed_user, account, description="SKLAVENITIS earlier", category=dining
    )

    updated = rule_service.apply_to_existing(db, seed_user.id, rule=rule)

    db.refresh(uncategorised)
    db.refresh(already)
    db.refresh(rule)
    assert updated == 1
    assert uncategorised.category_id == groceries.id
    assert already.category_id == dining.id
    assert rule.times_applied == 1


def test_apply_to_existing_can_overwrite_when_opted_in(db, seed_user):
    from app.services import rule_service

    account = make_account(db, seed_user)
    groceries = make_category(db, seed_user, name="Groceries")
    dining = make_category(db, seed_user, name="Dining")
    rule = _make_rule(
        db,
        seed_user,
        groceries,
        conditions=[{"field": "description", "operator": "contains", "value": "SKLAVENITIS"}],
    )
    already = make_transaction(
        db, seed_user, account, description="SKLAVENITIS earlier", category=dining
    )

    updated = rule_service.apply_to_existing(
        db, seed_user.id, rule=rule, include_categorised=True
    )

    db.refresh(already)
    assert updated == 1
    assert already.category_id == groceries.id
