"""Regression: blocking DB work in auth dependencies must not run on the event loop.

When the auth dependencies were `async def`, a request whose auth ran
`pool.connect()` on the loop thread while the pool was exhausted blocked the
whole loop. Connections held by other in-flight requests can only be returned
by `get_db`'s teardown, which needs that same loop, so everything froze until
the pool timeout fired and one request failed with a 500.
"""
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models import User
from app.utils.security import (
    create_access_token,
    get_current_user,
    get_current_user_authenticated,
    require_admin,
)

POOL_TIMEOUT_S = 3
CONCURRENT_REQUESTS = 8


@pytest.fixture()
def pooled_app(tmp_path):
    # A file DB with a real QueuePool; sqlite:// would use SingletonThreadPool.
    engine = create_engine(
        f"sqlite:///{tmp_path / 'pool.db'}",
        connect_args={"check_same_thread": False},
        pool_size=1,
        max_overflow=0,
        pool_timeout=POOL_TIMEOUT_S,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    with session_factory() as s:
        user = User(
            email="pool@example.com",
            hashed_password="x",
            full_name="Pool",
            is_active=True,
            is_admin=True,
        )
        s.add(user)
        s.commit()
        token = create_access_token({"sub": str(user.id)})

    def _get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()

    @app.get("/jwt")
    def jwt_route(user=Depends(get_current_user), db=Depends(get_db)):
        time.sleep(0.05)  # hold the connection long enough for requests to overlap
        db.execute(text("select 1"))
        return {"ok": True}

    @app.get("/either")
    def either_route(user=Depends(get_current_user_authenticated), db=Depends(get_db)):
        time.sleep(0.05)
        db.execute(text("select 1"))
        return {"ok": True}

    @app.get("/admin")
    def admin_route(user=Depends(require_admin), db=Depends(get_db)):
        time.sleep(0.05)
        db.execute(text("select 1"))
        return {"ok": True}

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as client:
        yield client, token
    engine.dispose()


@pytest.mark.parametrize("path", ["/jwt", "/either", "/admin"])
def test_concurrent_authenticated_requests_beyond_pool_size_all_succeed(pooled_app, path):
    client, token = pooled_app
    headers = {"Authorization": f"Bearer {token}"}

    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=CONCURRENT_REQUESTS) as pool:
        responses = list(
            pool.map(lambda _: client.get(path, headers=headers), range(CONCURRENT_REQUESTS))
        )
    elapsed = time.monotonic() - started

    assert [r.status_code for r in responses] == [200] * CONCURRENT_REQUESTS
    # On the old async auth this stalled for the full pool timeout.
    assert elapsed < POOL_TIMEOUT_S
