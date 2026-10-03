import logging

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config import settings

def _is_sqlite_database_url(url: str) -> bool:
    return "sqlite" in (url or "").lower()


def _sqlite_connect_args(database_url: str) -> dict:
    if not _is_sqlite_database_url(database_url):
        return {}
    # `timeout` sets sqlite3 busy timeout (seconds) which reduces "database is locked" flakiness
    # under concurrent request load.
    return {"check_same_thread": False, "timeout": 30}


def _pool_kwargs(database_url: str) -> dict:
    if not _is_sqlite_database_url(database_url):
        return {}
    # In-memory SQLite (tests) gets a SingletonThreadPool that takes no sizing args.
    if database_url.rstrip("/").lower() in ("sqlite:", "sqlite") or ":memory:" in database_url:
        return {}
    # Defensive headroom, not the fix for pool exhaustion (that was blocking DB
    # calls on the event loop, see utils/security.py). SQLite connections are
    # cheap and WAL allows concurrent readers, so a bigger pool costs little,
    # while a short timeout makes a genuine exhaustion fail fast with a 500
    # instead of stalling the request for 30s.
    return {"pool_size": 20, "max_overflow": 20, "pool_timeout": 10}


# Create engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_sqlite_connect_args(settings.DATABASE_URL),
    echo=settings.DEBUG,
    **_pool_kwargs(settings.DATABASE_URL),
)

# SQLite pragmas for better concurrency characteristics.
if _is_sqlite_database_url(settings.DATABASE_URL):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-redef]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.close()

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Get database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables from the models — but only on a database Alembic isn't
    already managing.

    Once `alembic_version` exists, Alembic owns the schema, and `create_all`
    becomes actively harmful: it happily creates the tables that a *pending*
    migration is about to create itself, without advancing the revision. The
    next `alembic upgrade head` then dies on "table ... already exists" while
    still pointing at the old revision, and — with `restart: unless-stopped` —
    the container wedges in a restart loop.

    A fresh database has no `alembic_version`, so bare-metal dev still gets its
    tables here; the Docker entrypoint stamps head after this runs.
    """
    # Register every model on Base.metadata. The Docker entrypoint calls this
    # having imported only app.database, so without this import the metadata is
    # empty, create_all() silently creates nothing, and the entrypoint then
    # stamps Alembic at head: a "migrated" database with no tables at all.
    import app.models  # noqa: F401

    if inspect(engine).has_table("alembic_version"):
        logging.getLogger("app").debug(
            "Alembic-managed database detected; skipping create_all "
            "(schema changes belong in a migration)."
        )
        return
    Base.metadata.create_all(bind=engine)