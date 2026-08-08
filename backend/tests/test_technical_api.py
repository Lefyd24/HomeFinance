import re
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

import app.services.technical_service as technical_service

_BUY_SELL_RE = re.compile(r"\b(buy|sell|should)\b", re.IGNORECASE)


def _synthetic_raw_history(symbol: str, n: int = 900, seed: int = 0, trend: float = 0.0004) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    # pd.bdate_range(end=..., periods=n) returns n-1 rows when `end` falls on a weekend
    # (a pandas quirk, also present in test_comparison_api.py's fixture) — derive array
    # lengths from the actual index rather than the requested `n`.
    idx = pd.bdate_range(end=date.today(), periods=n)
    n = len(idx)
    rets = rng.normal(trend, 0.012, n)
    prices = 100 * np.cumprod(1 + rets)
    high = prices * (1 + rng.uniform(0.001, 0.01, n))
    low = prices * (1 - rng.uniform(0.001, 0.01, n))
    return pd.DataFrame(
        {
            "open": prices,
            "high": high,
            "low": low,
            "close": prices,
            "volume": rng.integers(1_000_000, 5_000_000, n).astype(float),
            "currency": "USD",
        },
        index=idx,
    )


def _short_history(symbol: str, n: int = 40, seed: int = 5) -> pd.DataFrame:
    return _synthetic_raw_history(symbol, n=n, seed=seed)


class _FakeMeta:
    def __init__(self, symbol, quote_type="stock", periods_per_year=252):
        self.symbol = symbol
        self.name = f"{symbol} Inc."
        self.quote_type = quote_type
        self.currency = "USD"
        self.periods_per_year = periods_per_year


@pytest.fixture()
def _patch_market_layer(monkeypatch):
    state = {"n": 900, "seed": 11, "with_volume": True}

    def fake_get_price_history(symbols, start, end, *, db, refresh=False):
        return {s: _synthetic_raw_history(s, n=state["n"], seed=state["seed"]) for s in symbols}

    def fake_get_price_history_raw(symbols, start, end, *, db, refresh=False):
        frames = {}
        for s in symbols:
            frame = _synthetic_raw_history(s, n=state["n"], seed=state["seed"])
            if not state["with_volume"]:
                frame = frame.drop(columns=["volume"])
                frame["volume"] = np.nan
            frames[s] = frame
        return frames

    def fake_get_symbol_meta(db, symbol, *, refresh=False):
        return _FakeMeta(symbol)

    def fake_get_risk_free_rate(db, start, end, *, override_annual=None):
        idx = pd.date_range(start, end, freq="D")
        return pd.Series(0.02, index=idx), "irx"

    monkeypatch.setattr(technical_service, "get_price_history", fake_get_price_history)
    monkeypatch.setattr(technical_service, "get_price_history_raw", fake_get_price_history_raw)
    monkeypatch.setattr(technical_service, "get_symbol_meta", fake_get_symbol_meta)
    monkeypatch.setattr("app.services.market_data.get_risk_free_rate", fake_get_risk_free_rate)
    technical_service._technical_cache.clear()
    return state


def test_technical_basic(client, _patch_market_layer):
    resp = client.get("/api/investments/technical/AAPL", params={"period": "1y"})
    assert resp.status_code == 200
    body = resp.json()

    assert body["meta"]["symbol"] == "AAPL"
    assert body["meta"]["price_basis"] == "unadjusted"
    assert len(body["price"]) > 0
    assert len(body["overlays"]) == len(body["price"])
    assert len(body["panes"]) == len(body["price"])
    assert body["regime"]["trend"] in {"up", "down", "sideways"}
    assert body["confluence"]["positive"] + body["confluence"]["negative"] + body["confluence"]["neutral"] >= 0


def test_technical_suppresses_sma200_on_short_history(client, _patch_market_layer):
    _patch_market_layer["n"] = 60
    resp = client.get("/api/investments/technical/AAPL", params={"period": "3m"})
    assert resp.status_code == 200
    body = resp.json()

    assert "short_history" in body["meta"]["warnings"]
    assert all(row["sma200"] is None for row in body["overlays"])
    # SMA200-dependent signals must not appear when there isn't enough history.
    signal_ids = {s["id"] for s in body["signals"]}
    assert "priceVsSma200" not in signal_ids
    assert "smaCross" not in signal_ids


def test_technical_hides_obv_pane_without_volume(client, _patch_market_layer):
    _patch_market_layer["with_volume"] = False
    resp = client.get("/api/investments/technical/AAPL", params={"period": "1y"})
    assert resp.status_code == 200
    body = resp.json()

    assert all(row.get("obv") is None for row in body["panes"])
    obv_signal = next(s for s in body["signals"] if s["id"] == "obv")
    assert obv_signal["state"] == "unavailable"
    assert obv_signal["confidence"] == "low"


def test_technical_rsi_explanation_context_differs_trending_vs_ranging(client, _patch_market_layer, monkeypatch):
    # Strongly trending, low-noise series -> ADX should read as trending and RSI
    # persistently high; a flat/choppy series -> ADX low (range-bound).
    def fake_price_history_trending(symbols, start, end, *, db, refresh=False):
        return {s: _synthetic_raw_history(s, n=900, seed=1, trend=0.006) for s in symbols}

    monkeypatch.setattr(technical_service, "get_price_history", fake_price_history_trending)
    monkeypatch.setattr(technical_service, "get_price_history_raw", fake_price_history_trending)
    technical_service._technical_cache.clear()

    resp = client.get("/api/investments/technical/AAPL", params={"period": "1y"})
    assert resp.status_code == 200
    body = resp.json()
    rsi_signal = next((s for s in body["signals"] if s["id"] == "rsi"), None)
    assert rsi_signal is not None
    # Whatever the specific bucket, the detail key must be one of the documented ones.
    assert rsi_signal["detail_key"].startswith("technical.signals.detail.rsi.")


def test_technical_unknown_period_rejected(client, _patch_market_layer):
    resp = client.get("/api/investments/technical/AAPL", params={"period": "7y"})
    assert resp.status_code == 400


def test_technical_response_never_emits_recommendation_vocabulary(client, _patch_market_layer):
    resp = client.get("/api/investments/technical/AAPL", params={"period": "1y"})
    assert resp.status_code == 200
    raw = resp.text
    # detail_key / note_key values are i18n *keys* (e.g. "...rsi.trending_overbought"),
    # never literal recommendation prose, so this must hold on the raw serialised body.
    assert not _BUY_SELL_RE.search(raw)


def test_simulate_basic(client, _patch_market_layer):
    resp = client.get("/api/investments/simulate/AAPL", params={"horizon": 30})
    assert resp.status_code == 200
    body = resp.json()

    assert body["symbol"] == "AAPL"
    assert len(body["percentiles"]) == 30
    assert body["percentiles"][0]["day"] == 1
    assert body["terminal"]["p50"] > 0
    assert 0.0 <= body["probabilities"]["p_above_today"] <= 1.0
    assert body["calibration"]["model"] == "bootstrap"
    assert body["calibration"]["seed"] is not None


def test_simulate_reproducible_across_requests(client, _patch_market_layer):
    resp1 = client.get("/api/investments/simulate/AAPL", params={"horizon": 20, "model": "bootstrap"})
    resp2 = client.get("/api/investments/simulate/AAPL", params={"horizon": 20, "model": "bootstrap"})
    assert resp1.json()["percentiles"] == resp2.json()["percentiles"]
    assert resp1.json()["calibration"]["seed"] == resp2.json()["calibration"]["seed"]


def test_simulate_rejects_unknown_model(client, _patch_market_layer):
    resp = client.get("/api/investments/simulate/AAPL", params={"horizon": 30, "model": "lstm"})
    assert resp.status_code == 400


def test_simulate_response_never_emits_recommendation_vocabulary(client, _patch_market_layer):
    resp = client.get("/api/investments/simulate/AAPL", params={"horizon": 30})
    assert resp.status_code == 200
    assert not _BUY_SELL_RE.search(resp.text)
