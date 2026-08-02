"""Unit tests for the Yahoo Finance market-data adapter."""

from datetime import datetime
from unittest.mock import MagicMock, patch

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


def test_company_profile_maps_info(yahoo):
    info = {
        "symbol": "AAPL",
        "longName": "Apple Inc.",
        "shortName": "Apple Inc.",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "website": "https://www.apple.com",
        "longBusinessSummary": "Makes devices.",
        "marketCap": 3_000_000_000_000,
        "trailingPE": 30.1,
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
    }
    with patch("app.services.investment_providers.yahoo.yf.Ticker") as ticker_cls:
        ticker_cls.return_value.info = info
        profile = yahoo.get_company_profile("aapl")

    assert profile["symbol"] == "AAPL"
    assert profile["name"] == "Apple Inc."
    assert profile["sector"] == "Technology"
    assert profile["quote_type"] == "stock"
    assert profile["current_price"] == 190.0
    assert profile["day_change_pct"] == pytest.approx(2.70, abs=0.01)
    assert profile["employees"] == 160000


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
