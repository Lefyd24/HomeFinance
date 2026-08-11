"""Mapping a broker's ticker onto Yahoo's, and refusing to guess when unsure."""
from types import SimpleNamespace

import pytest

from app.services.market_data import broker_symbols
from app.services.market_data.broker_symbols import resolve_yahoo_symbol, yahoo_candidates
from app.services.market_data.errors import SymbolNotFound


@pytest.mark.parametrize(
    "symbol,provider,expected_first",
    [
        ("INUV.US", "freedom24", "INUV"),  # Yahoo lists US tickers bare
        ("VIO.GR", "freedom24", "VIO.AT"),  # Athens
        ("LLOY.UK", "freedom24", "LLOY.L"),  # London
        ("BTC", "binance", "BTC-USD"),  # crypto is quoted against a currency
        ("AAPL", None, "AAPL"),  # no broker, nothing to translate
    ],
)
def test_first_candidate_follows_the_venue_convention(symbol, provider, expected_first):
    assert yahoo_candidates(symbol, provider)[0] == expected_first


def test_unknown_suffix_falls_through_to_the_symbol_and_its_base():
    # `.XX` is in no table, so guessing a venue would be inventing one.
    assert yahoo_candidates("ACME.XX", "freedom24") == ["ACME.XX", "ACME"]


def _patch_lookup(monkeypatch, *, known: dict[str, str | None]):
    """`known` maps a Yahoo ticker to the currency it trades in; absent = unknown to Yahoo."""

    def fake_history(symbols, start, end, *, db, refresh=False):
        for symbol in symbols:
            if symbol not in known:
                raise SymbolNotFound(symbol)
        return {s: object() for s in symbols}

    def fake_meta(db, symbol, *, refresh=False):
        return SimpleNamespace(currency=known.get(symbol))

    monkeypatch.setattr(broker_symbols, "get_price_history", fake_history)
    monkeypatch.setattr(broker_symbols, "get_symbol_meta", fake_meta)


def test_resolves_to_the_listing_whose_currency_matches_the_broker(monkeypatch):
    """`VIO` is a US ticker in USD; `VIO.AT` is the Athens listing the broker holds."""
    _patch_lookup(monkeypatch, known={"VIO.AT": "EUR", "VIO": "USD"})

    assert resolve_yahoo_symbol(None, "VIO.GR", "freedom24", currency="EUR") == "VIO.AT"


def test_rejects_a_same_named_listing_in_the_wrong_currency(monkeypatch):
    """Charting a EUR holding off the USD company of the same name is the failure to avoid."""
    _patch_lookup(monkeypatch, known={"VIO": "USD"})

    assert resolve_yahoo_symbol(None, "VIO.GR", "freedom24", currency="EUR") is None


def test_falls_through_to_the_next_candidate_when_yahoo_has_never_heard_of_one(monkeypatch):
    _patch_lookup(monkeypatch, known={"ACME": "USD"})

    assert resolve_yahoo_symbol(None, "ACME.XX", "freedom24", currency="USD") == "ACME"


def test_accepts_a_match_when_the_broker_reports_no_currency(monkeypatch):
    """Nothing to contradict, so the venue heuristic is allowed to stand."""
    _patch_lookup(monkeypatch, known={"INUV": "USD"})

    assert resolve_yahoo_symbol(None, "INUV.US", "freedom24", currency=None) == "INUV"
