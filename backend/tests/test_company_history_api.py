"""API tests for GET /investments/company/{symbol}/history."""
from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.services import company_history_service


@pytest.fixture
def patched_prices(monkeypatch):
    rng = np.random.default_rng(7)
    idx = pd.bdate_range(end=date.today(), periods=1500)
    close = pd.Series(100 * np.exp(np.cumsum(rng.normal(0.0004, 0.01, len(idx)))), index=idx)
    frame = pd.DataFrame(
        {
            "open": close * 0.99,
            "high": close * 1.01,
            "low": close * 0.98,
            "close": close,
            "volume": pd.Series(np.full(len(idx), 5000.0), index=idx),
        },
        index=idx,
    )

    def fake_history(symbols, start, end, *, db, refresh=False):
        return {s: frame for s in symbols}

    class _Meta:
        quote_type = "stock"
        currency = "USD"
        periods_per_year = 252

    monkeypatch.setattr(company_history_service, "get_price_history", fake_history)
    monkeypatch.setattr(company_history_service, "get_price_history_raw", fake_history)
    monkeypatch.setattr(
        company_history_service, "get_symbol_meta", lambda db, symbol, refresh=False: _Meta()
    )
    monkeypatch.setattr(
        company_history_service,
        "get_risk_free_rate",
        lambda db, start, end, override_annual=None: (
            pd.Series(0.04, index=pd.date_range(start, end, freq="D")),
            "test",
        ),
    )


def test_history_returns_bars_and_analytics(client, patched_prices):
    response = client.get("/api/investments/company/AAPL/history?period=1y")
    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["period"] == "1y"
    assert body["benchmark_symbol"] == "^GSPC"
    assert len(body["bars"]) > 200
    assert set(body["bars"][0]) >= {"date", "close", "volume", "sma50", "sma200"}
    assert [h["horizon"] for h in body["horizons"]] == ["1y", "3y", "5y"]
    assert len(body["return_histogram"]) == 25
    assert body["return_observations"] > 0


def test_history_defaults_to_1y(client, patched_prices):
    response = client.get("/api/investments/company/AAPL/history")
    assert response.status_code == 200
    assert response.json()["period"] == "1y"


def test_history_rejects_unknown_period(client, patched_prices):
    response = client.get("/api/investments/company/AAPL/history?period=42y")
    assert response.status_code == 422


def test_history_rejects_non_yahoo_provider(client, patched_prices):
    response = client.get("/api/investments/company/AAPL/history?provider=freedom24")
    assert response.status_code == 501
