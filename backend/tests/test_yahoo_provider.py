"""Unit tests for the Yahoo Finance market-data adapter."""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from app.services.investment_providers.yahoo import YahooFinanceMarketData, _story_cache


@pytest.fixture
def yahoo():
    _story_cache.clear()
    return YahooFinanceMarketData()


def test_search_symbols_maps_quotes(yahoo):
    quotes = [
        {
            "symbol": "AAPL",
            "longname": "Apple Inc.",
            "shortname": "Apple Inc.",
            "exchDisp": "NASDAQ",
            "exchange": "NMS",
            "quoteType": "EQUITY",
            "currency": "USD",
        }
    ]
    fast = MagicMock()
    fast.last_price = 190.5
    fast.previous_close = 185.0
    fast.currency = "USD"

    with (
        patch("app.services.investment_providers.yahoo.yf.Search") as search_cls,
        patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls,
    ):
        search_cls.return_value.quotes = quotes
        ticker_cls.return_value.fast_info = fast
        results = yahoo.search_symbols("AAPL")

    assert len(results) == 1
    assert results[0].symbol == "AAPL"
    assert results[0].name == "Apple Inc."
    assert results[0].exchange == "NASDAQ"
    assert results[0].instrument_type == "stock"
    assert results[0].last_price == 190.5
    assert results[0].day_change_pct == pytest.approx(2.97, abs=0.01)


def test_search_news_maps_and_caches_story(yahoo):
    raw = [
        {
            "uuid": "story-1",
            "title": "Apple reports earnings",
            "publisher": "Reuters",
            "link": "https://example.com/a",
            "providerPublishTime": 1_700_000_000,
            "thumbnail": {"resolutions": [{"url": "https://img/a.jpg", "width": 100, "height": 100}]},
            "relatedTickers": ["AAPL"],
            "summary": "Beat expectations.",
        }
    ]
    with patch("app.services.investment_providers.yahoo.yf.Search") as search_cls:
        search_cls.return_value.news = raw
        page = yahoo.get_news(query="Apple", limit=10, offset=0)

    assert page.total == 1
    assert page.items[0].story_id == "story-1"
    assert page.items[0].source == "Reuters"
    assert page.items[0].symbols == ["AAPL"]
    assert isinstance(page.items[0].published_at, datetime)

    story = yahoo.get_news_story("story-1")
    assert story.title == "Apple reports earnings"
    assert story.body_html == "<p>Beat expectations.</p>"


def test_ticker_news_maps_content(yahoo):
    raw = [
        {
            "id": "vid-1",
            "content": {
                "id": "vid-1",
                "title": "Market open",
                "summary": "Futures higher.",
                "description": "<p>Futures higher ahead of open.</p>",
                "pubDate": "2026-07-30T12:00:00Z",
                "provider": {"displayName": "Yahoo Finance"},
                "canonicalUrl": {"url": "https://finance.yahoo.com/video/x"},
                "thumbnail": {"originalUrl": "https://img/v.jpg"},
            },
        }
    ]
    with patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls:
        ticker_cls.return_value.get_news.return_value = raw
        page = yahoo.get_news(symbol="AAPL", limit=5)

    assert page.items[0].story_id == "vid-1"
    assert page.items[0].body_html == "<p>Futures higher ahead of open.</p>"
    assert page.items[0].symbols == ["AAPL"]


def test_get_news_story_missing(yahoo):
    with pytest.raises(LookupError):
        yahoo.get_news_story("missing")


def test_get_company_profile_maps_fields(yahoo):
    info = {
        "symbol": "AAPL",
        "longName": "Apple Inc.",
        "shortName": "Apple",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "currency": "USD",
        "exchange": "NMS",
        "quoteType": "EQUITY",
        "currentPrice": 190.0,
        "previousClose": 185.0,
        "fullTimeEmployees": 160000,
        "city": "Cupertino",
        "country": "United States",
        "recommendationKey": "buy",
        "targetMeanPrice": 220.0,
        # New fundamentals
        "pegRatio": 2.53,
        "priceToSalesTrailing12Months": 9.8,
        "returnOnAssets": 0.27,
        "operatingMargins": 0.326,
        "profitMargins": 0.276,
        "currentRatio": 1.003,
        "quickRatio": 0.812,
        "totalCash": 62_399_000_576,
        "totalDebt": 84_343_996_416,
        "totalRevenue": 466_822_987_776,
        "ebitda": 167_959_003_136,
        "trailingEps": 8.71,
        "forwardEps": 9.51,
        "numberOfAnalystOpinions": 41,
        "firstTradeDateMilliseconds": 345479400000,
    }
    with patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls:
        ticker_cls.return_value.info = info
        ticker_cls.return_value.earnings_history = pd.DataFrame(
            {
                "epsActual": [2.01, 2.02],
                "epsEstimate": [1.94275, 1.89243],
                "surprisePercent": [0.0346, 0.0674],
            },
            index=pd.to_datetime(["2026-03-31", "2026-06-30"]),
        )
        profile = yahoo.get_company_profile("aapl")

    assert profile["symbol"] == "AAPL"
    assert profile["name"] == "Apple Inc."
    assert profile["quote_type"] == "stock"
    assert profile["day_change_pct"] == pytest.approx(2.70, abs=0.01)

    # New fundamentals are mapped.
    assert profile["peg_ratio"] == pytest.approx(2.53)
    assert profile["price_to_sales"] == pytest.approx(9.8)
    assert profile["return_on_assets"] == pytest.approx(0.27)
    assert profile["operating_margin"] == pytest.approx(0.326)
    assert profile["profit_margin"] == pytest.approx(0.276)
    assert profile["current_ratio"] == pytest.approx(1.003)
    assert profile["quick_ratio"] == pytest.approx(0.812)
    assert profile["total_cash"] == pytest.approx(62_399_000_576)
    assert profile["total_debt"] == pytest.approx(84_343_996_416)
    assert profile["total_revenue"] == pytest.approx(466_822_987_776)
    assert profile["ebitda"] == pytest.approx(167_959_003_136)
    assert profile["trailing_eps"] == pytest.approx(8.71)
    assert profile["forward_eps"] == pytest.approx(9.51)
    assert profile["analyst_count"] == 41

    # debt_to_ebitda is derived, not read.
    assert profile["debt_to_ebitda"] == pytest.approx(84_343_996_416 / 167_959_003_136)

    # firstTradeDateMilliseconds -> ISO date string.
    assert profile["first_trade_date"] == "1980-12-12"

    # Earnings surprises, oldest-first, capped at 4.
    assert [e["quarter"] for e in profile["earnings_history"]] == ["2026-03-31", "2026-06-30"]
    assert profile["earnings_history"][1]["eps_actual"] == pytest.approx(2.02)
    assert profile["earnings_history"][1]["surprise_pct"] == pytest.approx(0.0674)

    # Price history and 1y performance are gone — they now live on /company/{symbol}/history.
    assert "price_history" not in profile
    assert "one_year_return" not in profile
    assert "sharpe_1y" not in profile


def test_get_company_profile_survives_missing_optional_data(yahoo):
    """A thin quote (no fundamentals, earnings_history raising) must still return a profile."""
    info = {"symbol": "XYZ", "shortName": "Xyz", "quoteType": "EQUITY", "currentPrice": 10.0}

    class _Boom:
        @property
        def earnings_history(self):
            raise RuntimeError("no earnings data")

    _Boom.info = info

    with patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls:
        ticker_cls.return_value = _Boom()
        profile = yahoo.get_company_profile("xyz")

    assert profile["symbol"] == "XYZ"
    assert profile["peg_ratio"] is None
    assert profile["debt_to_ebitda"] is None
    assert profile["first_trade_date"] is None
    assert profile["earnings_history"] == []


def test_get_company_profile_maps_etf_holdings(yahoo):
    info = {
        "symbol": "VOO",
        "shortName": "Vanguard S&P 500 ETF",
        "quoteType": "ETF",
        "currentPrice": 500.0,
        "totalAssets": 900_000_000_000,
        "category": "Large Blend",
        "annualReportExpenseRatio": 0.0003,
        "yield": 0.012,
    }

    class _FundsData:
        fund_overview = {
            "categoryName": "Large Blend",
            "family": "Vanguard",
            "legalType": "Exchange Traded Fund",
        }
        top_holdings = pd.DataFrame(
            {"Name": ["NVIDIA Corp", "Apple Inc"], "Holding Percent": [0.0749, 0.0657]},
            index=pd.Index(["NVDA", "AAPL"], name="Symbol"),
        )
        sector_weightings = {"technology": 0.386, "financial_services": 0.114}
        asset_classes = {
            "stockPosition": 0.9957,
            "bondPosition": 0.0,
            "cashPosition": 0.0022,
            "preferredPosition": 0.0,
            "otherPosition": 0.002,
        }

    with patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls:
        ticker_cls.return_value.info = info
        ticker_cls.return_value.funds_data = _FundsData()
        ticker_cls.return_value.earnings_history = pd.DataFrame()
        profile = yahoo.get_company_profile("voo")

    assert profile["quote_type"] == "etf"
    assert profile["fund_family"] == "Vanguard"

    assert [h["symbol"] for h in profile["top_holdings"]] == ["NVDA", "AAPL"]
    assert profile["top_holdings"][0]["name"] == "NVIDIA Corp"
    assert profile["top_holdings"][0]["weight"] == pytest.approx(0.0749)

    weights = {w["sector"]: w["weight"] for w in profile["sector_weightings"]}
    assert weights["technology"] == pytest.approx(0.386)
    assert weights["financial_services"] == pytest.approx(0.114)

    assert profile["asset_classes"]["stock"] == pytest.approx(0.9957)
    assert profile["asset_classes"]["bond"] == pytest.approx(0.0)
    assert profile["asset_classes"]["cash"] == pytest.approx(0.0022)


def test_get_company_profile_stock_has_no_fund_holdings(yahoo):
    """A plain stock never calls funds_data — top_holdings etc. stay empty."""
    info = {"symbol": "AAPL", "shortName": "Apple", "quoteType": "EQUITY", "currentPrice": 190.0}

    with patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls:
        ticker_cls.return_value.info = info
        ticker_cls.return_value.earnings_history = pd.DataFrame()
        # No `funds_data` attribute at all — accessing it would raise AttributeError
        # if the stock branch ever touched it, which is exactly what this guards.
        del ticker_cls.return_value.funds_data
        profile = yahoo.get_company_profile("aapl")

    assert profile["fund_family"] is None
    assert profile["top_holdings"] == []
    assert profile["sector_weightings"] == []
    assert profile["asset_classes"] is None


def test_get_company_profile_etf_survives_funds_data_failure(yahoo):
    """funds_data can legitimately raise (delisted/thin ETFs) — profile must still return."""
    info = {"symbol": "THIN", "shortName": "Thin ETF", "quoteType": "ETF", "currentPrice": 10.0}

    class _BoomFunds:
        @property
        def fund_overview(self):
            raise RuntimeError("no fund data")

    with patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls:
        ticker_cls.return_value.info = info
        ticker_cls.return_value.earnings_history = pd.DataFrame()
        ticker_cls.return_value.funds_data = _BoomFunds()
        profile = yahoo.get_company_profile("thin")

    assert profile["symbol"] == "THIN"
    assert profile["fund_family"] is None
    assert profile["top_holdings"] == []


def test_safe_float_rejects_nan_and_inf():
    from app.services.investment_providers.yahoo import _safe_float
    import math

    assert _safe_float(None) is None
    assert _safe_float("x") is None
    assert _safe_float(math.nan) is None
    assert _safe_float(math.inf) is None
    assert _safe_float(-math.inf) is None
    assert _safe_float(12.5) == 12.5


def test_search_symbols_tolerates_nan_quotes(yahoo):
    quotes = [
        {
            "symbol": "INLOT.AT",
            "longname": "Intralot S.A.",
            "exchDisp": "Athens",
            "quoteType": "EQUITY",
        }
    ]
    fast = MagicMock()
    fast.last_price = float("nan")
    fast.previous_close = float("inf")
    fast.currency = "EUR"

    with (
        patch("app.services.investment_providers.yahoo.yf.Search") as search_cls,
        patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls,
    ):
        search_cls.return_value.quotes = quotes
        ticker_cls.return_value.fast_info = fast
        results = yahoo.search_symbols("INTRALOT")

    assert len(results) == 1
    assert results[0].symbol == "INLOT.AT"
    assert results[0].last_price is None
    assert results[0].day_change_pct is None
