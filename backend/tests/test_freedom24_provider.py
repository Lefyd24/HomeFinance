"""Parsing tests for the Freedom24 adapter, against recorded live responses.

Every payload below is a real response captured from a live Freedom24 account on
2026-07-30, trimmed to the fields the adapter reads. These exist because the
adapter's first version was written from the published docs alone and silently
mis-read almost every one of them — trades came back as "fee" with a zero
amount, ticker search returned nothing, and news 404'd. The point of pinning the
shapes here is that a wrong field name fails a test instead of quietly showing 0.
"""
from datetime import datetime

import pytest

from app.services.investment_providers.freedom24 import Freedom24Provider

# getPositionJson — note acc/pos live under result.ps over HTTP, while the
# published docs show the websocket shape with them at the top level.
POSITION_RESPONSE = {
    "result": {
        "ps": {
            "acc": [
                {"curr": "EUR", "currval": 89.6292, "s": 1.52, "forecast_in": 0, "forecast_out": 0},
                {"curr": "GBP", "currval": 103.937, "s": 0},
                {"curr": "USD", "currval": 78.0308, "s": 200.0},
            ],
            "pos": [
                {
                    "i": "BYLOT.GR",
                    "name": "BALLY'S INTRALOT (CR)",
                    "name2": "BALLY'S INTRALOT (CR)",
                    "curr": "EUR",
                    "currval": 89.6292,
                    "q": 3,
                    "bal_price_a": 0.755,
                    "price_a": 0.755,
                    "mkt_price": 1.11,
                    "close_price": 1.11,
                    "market_value": 3.288,
                    "open_bal": 2.265,
                    "profit_price": 1.102,
                    "face_val_a": 1,
                    "ltr": "ATHEX",
                },
            ],
            "key": "someone@example.com",
        }
    }
}

# getTradesHistory — side in `type` as "1"/"2", amount in `v`, currency in `curr_c`.
TRADES_RESPONSE = {
    "trades": {
        "max_trade_id": [{"@text": "40975888"}],
        "trade": [
            {
                "id": "182800875",
                "p": ".17290000",
                "q": "60.00000000",
                "v": "10.37000000",
                "summ": "10.37000000",
                "date": "2021-10-06T15:57:18.000",
                "instr_nm": "SNH.EU",
                "curr_c": "EUR",
                "type": "1",
                "instr_type_c": "1",
                "commission": "3.20",
                "commission_currency": "EUR",
            },
            {
                "id": "182900001",
                "p": "0.20000000",
                "q": "60.00000000",
                "v": "12.00000000",
                "date": "2022-03-31T10:00:00.000",
                "instr_nm": "SNH.EU",
                "curr_c": "EUR",
                "type": "2",
                "instr_type_c": "1",
                "commission": "0.00",
            },
            {
                "id": "183732558",
                "p": ".86860000",
                "q": "20.72000000",
                "v": "18.00000000",
                "date": "2021-10-08T17:51:27.000",
                "instr_nm": "USD/EUR",
                "curr_c": "EUR",
                "type": "1",
                "instr_type_c": "6",
            },
        ],
    }
}

# tickerFinder — hits under `found`, ticker in `t`, venue in `codesub`.
SEARCH_RESPONSE = {
    "found": [
        {
            "instr_id": "40000019600",
            "nm": "Apple Inc.",
            "n": "Apple Inc.",
            "ln": None,
            "t": "AAPL.US",
            "isin": "US0378331005",
            "type": 1,
            "kind": 1,
            "code_nm": "AAPL",
            "mkt": "FIX",
            "codesub": "NASDAQ",
            "x_curr": "USD",
        },
        {
            "t": "TSLA_BOND.EU",
            "n": "Some Bond",
            "type": 2,
            "kind": 0,
            "mkt": "EU",
            "codesub": None,
            "x_curr": "EUR",
        },
    ],
    "code": 0,
}

# getNewsList — undocumented; `list` rows plus a `total` for paging.
NEWS_RESPONSE = {
    "total": 266474,
    "take": 2,
    "skip": 0,
    "list": [
        {
            "id": 41263957,
            "title": "A tanker carrying cargo for a Chevron subsidiary was attacked",
            "provider": "Oninvest",
            "providerAlias": "Oninvest",
            "lang": "en",
            "date": "2026-07-30 10:36:15",
            "url": "",
            "sentiment": "negative",
            "tickers": ["CVX", "XOM"],
            "images": ["https://freedom24.com/data/images/news-images/40/14551-1.webp"],
        },
        {
            "id": 41264316,
            "title": "Why Intel Stock Just Fell Again",
            "providerAlias": "OninvestCompanyNews",
            "date": "2026-07-30 07:49:36",
            "url": "https://example.com/intel",
            "sentiment": "negative",
            "tickers": ["INTC"],
            "images": [],
        },
    ],
}

NEWS_DETAIL_RESPONSE = {
    "id": 41263957,
    "title": "A tanker carrying cargo for a Chevron subsidiary was attacked",
    "text": "<p>The tanker NISSOS SIFNOS…</p>",
    "providerAlias": "Oninvest",
    "dateTime": "2026-07-30 10:36:15",
    "sentiment": "negative",
    "tickers": ["CVX"],
    "images": [],
    "url": None,
}

QUOTE_ROWS = [
    {"c": "BYLOT.GR", "ltp": 1.109, "pcp": -0.09, "chg": -0.001, "ClosePrice": 1.11},
    {"c": "AAPL.US", "ltp": 339.05, "pcp": 0.26, "chg": 0.87, "ClosePrice": 338.19},
]


class StubClient:
    """Stands in for `tradernet.Tradernet`, returning the recorded payloads."""

    def __init__(self):
        self.calls: list[tuple[str, object]] = []

    def account_summary(self):
        self.calls.append(("getPositionJson", None))
        return POSITION_RESPONSE

    def get_trades_history(self, start=None, end=None):
        self.calls.append(("getTradesHistory", (start, end)))
        return TRADES_RESPONSE

    def find_symbol(self, symbol, exchange=None):
        self.calls.append(("tickerFinder", symbol))
        return SEARCH_RESPONSE

    def export_securities(self, symbols, fields=None):
        self.calls.append(("export", tuple(symbols)))
        return [row for row in QUOTE_ROWS if row["c"] in set(symbols)]

    def get_candles(self, symbol, start=None, end=None, timeframe=86400):
        self.calls.append(("getHloc", (symbol, start, end, timeframe)))
        # Daily bars: hloc is [high, low, open, close]; xSeries is unix seconds.
        return {
            "hloc": {
                "BYLOT.GR": [
                    [1.2, 1.0, 1.05, 1.1],
                    [1.25, 1.05, 1.1, 1.2],
                ]
            },
            "xSeries": {
                "BYLOT.GR": [1722297600, 1722384000],  # 2024-07-30, 2024-07-31 UTC
            },
            "vl": {"BYLOT.GR": [1000, 1100]},
        }

    def authorized_request(self, cmd, params=None, version=3):
        self.calls.append((cmd, params))
        if cmd == "getNewsList":
            return NEWS_RESPONSE
        if cmd == "getNewsDetail":
            return NEWS_DETAIL_RESPONSE
        raise AssertionError(f"unexpected command {cmd}")


@pytest.fixture
def provider(monkeypatch):
    """A provider wired to the stub, with EUR as the account's base currency."""
    monkeypatch.setattr(
        "app.services.investment_providers.freedom24.Tradernet",
        lambda public, private: StubClient(),
    )
    return Freedom24Provider("pub", "priv", base_currency="EUR")


def test_positions_read_cost_basis_market_value_and_return(provider):
    positions = provider.get_positions()
    assert len(positions) == 1
    position = positions[0]

    assert position.symbol == "BYLOT.GR"
    assert position.name == "BALLY'S INTRALOT (CR)"
    assert position.quantity == 3
    assert position.currency == "EUR"
    # bal_price_a, not price_avr/avg_price (which the API never sends).
    assert position.avg_price == 0.755
    assert position.current_price == 1.11
    assert position.market_value == 3.29
    # open_bal, the broker's own book value for the whole position.
    assert position.cost_basis == 2.27
    assert position.exchange == "ATHEX"
    # Quote feed supplies the intraday move.
    assert position.day_change_pct == -0.09
    assert position.previous_close == 1.11


def test_position_cost_basis_falls_back_to_quantity_times_avg_price(provider, monkeypatch):
    """Not every broker row carries open_bal, so the fallback has to hold up."""
    row = dict(POSITION_RESPONSE["result"]["ps"]["pos"][0])
    del row["open_bal"]
    del row["market_value"]
    monkeypatch.setattr(
        provider,
        "_portfolio",
        lambda: {"acc": POSITION_RESPONSE["result"]["ps"]["acc"], "pos": [row]},
    )

    position = provider.get_positions()[0]
    assert position.cost_basis == pytest.approx(2.265, abs=0.01)
    assert position.market_value == pytest.approx(3.33, abs=0.01)


def test_balance_converts_every_currency_into_the_base(provider):
    balance = provider.get_balance()

    assert balance.currency == "EUR"
    # 200 USD at 78.0308/89.6292 EUR-per-USD = 174.13 EUR, plus 1.52 EUR cash.
    assert balance.cash_balance == pytest.approx(175.65, abs=0.05)
    assert balance.cash_by_currency == {"EUR": 1.52, "GBP": 0.0, "USD": 200.0}
    assert balance.positions_value == 3.29
    assert balance.total_value == pytest.approx(178.94, abs=0.05)


def test_balance_falls_back_to_largest_exposure_when_base_is_unquoted():
    """Rather than label a total with a currency it cannot convert into."""

    class NoEurClient(StubClient):
        def account_summary(self):
            return {
                "result": {
                    "ps": {
                        "acc": [{"curr": "USD", "currval": 78.0308, "s": 500.0}],
                        "pos": [],
                    }
                }
            }

    provider = Freedom24Provider.__new__(Freedom24Provider)
    provider.public_key = "pub"
    provider.private_key = "priv"
    provider.base_currency = "JPY"
    provider._client = NoEurClient()
    provider._portfolio_cache = None

    balance = provider.get_balance()
    assert balance.currency == "USD"
    assert balance.cash_balance == 500.0


def test_trades_map_side_amount_and_currency(provider):
    transactions = provider.get_transactions()
    by_id = {t.external_id: t for t in transactions}

    buy = by_id["182800875"]
    # `type` is "1", not "buy" — the original adapter fell through to "fee".
    assert buy.type == "buy"
    assert buy.symbol == "SNH.EU"
    assert buy.quantity == 60.0
    assert buy.price == 0.1729
    # Amount comes from `v`; negative because cash left the account.
    assert buy.amount == -10.37
    assert buy.currency == "EUR"
    assert buy.date == datetime(2021, 10, 6, 15, 57, 18)

    sell = by_id["182900001"]
    assert sell.type == "sell"
    assert sell.amount == 12.00

    # instr_type_c 6 is a currency instrument, not a holding.
    assert by_id["183732558"].type == "fx"


def test_commission_becomes_its_own_fee_transaction(provider):
    transactions = provider.get_transactions()
    fees = [t for t in transactions if t.type == "fee"]

    assert len(fees) == 1
    assert fees[0].external_id == "182800875-fee"
    assert fees[0].amount == -3.20
    assert fees[0].currency == "EUR"
    # A zero commission must not produce a row.
    assert "182900001-fee" not in {t.external_id for t in transactions}


def test_search_reads_the_found_array(provider):
    results = provider.search_symbols("apple")
    assert [r.symbol for r in results] == ["AAPL.US", "TSLA_BOND.EU"]

    apple = results[0]
    assert apple.name == "Apple Inc."
    # `codesub` (the venue) is preferred over `mkt` (the Tradernet market group).
    assert apple.exchange == "NASDAQ"
    assert apple.instrument_type == "stock"
    assert apple.currency == "USD"
    assert apple.isin == "US0378331005"
    assert apple.last_price == 339.05
    assert apple.day_change_pct == 0.26

    # type 2 with no matching kind falls back to the type label.
    assert results[1].instrument_type == "bond"


def test_news_reads_getnewslist_and_pages_with_take_skip(provider):
    page = provider.get_news(limit=2, offset=0, language="en")

    assert page.total == 266474
    assert [item.story_id for item in page.items] == ["41263957", "41264316"]

    first = page.items[0]
    assert first.sentiment == "negative"
    assert first.source == "Oninvest"
    assert first.symbols == ["CVX", "XOM"]
    assert first.image_url.endswith("14551-1.webp")
    assert first.published_at == datetime(2026, 7, 30, 10, 36, 15)
    # The list endpoint carries no body; only get_news_story fetches one.
    assert first.body_html is None

    cmd, params = provider._client.calls[-1]
    assert cmd == "getNewsList"
    assert params == {"take": 2, "skip": 0, "lang": "en"}


def test_news_scopes_by_ticker(provider):
    provider.get_news(symbol="AAPL.US", limit=5)
    _, params = provider._client.calls[-1]
    assert params["ticker"] == "AAPL.US"


def test_news_query_filters_titles_locally(provider):
    """getNewsList has no free-text parameter, so the adapter filters titles."""
    page = provider.get_news(query="intel", limit=10)

    assert [item.title for item in page.items] == ["Why Intel Stock Just Fell Again"]
    assert page.total == 1
    # A wider window is requested so local filtering has something to work with.
    _, params = provider._client.calls[-1]
    assert params["take"] >= 100


def test_news_story_includes_the_article_body(provider):
    story = provider.get_news_story("41263957")

    assert story.story_id == "41263957"
    assert story.body_html == "<p>The tanker NISSOS SIFNOS…</p>"
    assert story.published_at == datetime(2026, 7, 30, 10, 36, 15)

    cmd, params = provider._client.calls[-1]
    assert cmd == "getNewsDetail"
    assert params == {"id": 41263957}


def test_portfolio_response_accepts_the_websocket_shape(monkeypatch):
    """The published docs show acc/pos at the top level; both shapes must parse."""

    class FlatClient(StubClient):
        def account_summary(self):
            return POSITION_RESPONSE["result"]["ps"]

    monkeypatch.setattr(
        "app.services.investment_providers.freedom24.Tradernet",
        lambda public, private: FlatClient(),
    )
    provider = Freedom24Provider("pub", "priv", base_currency="EUR")

    assert provider.get_positions()[0].symbol == "BYLOT.GR"


def test_api_error_is_surfaced_not_swallowed(monkeypatch):
    class ErrorClient(StubClient):
        def account_summary(self):
            return {"errMsg": "Invalid credentials", "code": 12}

    monkeypatch.setattr(
        "app.services.investment_providers.freedom24.Tradernet",
        lambda public, private: ErrorClient(),
    )
    provider = Freedom24Provider("pub", "priv")

    with pytest.raises(ValueError, match="Invalid credentials"):
        provider.get_positions()


def test_quote_failure_does_not_fail_the_sync(provider, monkeypatch):
    """Day change is decoration; losing it must not cost us the positions."""
    monkeypatch.setattr(
        provider, "_quotes", lambda symbols: (_ for _ in ()).throw(RuntimeError("boom"))
    )

    position = provider.get_positions()[0]
    assert position.market_value == 3.29
    assert position.day_change_pct is None


def test_candles_parse_gethloc_hloc_and_xseries(provider):
    from datetime import date

    candles = provider.get_candles("BYLOT.GR", date(2024, 7, 1), date(2024, 8, 1))
    assert len(candles) == 2
    assert candles[0].date == date(2024, 7, 30)
    assert candles[0].high == 1.2
    assert candles[0].low == 1.0
    assert candles[0].open == 1.05
    assert candles[0].close == 1.1
    assert candles[1].close == 1.2

    cmd, args = provider._client.calls[-1]
    assert cmd == "getHloc"
    assert args[0] == "BYLOT.GR"
    assert args[3] == 86400
