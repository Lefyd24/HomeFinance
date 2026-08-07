from datetime import date, timedelta
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import app.services.comparison_service as comparison_service


def _synthetic_history(symbol: str, n: int = 300, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(end=date.today(), periods=n)
    drift = 0.0004 if symbol != "BENCH" else 0.0003
    rets = rng.normal(drift, 0.01, n)
    prices = 100 * np.cumprod(1 + rets)
    return pd.DataFrame(
        {
            "open": prices,
            "high": prices * 1.01,
            "low": prices * 0.99,
            "close": prices,
            "volume": rng.integers(1000, 5000, n).astype(float),
            "currency": "USD",
        },
        index=idx,
    )


@pytest.fixture(autouse=True)
def _patch_market_layer(monkeypatch):
    seeds = {"AAA": 1, "BBB": 2, "^GSPC": 3}

    def fake_get_price_history(symbols, start, end, *, db, refresh=False):
        return {s: _synthetic_history(s, n=300, seed=seeds.get(s, 42)) for s in symbols}

    def fake_get_symbol_meta(db, symbol, *, refresh=False):
        quote_type = "index" if symbol.startswith("^") else "stock"
        return SimpleNamespace(
            symbol=symbol,
            name=f"{symbol} Inc.",
            quote_type=quote_type,
            currency="USD",
            periods_per_year=252,
            first_bar_date=date.today() - timedelta(days=420),
        )

    def fake_get_risk_free_rate(db, start, end, *, override_annual=None):
        idx = pd.date_range(start, end, freq="D")
        value = override_annual if override_annual is not None else 0.02
        return pd.Series(value, index=idx), ("user_override" if override_annual is not None else "irx")

    def fake_to_currency(prices, from_ccy, to_ccy, db):
        return prices, False

    class FakeTicker:
        def __init__(self, symbol):
            self.info = {}

    monkeypatch.setattr(comparison_service, "get_price_history", fake_get_price_history)
    monkeypatch.setattr(comparison_service, "get_symbol_meta", fake_get_symbol_meta)
    monkeypatch.setattr(comparison_service, "get_risk_free_rate", fake_get_risk_free_rate)
    monkeypatch.setattr(comparison_service, "to_currency", fake_to_currency)
    monkeypatch.setattr(comparison_service.yf, "Ticker", FakeTicker)
    comparison_service._cache.clear()


def test_compare_requires_at_least_two_symbols(client):
    resp = client.get("/api/investments/compare", params={"symbols": "AAA"})
    assert resp.status_code == 400


def test_compare_rejects_too_many_symbols(client):
    resp = client.get("/api/investments/compare", params={"symbols": "A,B,C,D,E,F"})
    assert resp.status_code == 400


def test_compare_basic_two_symbols(client):
    resp = client.get(
        "/api/investments/compare",
        params={"symbols": "AAA,BBB", "period": "1y", "benchmark": "^GSPC"},
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["meta"]["benchmark_symbol"] == "^GSPC"
    # AAA + BBB requested, plus ^GSPC pulled in automatically as the benchmark series.
    assert len(body["instruments"]) == 3
    symbols = {i["symbol"] for i in body["instruments"]}
    assert symbols == {"AAA", "BBB", "^GSPC"}

    benchmark_instrument = next(i for i in body["instruments"] if i["symbol"] == "^GSPC")
    assert benchmark_instrument["is_benchmark"] is True

    for instrument in body["instruments"]:
        if instrument["symbol"] == "^GSPC":
            continue
        assert instrument["risk"]["max_drawdown"] is not None
        assert instrument["performance"]["cagr"] is not None
        # Sharpe requires n>=60; 1y of business days easily clears that.
        assert instrument["risk_adjusted"]["sharpe"] is not None
        assert instrument["vs_benchmark"]["beta"] is not None
        assert instrument["vs_benchmark"]["r_squared"] is not None

    assert "AAA|BBB" in body["pairwise"]["correlation"]
    assert body["head_to_head"] is not None
    assert body["head_to_head"]["verdict_key"] in {
        "clearly_better_risk_adjusted",
        "likely_better",
        "too_close_to_call",
        "likely_worse",
        "clearly_worse_risk_adjusted",
    }
    assert len(body["series"]["normalized"]) > 0
    assert body["series"]["normalized"][0]["AAA"] == pytest.approx(100.0, abs=1e-6)


def test_compare_explicit_benchmark_in_symbols_is_not_duplicated(client):
    resp = client.get(
        "/api/investments/compare",
        params={"symbols": "AAA,^GSPC", "period": "1y", "benchmark": "^GSPC"},
    )
    assert resp.status_code == 200
    body = resp.json()
    symbols = [i["symbol"] for i in body["instruments"]]
    assert symbols.count("^GSPC") == 1


def test_saved_comparisons_crud(client):
    create = client.post(
        "/api/investments/compare/saved",
        json={"name": "My comparison", "symbols": ["aaa", "bbb"], "benchmark": "^GSPC", "period": "1y"},
    )
    assert create.status_code == 201
    created = create.json()
    assert created["symbols"] == ["AAA", "BBB"]

    listed = client.get("/api/investments/compare/saved")
    assert listed.status_code == 200
    assert any(row["id"] == created["id"] for row in listed.json())

    deleted = client.delete(f"/api/investments/compare/saved/{created['id']}")
    assert deleted.status_code == 204

    listed_after = client.get("/api/investments/compare/saved")
    assert all(row["id"] != created["id"] for row in listed_after.json())


def test_benchmarks_list(client):
    resp = client.get("/api/investments/compare/benchmarks")
    assert resp.status_code == 200
    symbols = {b["symbol"] for b in resp.json()}
    assert "^GSPC" in symbols
