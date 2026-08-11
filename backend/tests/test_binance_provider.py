"""Parsing tests for the Binance adapter, against a stub `python-binance` client.

Mirrors the pattern in test_freedom24_provider.py: a stub stands in for the SDK
client so these stay fast and offline, and each test pins one concrete piece of
the adapter's behaviour (stablecoin-as-cash split, BTC-routed pricing for coins
with no direct USDT market, dust filtering, fx conversion to the account's base
currency, and the -1121 "invalid symbol" fallback for markets that don't exist).
"""
from datetime import date, datetime, timezone

import pytest

from binance.exceptions import BinanceAPIException

from app.services.investment_providers.binance import BinanceProvider

ACCOUNT_RESPONSE = {
    "balances": [
        {"asset": "BTC", "free": "0.5", "locked": "0.1"},
        {"asset": "USDT", "free": "100.0", "locked": "0.0"},
        {"asset": "SHIB", "free": "1000000", "locked": "0"},
        {"asset": "ETH", "free": "0.000000001", "locked": "0"},  # dust, filtered out
    ]
}

TICKERS = [
    {"symbol": "BTCUSDT", "price": "60000.0"},
    {"symbol": "SHIBBTC", "price": "0.00000001"},
    {"symbol": "EURUSDT", "price": "1.08"},
]

TICKER_24H = [
    {
        "symbol": "BTCUSDT",
        "priceChange": "500",
        "priceChangePercent": "0.84",
        "prevClosePrice": "59500",
    },
]

TRADES_BTCUSDT = [
    {
        "id": 111,
        "price": "60000.0",
        "qty": "0.1",
        "quoteQty": "6000.0",
        "commission": "0.0001",
        "commissionAsset": "BTC",
        "time": 1722297600000,
        "isBuyer": True,
    },
    {
        "id": 112,
        "price": "61000.0",
        "qty": "0.05",
        "quoteQty": "3050.0",
        "commission": "3.05",
        "commissionAsset": "USDT",
        "time": 1722384000000,
        "isBuyer": False,
    },
]

DEPOSIT_HISTORY = [
    {"id": "d1", "coin": "BTC", "amount": "0.2", "insertTime": 1722297600000},
]

WITHDRAW_HISTORY = [
    {"id": "w1", "coin": "USDT", "amount": "50.0", "applyTime": "2024-07-30 10:00:00"},
]

EXCHANGE_INFO = {
    "symbols": [
        {"symbol": "BTCUSDT", "baseAsset": "BTC", "quoteAsset": "USDT", "status": "TRADING"},
        {"symbol": "ETHUSDT", "baseAsset": "ETH", "quoteAsset": "USDT", "status": "TRADING"},
        {"symbol": "SHIBBTC", "baseAsset": "SHIB", "quoteAsset": "BTC", "status": "TRADING"},
        {"symbol": "OLDCOIN", "baseAsset": "OLD", "quoteAsset": "USDT", "status": "BREAK"},
    ]
}

KLINES_BTCUSDT = [
    [1722297600000, "58000.0", "61000.0", "57000.0", "60000.0", "100"],
    [1722384000000, "60000.0", "62000.0", "59500.0", "61000.0", "80"],
]


def _api_exception(code: int, message: str) -> BinanceAPIException:
    exc = BinanceAPIException.__new__(BinanceAPIException)
    exc.code = code
    exc.message = message
    exc.status_code = 400
    exc.response = None
    exc.request = None
    return exc


class StubClient:
    """Stands in for `binance.Client`."""

    KLINE_INTERVAL_1DAY = "1d"

    def __init__(self, api_key=None, api_secret=None):
        self.calls: list[tuple[str, object]] = []

    def get_account(self):
        self.calls.append(("get_account", None))
        return ACCOUNT_RESPONSE

    def get_all_tickers(self):
        self.calls.append(("get_all_tickers", None))
        return TICKERS

    def get_ticker(self):
        self.calls.append(("get_ticker", None))
        return TICKER_24H

    def get_historical_klines(self, symbol, interval, start_ms, end_ms):
        self.calls.append(("get_historical_klines", (symbol, interval, start_ms, end_ms)))
        if symbol == "OLDUSDT":
            raise _api_exception(-1121, "Invalid symbol.")
        return KLINES_BTCUSDT

    def get_my_trades(self, symbol, fromId=0, limit=1000):
        self.calls.append(("get_my_trades", (symbol, fromId, limit)))
        if symbol == "BTCUSDT":
            return TRADES_BTCUSDT if fromId == 0 else []
        raise _api_exception(-1121, "Invalid symbol.")

    def get_deposit_history(self, startTime=None):
        self.calls.append(("get_deposit_history", startTime))
        return DEPOSIT_HISTORY

    def get_withdraw_history(self, startTime=None):
        self.calls.append(("get_withdraw_history", startTime))
        return WITHDRAW_HISTORY

    def get_exchange_info(self):
        self.calls.append(("get_exchange_info", None))
        return EXCHANGE_INFO


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setattr("app.services.investment_providers.binance.Client", StubClient)
    return BinanceProvider("key", "secret", base_currency="USD")


def test_dust_and_stablecoins_are_excluded_from_positions(provider):
    positions = provider.get_positions()
    symbols = {p.symbol for p in positions}

    assert "USDT" not in symbols  # stablecoin -> cash, not a position
    assert "ETH" not in symbols  # 1e-9 BTC-equivalent dust, filtered
    assert symbols == {"BTC", "SHIB"}


def test_position_priced_directly_against_usdt(provider):
    btc = next(p for p in provider.get_positions() if p.symbol == "BTC")

    assert btc.quantity == pytest.approx(0.6)  # free + locked
    assert btc.currency == "USDT"
    assert btc.current_price == 60000.0
    assert btc.market_value == pytest.approx(36000.0)
    # Weighted-average cost from the full trade replay (see test below) —
    # cost_basis itself is left for the router to derive as avg_price * the
    # real held quantity (0.6), not the smaller trade-implied quantity.
    assert btc.avg_price == pytest.approx(60060.06, abs=0.01)
    assert btc.cost_basis is None


def test_position_priced_via_btc_when_no_direct_usdt_market(provider):
    """SHIB has no SHIBUSDT ticker in the stub — must route through SHIBBTC * BTCUSDT."""
    shib = next(p for p in provider.get_positions() if p.symbol == "SHIB")

    expected_price = 0.00000001 * 60000.0
    assert shib.current_price == pytest.approx(expected_price)
    assert shib.market_value == pytest.approx(1000000 * expected_price)
    # No SHIBUSDT market in the stub -> no trade history -> unknown cost.
    assert shib.avg_price is None


def test_average_cost_is_weighted_across_buys_and_unaffected_by_sells(provider):
    """Mirrors Binance's own "average buy price": a moving average that buys
    blend into and sells draw down from, never move."""
    avg_price = provider._average_cost("BTC")

    # Buy 0.1 BTC (net of a 0.0001 BTC fee) for 6000 USDT -> ~60060.06/unit.
    # The later sell draws down quantity and cost by the same ratio, so the
    # average is unchanged by it.
    assert avg_price == pytest.approx(60060.06, abs=0.01)


def test_average_cost_none_when_trades_fully_exit_the_position(provider, monkeypatch):
    """A weighted-average cost means nothing once the whole position is sold."""
    monkeypatch.setattr(
        provider,
        "_full_trade_history",
        lambda symbol: [
            {"qty": "1.0", "quoteQty": "100.0", "price": "100.0", "isBuyer": True, "time": 1},
            {"qty": "1.0", "quoteQty": "150.0", "price": "150.0", "isBuyer": False, "time": 2},
        ],
    )
    assert provider._average_cost("BTC") is None


def test_full_trade_history_paginates_via_from_id(provider, monkeypatch):
    pages = [
        [{"id": i, "time": i, "qty": "1", "quoteQty": "1", "isBuyer": True} for i in range(1000)],
        [{"id": 1000, "time": 1000, "qty": "1", "quoteQty": "1", "isBuyer": True}],
    ]
    calls: list[int] = []

    def fake_get_my_trades(symbol, fromId=0, limit=1000):
        calls.append(fromId)
        return pages[len(calls) - 1] if len(calls) <= len(pages) else []

    monkeypatch.setattr(provider._client, "get_my_trades", fake_get_my_trades)
    trades = provider._full_trade_history("BTCUSDT")

    assert len(trades) == 1001
    assert calls == [0, 1000]  # second page starts at the last id + 1


def test_day_change_attached_from_24h_ticker(provider):
    btc = next(p for p in provider.get_positions() if p.symbol == "BTC")
    assert btc.day_change_pct == 0.84
    assert btc.previous_close == 59500.0
    # `priceChange` (500.0) is the move of *one* BTC. `day_change` is money —
    # what this 0.6 BTC holding gained — so it is the percentage applied to the
    # position's own value: 36000 - 36000/1.0084.
    assert btc.day_change == pytest.approx(299.88, abs=0.01)


def test_balance_splits_stablecoin_cash_from_positions(provider):
    balance = provider.get_balance()

    assert balance.currency == "USD"
    assert balance.cash_balance == pytest.approx(100.0)
    assert balance.cash_by_currency == {"USDT": 100.0}
    # BTC (0.6 @ 60000) + SHIB (1_000_000 @ 0.0006, routed via SHIBBTC * BTCUSDT)
    assert balance.positions_value == pytest.approx(36000.0 + 600.0, abs=0.01)


def test_balance_converts_to_base_currency_via_eurusdt_pair(monkeypatch):
    monkeypatch.setattr("app.services.investment_providers.binance.Client", StubClient)
    eur_provider = BinanceProvider("key", "secret", base_currency="EUR")

    balance = eur_provider.get_balance()
    assert balance.currency == "EUR"
    # 100 USDT / 1.08 EURUSDT = 92.59 EUR
    assert balance.cash_balance == pytest.approx(92.59, abs=0.01)


def test_trades_map_buyer_seller_amount_sign_and_fee(provider):
    transactions = provider.get_transactions()
    by_id = {t.external_id: t for t in transactions}

    buy = by_id["BTCUSDT-111"]
    assert buy.type == "buy"
    assert buy.symbol == "BTC"
    assert buy.quantity == 0.1
    assert buy.price == 60000.0
    assert buy.amount == pytest.approx(-6000.0)  # cash left the account
    assert buy.currency == "USDT"
    assert buy.date == datetime(2024, 7, 30, 0, 0, tzinfo=timezone.utc)

    sell = by_id["BTCUSDT-112"]
    assert sell.type == "sell"
    assert sell.amount == pytest.approx(3050.0)

    buy_fee = by_id["BTCUSDT-111-fee"]
    assert buy_fee.type == "fee"
    assert buy_fee.currency == "BTC"
    assert buy_fee.amount == pytest.approx(-0.0001)


def test_transactions_include_deposits_and_withdrawals(provider):
    transactions = provider.get_transactions()
    by_id = {t.external_id: t for t in transactions}

    deposit = by_id["deposit-d1"]
    assert deposit.type == "deposit"
    assert deposit.symbol == "BTC"
    assert deposit.amount == pytest.approx(0.2)

    withdrawal = by_id["withdrawal-w1"]
    assert withdrawal.type == "withdrawal"
    assert withdrawal.symbol == "USDT"
    assert withdrawal.amount == pytest.approx(-50.0)


def test_trades_for_symbol_with_no_market_is_skipped_not_fatal(provider, monkeypatch):
    """An asset held with no {asset}USDT market must not fail the whole sync."""
    monkeypatch.setattr(provider, "_balances", lambda: [{"asset": "OLD", "quantity": 5.0}])
    monkeypatch.setattr(provider, "_deposit_history", lambda start_ms: [])
    monkeypatch.setattr(provider, "_withdraw_history", lambda start_ms: [])
    transactions = provider.get_transactions()
    assert transactions == []


def test_candles_parse_klines_into_daily_bars(provider):
    candles = provider.get_candles("BTC", date(2024, 7, 29), date(2024, 8, 1))

    assert len(candles) == 2
    assert candles[0].date == date(2024, 7, 30)
    assert candles[0].open == 58000.0
    assert candles[0].high == 61000.0
    assert candles[0].low == 57000.0
    assert candles[0].close == 60000.0
    assert candles[1].date == date(2024, 7, 31)


def test_candles_invalid_symbol_returns_empty_not_an_error(provider):
    assert provider.get_candles("OLD", date(2024, 7, 1), date(2024, 8, 1)) == []


def test_search_symbols_filters_trading_pairs_by_base_asset(provider):
    results = provider.search_symbols("btc")
    symbols = {r.symbol for r in results}

    assert "BTCUSDT" in symbols
    assert "SHIBBTC" in symbols
    # Not TRADING status must be excluded.
    assert "OLDCOIN" not in symbols

    btcusdt = next(r for r in results if r.symbol == "BTCUSDT")
    assert btcusdt.name == "BTC/USDT"
    assert btcusdt.instrument_type == "crypto"
    assert btcusdt.currency == "USDT"
    assert btcusdt.last_price == 60000.0
