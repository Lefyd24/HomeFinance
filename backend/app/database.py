from sqlalchemy import create_engine, event
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


# Create engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_sqlite_connect_args(settings.DATABASE_URL),
    echo=settings.DEBUG
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
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)