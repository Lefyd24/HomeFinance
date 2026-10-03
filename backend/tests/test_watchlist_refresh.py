"""GET /api/investments/watchlist: bounded, concurrent, best-effort price refresh."""
import threading
import time
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models import SavedWatch
from app.routers import investments


def _watch(db, user, symbol, price=1.0, age_minutes=60):
    row = SavedWatch(
        user_id=user.id,
        symbol=symbol,
        last_price=price,
        last_updated=datetime.utcnow() - timedelta(minutes=age_minutes),
    )
    db.add(row)
    db.commit()
    return row


def test_stale_prices_are_refreshed_and_fresh_ones_left_alone(client, db, seed_user, monkeypatch):
    _watch(db, seed_user, "AAA", price=1.0, age_minutes=60)
    _watch(db, seed_user, "BBB", price=2.0, age_minutes=1)
    calls = []

    def fake_ticker(symbol):
        calls.append(symbol)
        return SimpleNamespace(fast_info=SimpleNamespace(last_price=99.0))

    monkeypatch.setattr(investments.yf, "Ticker", fake_ticker)

    body = {w["symbol"]: w for w in client.get("/api/investments/watchlist").json()}

    assert calls == ["AAA"]
    assert body["AAA"]["last_price"] == 99.0
    assert body["BBB"]["last_price"] == 2.0


def test_a_failing_symbol_keeps_its_stale_price(client, db, seed_user, monkeypatch):
    _watch(db, seed_user, "BAD", price=5.0)
    _watch(db, seed_user, "OK", price=1.0)

    def fake_ticker(symbol):
        if symbol == "BAD":
            raise RuntimeError("yahoo down")
        return SimpleNamespace(fast_info=SimpleNamespace(last_price=7.0))

    monkeypatch.setattr(investments.yf, "Ticker", fake_ticker)

    body = {w["symbol"]: w["last_price"] for w in client.get("/api/investments/watchlist").json()}

    assert body == {"BAD": 5.0, "OK": 7.0}


def test_hung_lookups_hit_the_overall_deadline(client, db, seed_user, monkeypatch):
    for sym in ("A", "B", "C", "D"):
        _watch(db, seed_user, sym, price=3.0)
    release = threading.Event()

    def hanging_ticker(symbol):
        release.wait(30)
        return SimpleNamespace(fast_info=SimpleNamespace(last_price=1.0))

    monkeypatch.setattr(investments.yf, "Ticker", hanging_ticker)
    monkeypatch.setattr(investments, "_WATCH_REFRESH_TIMEOUT_S", 0.3)

    started = time.monotonic()
    try:
        resp = client.get("/api/investments/watchlist")
        elapsed = time.monotonic() - started
    finally:
        release.set()

    assert resp.status_code == 200
    # Sequential lookups would have blocked ~30s each; concurrency + deadline caps it.
    assert elapsed < 5
    assert {w["last_price"] for w in resp.json()} == {3.0}
