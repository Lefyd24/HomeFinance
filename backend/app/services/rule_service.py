"""Evaluate categorisation rules against transactions.

Public surface:
  load_rules(db, user_id) -> list[CategoryRule]
  categorise(db, user_id, transaction_like, *, rules=None) -> int | None
  apply_to_existing(db, user_id, rule=None, include_categorised=False) -> int
  preview(db, user_id, rule_payload, *, include_categorised=False, sample_size=5) -> dict
  validate_regex(pattern) -> None  # raises ValueError
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models.category_rule import CategoryRule, CategoryRuleCondition
from app.models.transaction import Transaction

TEXT_FIELDS = frozenset({"description", "counterparty"})
AMOUNT_OPS = frozenset({"eq", "lt", "lte", "gt", "gte", "between"})
TEXT_OPS = frozenset(
    {"contains", "not_contains", "equals", "starts_with", "ends_with", "regex"}
)
ACCOUNT_OPS = frozenset({"eq", "not_eq"})
TYPE_OPS = frozenset({"eq"})

# Nested quantifiers / stacked wildcards that are known to hang naive engines.
_REGEX_DENIED = re.compile(
    r"(\.\*){2,}|(\.\+){2,}"
    r"|(\([^)]*[+*][^)]*\)[+*])"
    r"|(\([^)]*[+*][^)]*\)){2,}"
    r"|(\w+[+*]){4,}"
)


def validate_regex(pattern: str) -> None:
    """Reject empty, invalid, or likely-catastrophic regex patterns."""
    if not pattern or not pattern.strip():
        raise ValueError("Regex pattern must not be empty")
    if len(pattern) > 200:
        raise ValueError("Regex pattern is too long (max 200 characters)")
    if _REGEX_DENIED.search(pattern):
        raise ValueError("Regex pattern looks unsafe and was rejected")
    try:
        re.compile(pattern)
    except re.error as exc:
        raise ValueError(f"Invalid regex: {exc}") from exc

def normalize_text(value: str | None) -> str:
    """Case- and accent-insensitive form for Greek/greeklish bank memos."""
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return stripped.casefold()


def load_rules(db: Session, user_id: int) -> list[CategoryRule]:
    """Active rules for a user, ordered by priority then id."""
    return (
        db.query(CategoryRule)
        .options(joinedload(CategoryRule.conditions))
        .filter(CategoryRule.user_id == user_id, CategoryRule.is_active.is_(True))
        .order_by(CategoryRule.priority.asc(), CategoryRule.id.asc())
        .all()
    )


def _field_value(tx: Any, field: str) -> Any:
    if isinstance(tx, dict):
        if field == "counterparty":
            return tx.get("counterparty") if "counterparty" in tx else tx.get("description")
        return tx.get(field)
    if field == "counterparty":
        value = getattr(tx, "counterparty", None)
        return value if value is not None else getattr(tx, "description", None)
    return getattr(tx, field, None)


def _match_text(operator: str, haystack: str | None, needle: str | None) -> bool:
    left = normalize_text(haystack)
    right = normalize_text(needle)
    if operator == "contains":
        return bool(right) and right in left
    if operator == "not_contains":
        return not right or right not in left
    if operator == "equals":
        return left == right
    if operator == "starts_with":
        return bool(right) and left.startswith(right)
    if operator == "ends_with":
        return bool(right) and left.endswith(right)
    if operator == "regex":
        if not needle:
            return False
        try:
            validate_regex(needle)
            return re.search(needle, haystack or "", flags=re.IGNORECASE) is not None
        except ValueError:
            return False
    return False


def _match_amount(operator: str, amount: Any, value: str | None, value_to: str | None) -> bool:
    try:
        number = abs(float(amount))
        target = float(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return False
    if target is None:
        return False
    if operator == "eq":
        return number == target
    if operator == "lt":
        return number < target
    if operator == "lte":
        return number <= target
    if operator == "gt":
        return number > target
    if operator == "gte":
        return number >= target
    if operator == "between":
        try:
            upper = float(value_to) if value_to is not None and value_to != "" else None
        except (TypeError, ValueError):
            return False
        if upper is None:
            return False
        low, high = (target, upper) if target <= upper else (upper, target)
        return low <= number <= high
    return False


def _match_eq(left: Any, right: str | None) -> bool:
    if right is None:
        return False
    return str(left) == str(right)


def condition_matches(condition: CategoryRuleCondition, tx: Any) -> bool:
    field = condition.field
    op = condition.operator
    value = condition.value
    actual = _field_value(tx, field)

    if field in TEXT_FIELDS:
        if op not in TEXT_OPS:
            return False
        return _match_text(op, None if actual is None else str(actual), value)

    if field == "amount":
        if op not in AMOUNT_OPS:
            return False
        return _match_amount(op, actual, value, condition.value_to)

    if field == "account_id":
        if op not in ACCOUNT_OPS:
            return False
        matched = _match_eq(actual, value)
        return matched if op == "eq" else not matched

    if field == "type":
        if op not in TYPE_OPS:
            return False
        return _match_eq(actual, value)

    return False


def rule_matches(rule: CategoryRule, tx: Any) -> bool:
    conditions = list(rule.conditions or [])
    if not conditions:
        return False
    results = [condition_matches(c, tx) for c in conditions]
    if rule.match_type == "any":
        return any(results)
    return all(results)


def categorise(
    db: Session,
    user_id: int,
    transaction_like: Any,
    *,
    rules: list[CategoryRule] | None = None,
    record_stats: bool = True,
) -> int | None:
    """Return the category_id of the first matching rule, or None.

    Never overwrites an already-set category_id on the transaction-like input.
    Pass record_stats=False for dry-run/preview paths.
    """
    existing = _field_value(transaction_like, "category_id")
    if existing is not None:
        return None

    active_rules = rules if rules is not None else load_rules(db, user_id)
    for rule in active_rules:
        if not rule.is_active:
            continue
        if rule_matches(rule, transaction_like):
            if record_stats:
                _bump_rule_stats(rule, 1)
            return rule.category_id
        # stop_on_match only matters once we have actions beyond categorise;
        # for v1 a non-match always continues, a match always returns.
    return None


def _bump_rule_stats(rule: CategoryRule, count: int) -> None:
    if count <= 0:
        return
    rule.times_applied = (rule.times_applied or 0) + count
    rule.last_applied_at = datetime.utcnow()


def apply_to_existing(
    db: Session,
    user_id: int,
    rule: CategoryRule | None = None,
    *,
    include_categorised: bool = False,
) -> int:
    """Apply rule(s) to existing transactions. Returns how many rows were updated."""
    if rule is not None:
        rules = [rule] if rule.is_active else []
    else:
        rules = load_rules(db, user_id)

    if not rules:
        return 0

    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if not include_categorised:
        query = query.filter(Transaction.category_id.is_(None))

    updated = 0
    # Track per-rule application counts when applying a single rule or all.
    per_rule_counts: dict[int, int] = {r.id: 0 for r in rules}

    for tx in query.order_by(Transaction.id.asc()).all():
        # When include_categorised is False we already filtered; when True we still
        # skip only if we're not allowed — but the plan says opt-in overwrites.
        if not include_categorised and tx.category_id is not None:
            continue

        for r in rules:
            if not r.is_active:
                continue
            if rule_matches(r, tx):
                # Default path: only uncategorised. Opt-in: overwrite.
                if tx.category_id is not None and not include_categorised:
                    break
                if tx.category_id == r.category_id:
                    break
                tx.category_id = r.category_id
                per_rule_counts[r.id] = per_rule_counts.get(r.id, 0) + 1
                updated += 1
                break

    for r in rules:
        _bump_rule_stats(r, per_rule_counts.get(r.id, 0))

    if updated:
        db.commit()
    return updated


def preview(
    db: Session,
    user_id: int,
    *,
    match_type: str,
    conditions: list[dict[str, Any]],
    include_categorised: bool = False,
    sample_size: int = 5,
) -> dict[str, Any]:
    """Dry-run a rule definition against existing transactions."""
    # Build a transient rule object (not persisted) for matching.
    transient = CategoryRule(
        user_id=user_id,
        name="preview",
        category_id=0,
        match_type=match_type or "all",
        priority=0,
        is_active=True,
        stop_on_match=True,
    )
    transient.conditions = [
        CategoryRuleCondition(
            field=c["field"],
            operator=c["operator"],
            value=c.get("value"),
            value_to=c.get("value_to"),
        )
        for c in conditions
    ]

    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if not include_categorised:
        query = query.filter(Transaction.category_id.is_(None))

    matched: list[Transaction] = []
    for tx in query.order_by(Transaction.date.desc(), Transaction.id.desc()).all():
        if rule_matches(transient, tx):
            matched.append(tx)

    sample = matched[: max(0, sample_size)]
    return {
        "match_count": len(matched),
        "sample": [
            {
                "id": tx.id,
                "date": tx.date.isoformat() if tx.date else None,
                "description": tx.description,
                "amount": tx.amount,
                "type": tx.type,
                "category_id": tx.category_id,
                "account_id": tx.account_id,
            }
            for tx in sample
        ],
    }
