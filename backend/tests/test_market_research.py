"""Tests for the market research data layer. yfinance is fully stubbed (no network)."""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from app.services import market_research as mr


@pytest.fixture(autouse=True)
def _fresh_cache():
    mr.clear_cache()
    yield
    mr.clear_cache()


COLS = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"]  # newest first like yfinance


class FakeTicker:
    calls = 0
    info_data: dict = {"shortName": "Acme", "symbol": "ACME", "industry": "Widgets",
                       "industryKey": "widgets", "sector": "Technology", "marketCap": 1000.0,
                       "currency": "USD", "financialCurrency": "USD"}
    news_data: list = []
    raise_on_stmt = False

    def __init__(self, symbol):
        type(self).calls += 1
        self.symbol = symbol

    @property
    def info(self):
        return type(self).info_data

    @property
    def income_stmt(self):
        if type(self).raise_on_stmt:
            raise RuntimeError("secret provider detail")
        return self._income()

    def _income(self):
        idx = ["Total Revenue", "Cost Of Revenue", "Gross Profit", "Operating Income", "Net Income", "Weird Row"]
        data = {
            pd.Timestamp(COLS[0]): [200.0, 80.0, 120.0, 50.0, 30.0, np.nan],
            pd.Timestamp(COLS[1]): [100.0, 40.0, 60.0, 20.0, 10.0, np.nan],
            pd.Timestamp(COLS[2]): [80.0, 40.0, 40.0, 10.0, 5.0, np.nan],
            pd.Timestamp(COLS[3]): [50.0, 20.0, 30.0, 5.0, 2.0, np.nan],
            pd.Timestamp(COLS[4]): [np.nan, 20.0, 20.0, 4.0, 1.0, np.nan],
        }
        return pd.DataFrame(data, index=idx)

    @property
    def cashflow(self):
        idx = ["Operating Cash Flow", "Capital Expenditure"]
        data = {pd.Timestamp(COLS[0]): [60.0, -10.0], pd.Timestamp(COLS[1]): [30.0, -5.0]}
        return pd.DataFrame(data, index=idx)

    @property
    def balance_sheet(self):
        return pd.DataFrame()

    @property
    def earnings_estimate(self):
        return pd.DataFrame(
            {"avg": [1.5, np.nan], "low": [1.0, 1.0], "high": [2.0, 2.0],
             "numberOfAnalysts": [10, 5], "growth": [0.1, 0.2], "yearAgoEps": [1.3, 1.4]},
            index=pd.Index(["0q", "+1q"], name="period"),
        )

    @property
    def revenue_estimate(self):
        return pd.DataFrame(
            {"avg": [1e9], "low": [9e8], "high": [1.1e9], "numberOfAnalysts": [8],
             "growth": [0.05], "yearAgoRevenue": [9.5e8]},
            index=pd.Index(["0y"], name="period"),
        )

    @property
    def growth_estimates(self):
        return pd.DataFrame({"stockTrend": [0.2], "indexTrend": [0.1]}, index=pd.Index(["0y"], name="period"))

    @property
    def analyst_price_targets(self):
        return {"current": 10.0, "low": 8.0, "high": 15.0, "mean": 12.0, "median": float("nan")}

    @property
    def recommendations_summary(self):
        return pd.DataFrame({"period": ["0m"], "strongBuy": [3], "buy": [4], "hold": [1], "sell": [0], "strongSell": [0]})

    @property
    def upgrades_downgrades(self):
        idx = pd.DatetimeIndex([f"2026-01-{d:02d}" for d in range(1, 13)], name="GradeDate")
        return pd.DataFrame(
            {"Firm": [f"F{d}" for d in range(12)], "ToGrade": ["Buy"] * 12,
             "FromGrade": ["Hold"] * 12, "Action": ["up"] * 12},
            index=idx,
        )

    def get_news(self, count=10):
        return type(self).news_data


@pytest.fixture
def fake_ticker(monkeypatch):
    FakeTicker.calls = 0
    FakeTicker.raise_on_stmt = False
    FakeTicker.news_data = []
    monkeypatch.setattr(mr.yf, "Ticker", FakeTicker)
    return FakeTicker


def _assert_json_safe(obj):
    json.dumps(obj, allow_nan=False)


# --- statements ---------------------------------------------------------------

def test_income_statement_lines_and_derived(fake_ticker):
    out = mr.get_financial_statements("acme", "income", "annual", years=4)
    assert out["symbol"] == "ACME" and out["currency"] == "USD"
    # chronological, last 4 of 5 columns
    assert out["columns"] == ["2022-12-31", "2023-12-31", "2024-12-31", "2025-12-31"]
    assert out["rows"]["Total Revenue"] == [50.0, 80.0, 100.0, 200.0]
    assert "Weird Row" not in out["rows"]
    d = out["derived"]
    # growth of the first kept column uses the extra lookback column (revenue NaN there -> None)
    assert d["revenue_growth"] == [None, 0.6, 0.25, 1.0]
    assert d["gross_margin"][-1] == 0.6
    assert d["operating_margin"][-1] == 0.25
    assert d["net_margin"][-1] == 0.15
    assert "fcf" not in d
    _assert_json_safe(out)


def test_nan_becomes_none_and_empty_rows_dropped(fake_ticker):
    out = mr.get_financial_statements("ACME", "income", "annual", years=5)
    assert out["rows"]["Total Revenue"][0] is None
    assert out["derived"]["revenue_growth"][0] is None
    assert out["derived"]["gross_margin"][0] is None
    _assert_json_safe(out)


def test_cashflow_derives_fcf_and_margin(fake_ticker):
    out = mr.get_financial_statements("ACME", "cashflow", "annual", years=2)
    assert out["derived"]["fcf"] == [25.0, 50.0]
    assert out["derived"]["fcf_margin"] == [0.25, 0.25]


def test_empty_statement_returns_error_not_raise(fake_ticker):
    out = mr.get_financial_statements("ACME", "balance", "annual")
    assert "error" in out and out["error"] != mr.UNAVAILABLE["error"]


def test_bad_arguments_return_error(fake_ticker):
    assert "error" in mr.get_financial_statements("ACME", "profit", "annual")
    assert "error" in mr.get_financial_statements("ACME", "income", "weekly")
    assert "error" in mr.get_financial_statements("", "income", "annual")


def test_provider_failure_returns_generic_error(fake_ticker):
    fake_ticker.raise_on_stmt = True
    out = mr.get_financial_statements("ACME", "income", "annual")
    assert out == {"error": "Market data unavailable"}
    assert "secret" not in json.dumps(out)


# --- cache --------------------------------------------------------------------

def test_cache_hit_and_ttl_expiry(fake_ticker, monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr(mr, "_now", lambda: clock["t"])
    mr.get_info("ACME")
    mr.get_info("acme")  # same normalized key
    assert fake_ticker.calls == 1
    clock["t"] += mr.TTL_INFO - 1
    mr.get_info("ACME")
    assert fake_ticker.calls == 1
    clock["t"] += 2
    mr.get_info("ACME")
    assert fake_ticker.calls == 2


def test_errors_are_not_cached(fake_ticker):
    fake_ticker.raise_on_stmt = True
    assert "error" in mr.get_financial_statements("ACME", "income", "annual")
    fake_ticker.raise_on_stmt = False
    assert "rows" in mr.get_financial_statements("ACME", "income", "annual")


def test_clear_cache(fake_ticker):
    mr.get_info("ACME")
    mr.clear_cache()
    mr.get_info("ACME")
    assert fake_ticker.calls == 2


def test_get_info_unknown_symbol(fake_ticker):
    fake_ticker.info_data = {}
    try:
        assert "error" in mr.get_info("NOPE")
    finally:
        FakeTicker.info_data = {"shortName": "Acme", "symbol": "ACME", "industry": "Widgets",
                                "industryKey": "widgets", "sector": "Technology", "marketCap": 1000.0,
                                "currency": "USD", "financialCurrency": "USD"}


# --- estimates ----------------------------------------------------------------

def test_analyst_estimates_shape(fake_ticker):
    out = mr.get_analyst_estimates("ACME")
    assert out["earnings_estimate"]["0q"]["avg"] == 1.5
    assert out["earnings_estimate"]["+1q"]["avg"] is None  # NaN
    assert out["earnings_estimate"]["0q"]["analysts"] == 10
    assert out["revenue_estimate"]["0y"]["avg"] == 1e9
    assert out["growth_estimates"]["0y"] == {"stock": 0.2, "index": 0.1}
    assert out["price_targets"]["mean"] == 12.0 and out["price_targets"]["median"] is None
    assert out["recommendation_trend"][0]["strongBuy"] == 3
    ud = out["upgrades_downgrades"]
    assert len(ud) == 10 and ud[0]["date"] == "2026-01-12" and ud[0]["firm"] == "F11"
    _assert_json_safe(out)


# --- screener -----------------------------------------------------------------

class FakeQuery:
    def __init__(self, op, operands):
        self.op, self.operands = op, operands

    def flat(self):
        if self.op in ("and", "or"):
            return [x for o in self.operands for x in o.flat()]
        return [(self.op, tuple(self.operands))]


@pytest.fixture
def fake_screen(monkeypatch):
    captured: dict = {}
    quotes = [
        {"symbol": "AAA", "longName": "A Corp", "marketCap": 5e9, "regularMarketPrice": 10.0,
         "trailingPE": 12.0, "forwardPE": 10.0, "priceToBook": 1.5, "dividendYield": 3.2,
         "fullExchangeName": "NYSE", "currency": "USD"},
        {"symbol": "BBB", "shortName": "B Corp", "marketCap": 4e9, "regularMarketPrice": 20.0,
         "trailingPE": 30.0, "forwardPE": 40.0, "currency": "USD"},
        {"symbol": "CCC", "shortName": "C Corp", "marketCap": float("nan"), "regularMarketPrice": 5.0,
         "forwardPE": 8.0, "currency": "USD"},
    ]

    def screen(query, size=None, sortField=None, sortAsc=None, **kw):
        captured.update(query=query, size=size, sortField=sortField, sortAsc=sortAsc)
        return {"total": 3, "quotes": quotes}

    monkeypatch.setattr(mr.yf, "EquityQuery", FakeQuery)
    monkeypatch.setattr(mr.yf, "ETFQuery", FakeQuery, raising=False)
    monkeypatch.setattr(mr.yf, "screen", screen)
    return captured


def test_screen_equities_filter_mapping(fake_screen):
    out = mr.screen_equities(
        {
            "region": ["US", "GB"], "exchange": ["nms"], "sector": "financial-services",
            "market_cap_min": 1e9, "pe_max": 15, "pb_max": 2, "eps_growth_min": 10,
            "revenue_growth_min": 5, "dividend_yield_min": 3, "debt_to_equity_max": 100,
            "beta_max": 1.2, "avg_volume_min": 1e5, "price_min": 5,
        },
        sort_by="pe", sort_desc=False, limit=2,
    )
    flat = fake_screen["query"].flat()
    assert ("eq", ("region", "us")) in flat and ("eq", ("region", "gb")) in flat
    assert ("eq", ("exchange", "NMS")) in flat
    assert ("eq", ("sector", "Financial Services")) in flat
    assert ("gte", ("intradaymarketcap", 1e9)) in flat
    assert ("lte", ("peratio.lasttwelvemonths", 15.0)) in flat
    assert ("lte", ("pricebookratio.quarterly", 2.0)) in flat
    assert ("gte", ("epsgrowth.lasttwelvemonths", 10.0)) in flat
    assert ("gte", ("quarterlyrevenuegrowth.quarterly", 5.0)) in flat
    assert ("gte", ("forward_dividend_yield", 3.0)) in flat
    assert ("lte", ("totaldebtequity.lasttwelvemonths", 100.0)) in flat
    assert ("lte", ("beta", 1.2)) in flat
    assert ("gte", ("avgdailyvol3m", 1e5)) in flat
    assert ("gte", ("intradayprice", 5.0)) in flat
    assert fake_screen["sortField"] == "peratio.lasttwelvemonths" and fake_screen["sortAsc"] is True
    assert out["count"] == 2 and out["results"][0]["symbol"] == "AAA"
    assert out["results"][0]["name"] == "A Corp" and out["results"][0]["dividend_yield"] == 3.2
    assert out["results"][1]["market_cap"] == 4e9
    _assert_json_safe(out)


def test_screen_forward_pe_client_side(fake_screen):
    out = mr.screen_equities({"forward_pe_max": 15}, limit=10)
    assert [r["symbol"] for r in out["results"]] == ["AAA", "CCC"]
    assert out["results"][1]["market_cap"] is None  # NaN cleaned
    assert fake_screen["size"] > 10  # over-fetched for client-side filtering


def test_screen_unknown_key_raises_with_allowed_list(fake_screen):
    with pytest.raises(ValueError) as exc:
        mr.screen_equities({"magic": 1})
    msg = str(exc.value)
    assert "magic" in msg and "pe_max" in msg and "market_cap_min" in msg
    with pytest.raises(ValueError):
        mr.screen_equities({}, sort_by="bogus")
    with pytest.raises(ValueError):
        mr.screen_etfs({"pe_max": 3})


def test_screen_empty_filters_and_caching(fake_screen, monkeypatch):
    calls = []
    orig = mr.yf.screen
    monkeypatch.setattr(mr.yf, "screen", lambda *a, **k: calls.append(1) or orig(*a, **k))
    mr.screen_equities({}, limit=5)
    mr.screen_equities({}, limit=5)
    assert len(calls) == 1


def test_screen_etfs_mapping(fake_screen):
    out = mr.screen_etfs({"region": "us", "category": "Technology", "expense_ratio_max": 0.2,
                          "performance_rating_min": 4, "price_min": 10}, limit=5)
    flat = fake_screen["query"].flat()
    assert ("eq", ("region", "us")) in flat
    assert ("eq", ("categoryname", "Technology")) in flat
    assert ("lte", ("annualreportnetexpenseratio", 0.2)) in flat
    assert ("gte", ("performanceratingoverall", 4.0)) in flat
    assert out["count"] == 3 and "expense_ratio" in out["results"][0]


def test_screen_provider_failure(monkeypatch):
    monkeypatch.setattr(mr.yf, "EquityQuery", FakeQuery)

    def boom(*a, **k):
        raise RuntimeError("yahoo says no: token=abc")

    monkeypatch.setattr(mr.yf, "screen", boom)
    assert mr.screen_equities({"pe_max": 10}) == {"error": "Market data unavailable"}


def test_list_sector_keys():
    keys = mr.list_sector_keys()
    assert "technology" in keys and "financial-services" in keys and len(keys) == 11


# --- peers --------------------------------------------------------------------

def test_find_peers_excludes_self_and_prefers_similar_cap(monkeypatch, fake_ticker):
    top = pd.DataFrame(
        {"name": ["Self", "Big", "Near", "Tiny"], "rating": ["Buy"] * 4, "market weight": [0.4, 0.3, 0.2, 0.1]},
        index=pd.Index(["ACME", "BIG", "NEAR", "TINY"], name="symbol"),
    )

    class FakeIndustry:
        def __init__(self, key):
            self.top_companies = top

    caps = {"BIG": 100000.0, "NEAR": 900.0, "TINY": 5.0}

    class FT(FakeTicker):
        @property
        def fast_info(self):
            return {"market_cap": caps[self.symbol], "currency": "USD"}

    monkeypatch.setattr(mr.yf, "Ticker", FT)
    monkeypatch.setattr(mr.yf, "Industry", FakeIndustry)
    out = mr.find_peers("acme", n=2)
    syms = [p["symbol"] for p in out["peers"]]
    assert "ACME" not in syms
    assert syms[0] == "NEAR" and len(syms) == 2
    assert out["industry"] == "Widgets" and out["sector"] == "Technology"
    assert out["peers"][0]["market_cap"] == 900.0


def test_find_peers_unknown_symbol(fake_ticker):
    fake_ticker.info_data = {}
    try:
        assert "error" in mr.find_peers("NOPE")
    finally:
        FakeTicker.info_data = {"shortName": "Acme", "symbol": "ACME", "industry": "Widgets",
                                "industryKey": "widgets", "sector": "Technology", "marketCap": 1000.0,
                                "currency": "USD", "financialCurrency": "USD"}


# --- sector -------------------------------------------------------------------

def test_sector_overview(monkeypatch):
    class FakeSector:
        def __init__(self, key, region="US"):
            self.name = "Technology"
            self.overview = {"companies_count": 10, "market_cap": 1e12, "message_board_id": "x"}
            self.top_companies = pd.DataFrame(
                {"name": ["N"], "rating": ["Buy"], "market weight": [0.2]}, index=pd.Index(["NVDA"], name="symbol"))
            self.top_etfs = {"XLK": "Tech Select"}
            self.industries = pd.DataFrame(
                {"name": ["Semis"], "symbol": ["^X"], "market weight": [0.4]}, index=pd.Index(["semiconductors"], name="key"))

    monkeypatch.setattr(mr.yf, "Sector", FakeSector)
    out = mr.get_sector_overview("Technology")
    assert out["key"] == "technology"
    assert "message_board_id" not in out["overview"]
    assert out["top_companies"][0] == {"symbol": "NVDA", "name": "N", "rating": "Buy", "market_weight": 0.2}
    assert out["top_etfs"] == [{"symbol": "XLK", "name": "Tech Select"}]
    assert out["industries"][0]["key"] == "semiconductors"
    assert "error" in mr.get_sector_overview("not-a-sector")


# --- news ---------------------------------------------------------------------

def _news(title, dt, uuid="1", provider="Reuters"):
    return {"id": uuid, "content": {
        "title": title, "pubDate": dt.strftime("%Y-%m-%dT%H:%M:%SZ"), "summary": "s",
        "provider": {"displayName": provider}, "canonicalUrl": {"url": f"https://x/{uuid}"}}}


def test_news_dedupe_sort_and_window(fake_ticker):
    now = datetime.now(timezone.utc)
    fake_ticker.news_data = [
        _news("Older story", now - timedelta(days=5), "a"),
        _news("Newest story", now - timedelta(days=1), "b"),
        _news("newest  Story", now - timedelta(days=1), "c"),  # duplicate title (case/space)
        _news("Ancient story", now - timedelta(days=90), "d"),  # outside window
        {"id": "e", "content": {}},  # no title
    ]
    out = mr.get_news_digest("ACME", days=30, limit=10)
    titles = [i["title"] for i in out["items"]]
    assert titles == ["Newest story", "Older story"]
    assert out["items"][0]["source"] == "Reuters" and out["items"][0]["url"] == "https://x/b"
    assert out["items"][0]["date"] == (now - timedelta(days=1)).date().isoformat()
    assert len(mr.get_news_digest("ACME", days=30, limit=1)["items"]) == 1
    _assert_json_safe(out)


def test_news_empty(fake_ticker):
    assert mr.get_news_digest("ACME")["items"] == []


# --- clean helper -------------------------------------------------------------

def test_clean_handles_numpy_nan_and_timestamps():
    out = mr._clean({"a": np.float64("nan"), "b": np.int64(3), "c": pd.Timestamp("2024-05-06"),
                     "d": [float("inf"), np.float32(1.5)], "e": pd.NaT})
    assert out == {"a": None, "b": 3, "c": "2024-05-06", "d": [None, 1.5], "e": None}
    assert not math.isnan(mr._num(1.23456, 2))
    assert mr._num("x") is None
