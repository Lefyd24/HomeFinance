import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# The repo-root .env sets DATABASE_URL to an absolute docker path
# (sqlite:////app/data/finance.db) which does not exist on a local dev/CI
# machine. app.config.settings is instantiated at import time, so this must
# be set *before* app.database / main are imported anywhere, otherwise the
# app's module-level `engine` (used directly by the /health endpoint and by
# `init_db()` in main.py's lifespan) will try to open that path and fail.
# This only affects the app's global engine — the isolated per-test `db`
# fixture below uses its own in-memory engine and is unaffected.
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.models import User
from app.utils.security import get_current_user_authenticated, get_current_user
import main


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def seed_user(db):
    user = User(email="test@example.com", hashed_password="x", full_name="Test User", is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def client(db, seed_user):
    def _get_db_override():
        yield db

    def _get_user_override():
        return seed_user

    main.app.dependency_overrides[get_db] = _get_db_override
    # Routers use one of two auth dependencies: reports/accounts/auth/transactions
    # import get_current_user_authenticated; budgets/debts/goals/categories/
    # recurring_expenses/import_wizard/documents/advisor import get_current_user.
    # Override both so any router's endpoints see the seeded user under test.
    main.app.dependency_overrides[get_current_user_authenticated] = _get_user_override
    main.app.dependency_overrides[get_current_user] = _get_user_override
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()
