"""CRUD and apply endpoints for categorisation rules."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Category, User
from app.models.category_rule import CategoryRule, CategoryRuleCondition
from app.schemas.category_rule import (
    CategoryRuleCreate,
    CategoryRuleResponse,
    CategoryRuleUpdate,
    RuleApplyRequest,
    RuleApplyResponse,
    RulePreviewRequest,
    RulePreviewResponse,
    RuleReorderRequest,
)
from app.services import rule_service
from app.utils.security import get_current_user_authenticated as get_current_user

router = APIRouter(prefix="/rules", tags=["Categorisation Rules"])


def _get_owned_rule(db: Session, user_id: int, rule_id: int) -> CategoryRule:
    rule = (
        db.query(CategoryRule)
        .options(joinedload(CategoryRule.conditions), joinedload(CategoryRule.category))
        .filter(CategoryRule.id == rule_id, CategoryRule.user_id == user_id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return rule


def _ensure_owned_category(db: Session, user_id: int, category_id: int) -> Category:
    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user_id)
        .first()
    )
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category not found or not owned by you",
        )
    return category


def _to_response(rule: CategoryRule) -> CategoryRuleResponse:
    return CategoryRuleResponse(
        id=rule.id,
        user_id=rule.user_id,
        name=rule.name,
        category_id=rule.category_id,
        category_name=rule.category.name if rule.category else None,
        match_type=rule.match_type,
        priority=rule.priority,
        is_active=rule.is_active,
        stop_on_match=rule.stop_on_match,
        times_applied=rule.times_applied or 0,
        last_applied_at=rule.last_applied_at,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        conditions=rule.conditions or [],
    )


@router.get("", response_model=list[CategoryRuleResponse])
def list_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rules = (
        db.query(CategoryRule)
        .options(joinedload(CategoryRule.conditions), joinedload(CategoryRule.category))
        .filter(CategoryRule.user_id == current_user.id)
        .order_by(CategoryRule.priority.asc(), CategoryRule.id.asc())
        .all()
    )
    return [_to_response(r) for r in rules]


@router.post("", response_model=CategoryRuleResponse, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: CategoryRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_owned_category(db, current_user.id, payload.category_id)

    rule = CategoryRule(
        user_id=current_user.id,
        name=payload.name,
        category_id=payload.category_id,
        match_type=payload.match_type,
        priority=payload.priority,
        is_active=payload.is_active,
        stop_on_match=payload.stop_on_match,
    )
    db.add(rule)
    db.flush()
    for cond in payload.conditions:
        db.add(
            CategoryRuleCondition(
                rule_id=rule.id,
                field=cond.field,
                operator=cond.operator,
                value=cond.value,
                value_to=cond.value_to,
            )
        )
    db.commit()
    db.refresh(rule)

    if payload.apply_to_existing:
        rule_service.apply_to_existing(
            db,
            current_user.id,
            rule=rule,
            include_categorised=payload.include_categorised,
        )
        db.refresh(rule)

    rule = _get_owned_rule(db, current_user.id, rule.id)
    return _to_response(rule)


@router.post("/preview", response_model=RulePreviewResponse)
def preview_rule(
    payload: RulePreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return rule_service.preview(
        db,
        current_user.id,
        match_type=payload.match_type,
        conditions=[c.model_dump() for c in payload.conditions],
        include_categorised=payload.include_categorised,
        sample_size=payload.sample_size,
    )


@router.post("/apply-all", response_model=RuleApplyResponse)
def apply_all_rules(
    payload: RuleApplyRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    include = payload.include_categorised if payload else False
    updated = rule_service.apply_to_existing(
        db, current_user.id, rule=None, include_categorised=include
    )
    return RuleApplyResponse(updated=updated)


@router.post("/reorder")
def reorder_rules(
    payload: RuleReorderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rules = (
        db.query(CategoryRule)
        .filter(
            CategoryRule.user_id == current_user.id,
            CategoryRule.id.in_(payload.rule_ids),
        )
        .all()
    )
    by_id = {r.id: r for r in rules}
    if len(by_id) != len(payload.rule_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more rules were not found",
        )
    for index, rule_id in enumerate(payload.rule_ids):
        by_id[rule_id].priority = (index + 1) * 10
    db.commit()
    return {"message": "Rules reordered", "rule_ids": payload.rule_ids}


@router.post("/{rule_id}/apply", response_model=RuleApplyResponse)
def apply_rule(
    rule_id: int,
    payload: RuleApplyRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Back-propagate one rule onto existing (past) transactions."""
    rule = _get_owned_rule(db, current_user.id, rule_id)
    include = payload.include_categorised if payload else False
    updated = rule_service.apply_to_existing(
        db, current_user.id, rule=rule, include_categorised=include
    )
    return RuleApplyResponse(updated=updated)


@router.put("/{rule_id}", response_model=CategoryRuleResponse)
def update_rule(
    rule_id: int,
    payload: CategoryRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = _get_owned_rule(db, current_user.id, rule_id)
    data = payload.model_dump(exclude_unset=True)
    conditions = data.pop("conditions", None)

    if "category_id" in data and data["category_id"] is not None:
        _ensure_owned_category(db, current_user.id, data["category_id"])

    for key, value in data.items():
        setattr(rule, key, value)

    if conditions is not None:
        rule.conditions.clear()
        db.flush()
        for cond in conditions:
            rule.conditions.append(
                CategoryRuleCondition(
                    field=cond["field"],
                    operator=cond["operator"],
                    value=cond.get("value"),
                    value_to=cond.get("value_to"),
                )
            )

    db.commit()
    rule = _get_owned_rule(db, current_user.id, rule_id)
    return _to_response(rule)


@router.delete("/{rule_id}")
def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = _get_owned_rule(db, current_user.id, rule_id)
    db.delete(rule)
    db.commit()
    return {"message": "Rule deleted successfully"}
