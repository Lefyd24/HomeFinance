"""Helpers shared by the import preview and confirm endpoints.

Both endpoints work from the rows stored on the ImportBatch at upload time,
never from rows sent back by the client, so what is confirmed is exactly what
was parsed.
"""

import re
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import Transaction

# A file row matches an existing transaction when the amount and direction are
# equal, the dates are at most this far apart (banks post a day late), and one
# description contains the other.
DUPLICATE_DATE_TOLERANCE = timedelta(days=1)
_MIN_CONTAINED_DESCRIPTION = 5


def _normalize_description(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").casefold()).strip()


def batch_rows(parsed_data: list[dict] | None, invert_signs: bool) -> list[dict]:
    rows = []
    for index, raw in enumerate(parsed_data or [], start=1):
        amount = float(raw.get("amount") or 0)
        if invert_signs:
            amount = -amount
        rows.append(
            {
                "row_id": index,
                "line": raw.get("line"),
                # [:10] also reads batches stored before 2026-10 as full datetimes.
                "date": date.fromisoformat(str(raw.get("date", ""))[:10]),
                "description": raw.get("description") or "",
                "amount": amount,
                "abs_amount": abs(amount),
                "type": "income" if amount > 0 else "expense",
            }
        )
    return rows


def _descriptions_match(a: str, b: str) -> bool:
    if a == b:
        return True
    shorter, longer = sorted((a, b), key=len)
    return len(shorter) >= _MIN_CONTAINED_DESCRIPTION and shorter in longer


def find_duplicate_row_ids(db: Session, user_id: int, account_id: int, rows: list[dict]) -> set[int]:
    if not rows:
        return set()
    earliest = min(r["date"] for r in rows) - DUPLICATE_DATE_TOLERANCE
    latest = max(r["date"] for r in rows) + DUPLICATE_DATE_TOLERANCE
    existing = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.account_id == account_id,
            Transaction.date >= earliest,
            Transaction.date <= latest,
        )
        .all()
    )
    by_key: dict[tuple[str, float], list[Transaction]] = defaultdict(list)
    for tx in existing:
        by_key[(tx.type, round(float(tx.amount), 2))].append(tx)

    duplicates: set[int] = set()
    for row in rows:
        description = _normalize_description(row["description"])
        for tx in by_key.get((row["type"], round(row["abs_amount"], 2)), []):
            if abs(tx.date - row["date"]) <= DUPLICATE_DATE_TOLERANCE and _descriptions_match(
                description, _normalize_description(tx.description)
            ):
                duplicates.add(row["row_id"])
                break
    return duplicates
