"""Translating a broker's ticker into the one Yahoo Finance prices it under.

A holding is identified by whatever its broker calls it, and no two brokers
agree. Freedom24 (TraderNet) suffixes with an ISO-ish country code (`VIO.GR`);
Yahoo suffixes with the specific venue (`VIO.AT`, Athens). Binance names a bare
asset (`BTC`); Yahoo prices crypto against a quote currency (`BTC-USD`). So
before any Yahoo series can be attached to a real position, the ticker has to
be mapped — and, because the mapping is a heuristic, *checked*.

This is the server-side twin of `frontend/app/src/investments/symbolMapping.ts`.
That one only decorates a card with research, so a wrong guess costs nothing
and it never verifies. Here a wrong guess would price someone's holding off
another company's chart, so `resolve_yahoo_symbol` tries each candidate against
the price cache and only returns one that has bars **and** reports the same
currency the broker prices the position in. A ticker that survives neither test
resolves to nothing, and the caller says so rather than drawing a plausible
line off the wrong instrument.
"""
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.services.market_data.errors import MarketDataUnavailable, SymbolNotFound
from app.services.market_data.prices import get_price_history, get_symbol_meta

logger = logging.getLogger("app.investments.symbols")

# Freedom24/TraderNet country suffix -> Yahoo venue suffix. Kept in step with
# the frontend table of the same name; an empty string means Yahoo lists the
# ticker bare. Only the markets this app actually sees — an unlisted suffix is
# tried unchanged rather than guessed at.
FREEDOM24_SUFFIX_TO_YAHOO: dict[str, str] = {
    "US": "",
    "GR": "AT",  # Athens Exchange
    "DE": "DE",  # XETRA
    "UK": "L",  # London Stock Exchange
    "GB": "L",
    "FR": "PA",  # Euronext Paris
    "NL": "AS",  # Euronext Amsterdam
    "IT": "MI",  # Borsa Italiana
    "ES": "MC",  # Bolsa de Madrid
    "CH": "SW",  # SIX Swiss Exchange
    "CA": "TO",  # Toronto Stock Exchange
    "HK": "HK",  # Hong Kong Stock Exchange
    "EU": "",  # Freedom24's catch-all European listing; venue unknown, try bare.
}


def yahoo_candidates(symbol: str, provider: Optional[str]) -> list[str]:
    """Yahoo tickers worth trying for a broker symbol, best guess first.

    More than one, because the heuristic genuinely cannot tell which venue a
    country code means (Freedom24's `.EU` covers several) and because a bare
    ticker is often right when a suffix map is not.
    """
    symbol = (symbol or "").strip().upper()
    if not symbol:
        return []

    if provider == "binance":
        # Binance's stablecoins are treated as cash by its adapter, so anything
        # reaching here is a real crypto asset, which Yahoo quotes against USD.
        return [f"{symbol}-USD"]

    if provider == "freedom24":
        base, _, suffix = symbol.rpartition(".")
        if not base:
            return [symbol]
        mapped = FREEDOM24_SUFFIX_TO_YAHOO.get(suffix)
        candidates = []
        if mapped is not None:
            candidates.append(f"{base}.{mapped}" if mapped else base)
        # The untranslated symbol, then the bare base: between them these cover
        # the suffixes the table doesn't know and the ones Yahoo omits.
        candidates += [symbol, base]
        return list(dict.fromkeys(candidates))

    return [symbol]


@dataclass
class CandidateCheck:
    """One attempted ticker and what became of it — the audit trail the UI shows.

    A mapping the user cannot inspect is a mapping they have to take on trust,
    and this one is a heuristic. `outcome` is a stable key the frontend
    translates: "matched", "no-data" (Yahoo doesn't list it), "currency"
    (listed, but priced in something the broker disagrees with), "error".
    """

    symbol: str
    outcome: str
    currency: Optional[str] = None


@dataclass
class YahooListing:
    """The resolved listing, plus every candidate that was tried to get there."""

    symbol: Optional[str]
    currency: Optional[str]
    checked: list[CandidateCheck]

    @property
    def resolved(self) -> bool:
        return self.symbol is not None


def resolve_yahoo_listing(
    db: Session,
    symbol: str,
    provider: Optional[str],
    *,
    currency: Optional[str] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> YahooListing:
    """`resolve_yahoo_symbol`, but keeping the reasoning for the UI to display."""
    wanted = (currency or "").strip().upper() or None
    window_end = end or date.today()
    window_start = start or (window_end - timedelta(days=365))
    checked: list[CandidateCheck] = []

    for candidate in yahoo_candidates(symbol, provider):
        try:
            get_price_history([candidate], window_start, window_end, db=db)
            meta = get_symbol_meta(db, candidate)
        except (SymbolNotFound, MarketDataUnavailable):
            checked.append(CandidateCheck(candidate, "no-data"))
            continue
        except Exception:  # noqa: BLE001 - a bad candidate must not fail the request
            logger.debug("Yahoo lookup failed for candidate %s", candidate, exc_info=True)
            checked.append(CandidateCheck(candidate, "error"))
            continue

        found = (meta.currency or "").strip().upper() or None
        if wanted and found and found != wanted:
            logger.info(
                "Skipping Yahoo candidate %s for %s: priced in %s, broker reports %s",
                candidate,
                symbol,
                found,
                wanted,
            )
            checked.append(CandidateCheck(candidate, "currency", found))
            continue

        checked.append(CandidateCheck(candidate, "matched", found))
        return YahooListing(symbol=candidate, currency=found, checked=checked)

    return YahooListing(symbol=None, currency=None, checked=checked)


def resolve_yahoo_symbol(
    db: Session,
    symbol: str,
    provider: Optional[str],
    *,
    currency: Optional[str] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> Optional[str]:
    """The Yahoo ticker that actually prices this holding, or None.

    A candidate has to clear two tests. It must return actual price history — a
    symbol Yahoo has never heard of raises `SymbolNotFound` and is simply the
    next candidate's problem. And, when the broker has told us what currency
    the position trades in, Yahoo has to agree: `VIO` alone is a US ticker
    priced in USD while `VIO.AT` is the Athens listing in EUR, and silently
    charting the wrong one is the exact failure this function exists to
    prevent. Yahoo's pence-quoted London listings (GBp against the broker's
    GBP) fail the same check, which is also right — their closes are off by
    a factor of 100.

    Verification is never skipped: a candidate with no bars is not a match,
    whatever the suffix table thinks. Callers that don't care about a
    particular window still get checked, over a recent one.
    """
    return resolve_yahoo_listing(
        db, symbol, provider, currency=currency, start=start, end=end
    ).symbol
