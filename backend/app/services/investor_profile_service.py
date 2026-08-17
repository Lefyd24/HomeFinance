"""Read/write access to the investor profile, with validation and revision logging.

Both the REST router and the AI advisor's `update_investor_profile_tool` go
through `apply_updates` here — validation and the revision trail must not have
two implementations, because the agent is the caller that most needs them.

Values reach the DB as text: the scalar fields as themselves, the list/dict
fields JSON-encoded. `to_dict` reverses that, so callers always see real Python
types and never a JSON string.
"""
import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.investor_profile import (
    ALLOCATION_CLASSES,
    EXPERIENCE_LEVELS,
    INCOME_STABILITIES,
    PRIMARY_OBJECTIVES,
    RISK_TOLERANCES,
    InvestorProfile,
    InvestorProfileRevision,
)

logger = logging.getLogger("app")

#: The only fields anything may write. The agent's tool schema is built from
#: this, and `apply_updates` rejects anything outside it regardless of caller —
#: so a model that invents a field name gets an error, not a silent write.
EDITABLE_FIELDS = (
    "risk_tolerance",
    "primary_objective",
    "horizon_years",
    "liquidity_needs_months",
    "target_allocation",
    "max_single_position_pct",
    "excluded_sectors",
    "excluded_symbols",
    "income_stability",
    "experience_level",
    "base_currency",
    "tax_residency",
    "notes",
)

#: Fields stored JSON-encoded in a Text column.
_JSON_FIELDS = ("target_allocation", "excluded_sectors", "excluded_symbols")

_ENUM_FIELDS = {
    "risk_tolerance": RISK_TOLERANCES,
    "primary_objective": PRIMARY_OBJECTIVES,
    "income_stability": INCOME_STABILITIES,
    "experience_level": EXPERIENCE_LEVELS,
}

_INT_RANGES = {
    "horizon_years": (0, 100),
    "liquidity_needs_months": (0, 120),
}

#: A target allocation is allowed to miss 100% by this much before it's rejected —
#: people write "70/20/10" but also "70/25/10", and refusing the second helps nobody.
ALLOCATION_TOLERANCE_PCT = 2.0

#: Advice older than this is asked about again rather than assumed still true.
PROFILE_STALE_DAYS = 183


class ProfileValidationError(ValueError):
    """A rejected update. The message is safe to hand back to the model verbatim."""


def get_profile(db: Session, user_id: int) -> Optional[InvestorProfile]:
    return db.query(InvestorProfile).filter(InvestorProfile.user_id == user_id).first()


def get_or_create_profile(db: Session, user_id: int) -> InvestorProfile:
    profile = get_profile(db, user_id)
    if profile is None:
        profile = InvestorProfile(user_id=user_id, updated_by="user")
        db.add(profile)
        db.flush()
    return profile


def _decode(field: str, raw: Any) -> Any:
    if raw is None:
        return None
    if field in _JSON_FIELDS:
        try:
            return json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            # A hand-edited DB row shouldn't take the whole profile down.
            logger.warning("Investor profile field %s holds unparseable JSON", field)
            return None
    return raw


def _encode(field: str, value: Any) -> Optional[str]:
    if value is None:
        return None
    if field in _JSON_FIELDS:
        return json.dumps(value)
    return value


def _encode_revision(value: Any) -> Optional[str]:
    """Revision values are always JSON, whatever the field's own storage is.

    `old_value`/`new_value` are one pair of Text columns holding every field's
    type, so a plain `str()` would read an int back as "3" and hand the UI — and
    an undo — the wrong type.
    """
    if value is None:
        return None
    return json.dumps(value)


def _decode_revision(raw: Any) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        logger.warning("Investor profile revision holds unparseable JSON")
        return None


def to_dict(profile: Optional[InvestorProfile]) -> dict:
    """Plain-Python view of a profile.

    Always the same shape, whether or not a profile exists — a missing profile
    reads as every field `None`, `is_set: False` and `is_stale: True` (nothing
    known is, by definition, not current), so callers never branch on presence.
    """
    if profile is None:
        return {
            **{field: None for field in EDITABLE_FIELDS},
            "is_set": False,
            "is_stale": True,
            "updated_by": None,
            "updated_at": None,
        }

    data = {field: _decode(field, getattr(profile, field)) for field in EDITABLE_FIELDS}
    data["is_set"] = any(data[field] is not None for field in EDITABLE_FIELDS)
    data["updated_by"] = profile.updated_by
    data["updated_at"] = profile.updated_at.isoformat() if profile.updated_at else None
    data["is_stale"] = is_stale(profile)
    return data


def is_stale(profile: Optional[InvestorProfile]) -> bool:
    if profile is None or profile.updated_at is None:
        return True
    return (datetime.utcnow() - profile.updated_at).days > PROFILE_STALE_DAYS


def _validate(field: str, value: Any) -> Any:
    """Normalise and validate one field. Raises ProfileValidationError."""
    if value is None:
        return None

    if field in _ENUM_FIELDS:
        allowed = _ENUM_FIELDS[field]
        normalized = str(value).strip().lower()
        if normalized not in allowed:
            raise ProfileValidationError(
                f"{field} must be one of {', '.join(allowed)} (got {value!r})"
            )
        return normalized

    if field in _INT_RANGES:
        low, high = _INT_RANGES[field]
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise ProfileValidationError(f"{field} must be a whole number (got {value!r})")
        if not low <= number <= high:
            raise ProfileValidationError(f"{field} must be between {low} and {high} (got {number})")
        return number

    if field == "max_single_position_pct":
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ProfileValidationError(f"{field} must be a number (got {value!r})")
        if not 0 < number <= 100:
            raise ProfileValidationError(f"{field} must be between 0 and 100 (got {number})")
        return round(number, 2)

    if field == "target_allocation":
        if not isinstance(value, dict):
            raise ProfileValidationError(
                "target_allocation must be an object of asset class to percentage, "
                f"e.g. {{\"equity\": 70, \"bond\": 20, \"cash\": 10}} (got {value!r})"
            )
        cleaned: dict[str, float] = {}
        for key, pct in value.items():
            normalized_key = str(key).strip().lower()
            if normalized_key not in ALLOCATION_CLASSES:
                raise ProfileValidationError(
                    f"Unknown asset class {key!r}; allowed: {', '.join(ALLOCATION_CLASSES)}"
                )
            try:
                number = float(pct)
            except (TypeError, ValueError):
                raise ProfileValidationError(f"Allocation for {key!r} must be a number (got {pct!r})")
            if not 0 <= number <= 100:
                raise ProfileValidationError(
                    f"Allocation for {key!r} must be between 0 and 100 (got {number})"
                )
            cleaned[normalized_key] = round(number, 2)
        if not cleaned:
            raise ProfileValidationError("target_allocation must name at least one asset class")
        total = sum(cleaned.values())
        if abs(total - 100.0) > ALLOCATION_TOLERANCE_PCT:
            raise ProfileValidationError(
                f"target_allocation must sum to about 100% (got {round(total, 2)}%)"
            )
        return cleaned

    if field in ("excluded_sectors", "excluded_symbols"):
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            raise ProfileValidationError(f"{field} must be a list of strings (got {value!r})")
        cleaned_list = []
        for item in value:
            text = str(item).strip()
            if not text:
                continue
            if len(text) > 100:
                raise ProfileValidationError(f"{field} entries must be under 100 characters")
            cleaned_list.append(text.upper() if field == "excluded_symbols" else text)
        if len(cleaned_list) > 100:
            raise ProfileValidationError(f"{field} may hold at most 100 entries")
        return cleaned_list

    if field == "base_currency":
        text = str(value).strip().upper()
        if not 3 <= len(text) <= 10:
            raise ProfileValidationError(f"base_currency must be a currency code (got {value!r})")
        return text

    if field == "tax_residency":
        text = str(value).strip().upper()
        if len(text) != 2 or not text.isalpha():
            raise ProfileValidationError(
                f"tax_residency must be a two-letter country code (got {value!r})"
            )
        return text

    if field == "notes":
        text = str(value).strip()
        if len(text) > 4000:
            raise ProfileValidationError("notes must be under 4000 characters")
        return text or None

    raise ProfileValidationError(f"{field} is not an editable field")


def apply_updates(
    db: Session,
    user_id: int,
    updates: dict,
    *,
    source: str = "user",
    reason: Optional[str] = None,
) -> dict:
    """Validate and write `updates`, logging one revision per changed field.

    Returns `{"profile": <dict>, "changes": [...]}`. Raises ProfileValidationError
    on the first bad field, having written nothing — a partially applied profile
    would be worse than a rejected one.
    """
    if source not in ("user", "agent"):
        raise ProfileValidationError("source must be 'user' or 'agent'")

    unknown = [field for field in updates if field not in EDITABLE_FIELDS]
    if unknown:
        raise ProfileValidationError(
            f"Not editable: {', '.join(sorted(unknown))}. "
            f"Editable fields are: {', '.join(EDITABLE_FIELDS)}"
        )

    # Validate everything before touching the row, so a later failure can't
    # leave half the update applied.
    validated = {field: _validate(field, value) for field, value in updates.items()}

    profile = get_or_create_profile(db, user_id)

    changes = []
    for field, new_value in validated.items():
        old_value = _decode(field, getattr(profile, field))
        if old_value == new_value:
            continue

        setattr(profile, field, _encode(field, new_value))
        db.add(
            InvestorProfileRevision(
                profile_id=profile.id,
                field=field,
                old_value=_encode_revision(old_value),
                new_value=_encode_revision(new_value),
                source=source,
                reason=reason,
            )
        )
        changes.append({"field": field, "old_value": old_value, "new_value": new_value})

    if changes:
        profile.updated_by = source
        profile.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(profile)

    return {"profile": to_dict(profile), "changes": changes}


def undo_revision(db: Session, user_id: int, revision_id: int) -> dict:
    """Restore the field this revision changed back to its previous value.

    Recorded as a new revision rather than by deleting the old one — the history
    of what the advisor did stays intact, which is the point of having it.
    """
    revision = (
        db.query(InvestorProfileRevision)
        .join(InvestorProfile, InvestorProfileRevision.profile_id == InvestorProfile.id)
        .filter(
            InvestorProfileRevision.id == revision_id,
            InvestorProfile.user_id == user_id,
        )
        .first()
    )
    if revision is None:
        raise ProfileValidationError("Revision not found")
    if revision.undone_at is not None:
        raise ProfileValidationError("That change has already been undone")

    restored = _decode_revision(revision.old_value)
    result = apply_updates(
        db,
        user_id,
        {revision.field: restored},
        source="user",
        reason=f"Undo of revision {revision_id}",
    )

    revision.undone_at = datetime.utcnow()
    db.commit()

    return result


def list_revisions(db: Session, user_id: int, limit: int = 50) -> list[dict]:
    profile = get_profile(db, user_id)
    if profile is None:
        return []

    rows = (
        db.query(InvestorProfileRevision)
        .filter(InvestorProfileRevision.profile_id == profile.id)
        .order_by(InvestorProfileRevision.created_at.desc(), InvestorProfileRevision.id.desc())
        .limit(max(1, min(int(limit), 200)))
        .all()
    )
    return [
        {
            "id": row.id,
            "field": row.field,
            "old_value": _decode_revision(row.old_value),
            "new_value": _decode_revision(row.new_value),
            "source": row.source,
            "reason": row.reason,
            "undone_at": row.undone_at.isoformat() if row.undone_at else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
