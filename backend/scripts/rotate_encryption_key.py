"""Re-encrypt every stored secret with the current encryption key.

Run after changing NOTIFICATION_ENCRYPTION_KEY and listing the old key(s) in
NOTIFICATION_ENCRYPTION_KEY_PREVIOUS. All columns are updated in one
transaction; any failure rolls everything back. Values are never printed.

Usage:
    cd backend
    python scripts/rotate_encryption_key.py --dry-run
    python scripts/rotate_encryption_key.py
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import BankConnection, InvestmentCredential, NotificationSettings  # noqa: E402
from app.utils.crypto import rotate  # noqa: E402

COLUMNS = [
    (BankConnection, "session_id_encrypted"),
    (InvestmentCredential, "encrypted_public_key"),
    (InvestmentCredential, "encrypted_private_key"),
    (NotificationSettings, "smtp_password_encrypted"),
]


def rotate_all(db, dry_run: bool = False) -> dict[str, int]:
    """Rotate every encrypted column; commit on success, roll back on any error."""
    counts: dict[str, int] = {}
    try:
        for model, attr in COLUMNS:
            n = 0
            for row in db.query(model).filter(getattr(model, attr).isnot(None)).all():
                value = getattr(row, attr)
                if not value:
                    continue
                if not dry_run:
                    setattr(row, attr, rotate(value))
                n += 1
            counts[f"{model.__tablename__}.{attr}"] = n
        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="count only, change nothing")
    args = parser.parse_args()

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        counts = rotate_all(db, dry_run=args.dry_run)
    finally:
        db.close()
    verb = "would re-encrypt" if args.dry_run else "re-encrypted"
    for name, n in counts.items():
        print(f"{verb} {n} value(s) in {name}")


if __name__ == "__main__":
    main()
