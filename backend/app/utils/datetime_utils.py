from datetime import datetime, timezone


def ensure_utc(value: datetime | None) -> datetime | None:
    """Attach UTC tzinfo to a naive datetime so it serializes with an explicit offset.

    Rows written before sync timestamps switched to `datetime.now(timezone.utc)` are
    naive but were always UTC clock values (`datetime.utcnow()`) — treating a naive
    value as UTC here is correct for both old and new rows and stops clients from
    misparsing an offset-less string as local time.
    """
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)
