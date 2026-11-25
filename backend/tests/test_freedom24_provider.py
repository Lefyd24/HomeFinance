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
                # 2024-07-30 and 2024-07-31 at midnight Moscow (21:00 UTC the day before).
                "BYLOT.GR": [1722286800, 1722373200],
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
    # Valued at the live last price from the quote feed (1.109 x 3), not the
    # row's overnight `market_value` (3.288), which goes stale during the day.
    assert position.current_price == 1.109
    assert position.market_value == 3.33
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
    assert balance.positions_value == 3.33
    assert balance.total_value == pytest.approx(178.98, abs=0.05)
    # Multipliers into EUR, from the `currval` ratios.
    assert balance.fx_rates["EUR"] == 1.0
    assert balance.fx_rates["USD"] == pytest.approx(78.0308 / 89.6292)


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
    provider._positions_cache = None

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
    # Falls back to the row's overnight valuation.
    assert position.market_value == 3.29
    assert position.current_price == pytest.approx(3.288 / 3)
    assert position.day_change_pct is None


def test_day_change_is_derived_from_prices_when_the_feed_omits_the_pct(provider, monkeypatch):
    """`pcp` alone is trusted today; some venues pin it at 0 while prices moved."""
    monkeypatch.setattr(
        provider,
        "_quotes",
        lambda symbols: {
            # pcp pinned at 0 while the instrument is down: derive, don't fabricate a flat day.
            "BYLOT.GR": {  # (1.109 - 1.11) / 1.11 = -0.09%
                "c": "BYLOT.GR",
                "ltp": 1.109,
                "pcp": 0.0,
                "chg": -0.001,
                "ClosePrice": 1.11,
            },
        },
    )

    positions = {p.symbol: p for p in provider.get_positions()}
    assert positions["BYLOT.GR"].day_change_pct == pytest.approx(-0.09)

    # The same derivation, directly: a row with no pcp whatsoever (0.05/1.20).
    from app.services.investment_providers.freedom24 import _day_change_pct_from_quote

    assert _day_change_pct_from_quote(
        {"ltp": 1.25, "chg": 0.05, "ClosePrice": 1.20}
    ) == pytest.approx(4.17)


def test_day_change_is_zero_when_the_prices_say_flat(provider, monkeypatch):
    """A genuinely flat day derives to a real 0.0 — not to None."""
    monkeypatch.setattr(
        provider,
        "_quotes",
        lambda symbols: {"BYLOT.GR": {"c": "BYLOT.GR", "ltp": 1.11, "ClosePrice": 1.11}},
    )

    assert provider.get_positions()[0].day_change_pct == 0.0


def test_day_change_stays_null_when_nothing_can_derive_it(provider, monkeypatch):
    """No pcp, no previous close, no delta: None beats a fabricated 0.00."""
    row = dict(POSITION_RESPONSE["result"]["ps"]["pos"][0])
    del row["close_price"]
    monkeypatch.setattr(provider, "_portfolio", lambda: {"acc": [], "pos": [row]})
    monkeypatch.setattr(
        provider,
        "_quotes",
        lambda symbols: {"BYLOT.GR": {"c": "BYLOT.GR", "ltp": 1.109}},
    )

    assert provider.get_positions()[0].day_change_pct is None


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


# Recorded live on 2026-11-25 after the ATHEX/EU close. The portfolio rows still
# carry the overnight valuation (MOH.GR 56.65) while the broker app shows the
# live 56.00; the feed reports `chg`/`pcp` 0 for the Greek stocks even though
# ALPHA.GR fell from 4.28 to 4.108, and `ClosePrice` equals `ltp` (today's
# close, not the previous one).
LIVE_POSITIONS = {
    "acc": [
        {"curr": "EUR", "currval": 90.3445, "s": -1.42},
        {"curr": "USD", "currval": 82.1911, "s": 0.39},
    ],
    "pos": [
        {"i": "ALPHA.GR", "curr": "EUR", "currval": 89.8818, "q": 10, "t": 1,
         "bal_price_a": 4.551, "mkt_price": 4.28, "close_price": 4.28,
         "market_value": 42.79, "open_bal": 45.51},
        {"i": "MOH.GR", "curr": "EUR", "currval": 89.8818, "q": 1, "t": 1,
         "bal_price_a": 52.8, "mkt_price": 56.7, "close_price": 56.7,
         "market_value": 56.65, "open_bal": 52.8},
        {"i": "MTLN.EU", "curr": "EUR", "currval": 89.8818, "q": 1, "t": 1,
         "bal_price_a": 45.7, "mkt_price": 41.28, "close_price": 41.28,
         "market_value": 41.2, "open_bal": 45.7},
    ],
}
LIVE_QUOTES = {
    "ALPHA.GR": {"c": "ALPHA.GR", "ltp": 4.108, "chg": 0, "pcp": 0, "ClosePrice": 4.108},
    "MOH.GR": {"c": "MOH.GR", "ltp": 56, "chg": 0, "pcp": 0, "ClosePrice": 56},
    "MTLN.EU": {"c": "MTLN.EU", "ltp": 40.26, "chg": -1.02, "pcp": -2.47, "ClosePrice": 40.26},
}


def test_live_account_matches_the_broker_app(provider, monkeypatch):
    """Value, cost and per-holding return agree with the Freedom24 app's screen."""
    monkeypatch.setattr(provider, "_portfolio", lambda: LIVE_POSITIONS)
    monkeypatch.setattr(provider, "_quotes", lambda symbols: LIVE_QUOTES)

    positions = {p.symbol: p for p in provider.get_positions()}
    assert positions["ALPHA.GR"].market_value == 41.08
    assert positions["MOH.GR"].market_value == 56.00
    assert positions["MTLN.EU"].market_value == 40.26
    # The app: open positions EUR 137.34, all-time -6.67 (-4.63%).
    value = sum(p.market_value for p in positions.values())
    cost = sum(p.cost_basis for p in positions.values())
    assert value == pytest.approx(137.34)
    assert value - cost == pytest.approx(-6.67)

    # The day's move: from the feed for MTLN, from the row's previous close
    # for the Greek stocks whose feed claims a flat day.
    assert positions["MTLN.EU"].day_change_pct == -2.47
    assert positions["MTLN.EU"].previous_close == pytest.approx(41.28)
    assert positions["ALPHA.GR"].day_change_pct == pytest.approx(-4.02)
    assert positions["MOH.GR"].day_change_pct == pytest.approx(-1.23)

    balance = provider.get_balance()
    # -1.42 EUR + 0.39 USD (at 82.1911/90.3445) = -1.07 EUR, overdrawn by fees.
    assert balance.cash_balance == pytest.approx(-1.07)
    assert balance.total_value == pytest.approx(136.27)


def test_fx_conversion_books_both_legs(provider, monkeypatch):
    """EUR/USD sell 47.75 @ 1.1058 = 52.80 USD in, and 47.75 EUR out."""
    monkeypatch.setattr(
        provider._client,
        "get_trades_history",
        lambda start=None, end=None: {
            "trades": {
                "trade": [
                    {"id": "9", "instr_nm": "EUR/USD", "instr_type_c": "6", "type": "2",
                     "q": "47.75000000", "p": "1.10580000", "v": 52.8, "curr_c": "USD",
                     "date": "2026-11-12T12:32:35.960", "commission": "0"},
                    {"id": "10", "instr_nm": "USD/EUR", "instr_type_c": "6", "type": "1",
                     "q": "20.72000000", "p": ".86860000", "v": 18, "curr_c": "EUR",
                     "date": "2021-10-08T17:51:27.000", "commission": "0.00"},
                ]
            }
        },
    )
    by_id = {t.external_id: t for t in provider.get_transactions()}

    assert (by_id["9"].amount, by_id["9"].currency) == (52.8, "USD")
    assert (by_id["9-leg"].amount, by_id["9-leg"].currency) == (-47.75, "EUR")
    assert by_id["9-leg"].type == "fx"
    assert (by_id["10"].amount, by_id["10"].currency) == (-18.0, "EUR")
    assert (by_id["10-leg"].amount, by_id["10-leg"].currency) == (20.72, "USD")
