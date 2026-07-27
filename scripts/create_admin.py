"""One-off bootstrap: create the first admin user directly in the database.

Registration normally requires an invite code, and invite codes can only be
created by an existing admin — so a fresh/empty database has no way to get
its first user through the API. Run this once to create that first user
directly, then use the Admin page in the UI to issue invite codes for
everyone else.

Usage (from the `backend` directory, with the same environment the app runs
with — e.g. inside the Docker container via `docker compose exec app`):

    python /app/scripts/create_admin.py you@example.com 'a-strong-password' "Your Name"

Or bare-metal, from the backend/ dir with the venv active:

    python ../scripts/create_admin.py you@example.com 'a-strong-password' "Your Name"
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.utils.security import get_password_hash  # noqa: E402


def main() -> None:
    if len(sys.argv) < 3:
        print(f"Usage: python {sys.argv[0]} <email> <password> [full_name]")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    password = sys.argv[2]
    full_name = sys.argv[3] if len(sys.argv) > 3 else None

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing is not None:
            print(f"User {email} already exists (id={existing.id}). Aborting.")
            sys.exit(1)

        user = User(
            email=email,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            is_active=True,
            is_admin=True,
            email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created admin user id={user.id} email={user.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
