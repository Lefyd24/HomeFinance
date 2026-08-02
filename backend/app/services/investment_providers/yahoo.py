"""Yahoo Finance market-data source via the `yfinance` library.

Unlike Freedom24, Yahoo needs no API keys and is not a brokerage sync adapter —
it only powers ticker search, news, and company research. The investments router
selects it when `provider=yahoo`.
"""

from __future__ import annotations

import html
import logging
import math
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Optional

import yfinance as yf

from app.services.investment_providers.base import (
    ProviderNewsItem,
    ProviderNewsPage,
    ProviderSymbol,
)

logger = logging.getLogger(__name__)

_QUOTE_TYPE_MAP = {
    "EQUITY": "stock",
    "ETF": "etf",
    "MUTUALFUND": "mutual_fund",
    "INDEX": "index",
    "FUTURE": "future",
    "CURRENCY": "currency",
    "CRYPTOCURRENCY": "crypto",
    "OPTION": "option",
}

# Stories are only fully known right after a list fetch — Yahoo has no public
# get-by-id for article bodies — so we keep a small process-local cache.
_STORY_CACHE_MAX = 256
_story_cache: OrderedDict[str, ProviderNewsItem] = OrderedDict()
_story_lock = threading.Lock()


def _cache_story(item: ProviderNewsItem) -> None:
    with _story_lock:
        _story_cache[item.story_id] = item
        _story_cache.move_to_end(item.story_id)
        while len(_story_cache) > _STORY_CACHE_MAX:
            _story_cache.popitem(last=False)


def _get_cached_story(story_id: str) -> Optional[ProviderNewsItem]:
    with _story_lock:
        item = _story_cache.get(story_id)
        if item is not None:
            _story_cache.move_to_end(story_id)
        return item


def _parse_unix(ts: Any) -> Optional[datetime]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _parse_iso(value: Any) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _thumb_from_resolutions(thumbnail: Any) -> Optional[str]:
    if not isinstance(thumbnail, dict):
        return None
    if thumbnail.get("originalUrl"):
        return str(thumbnail["originalUrl"])
    resolutions = thumbnail.get("resolutions") or []
    if not resolutions:
        return None
    # Prefer the largest resolution for card imagery.
    best = max(resolutions, key=lambda r: (r.get("width") or 0) * (r.get("height") or 0))
    return best.get("url")


def _normalize_quote_type(quote_type: Optional[str]) -> Optional[str]:
    if not quote_type:
        return None
    return _QUOTE_TYPE_MAP.get(quote_type.upper(), quote_type.lower())


def _safe_float(value: Any) -> Optional[float]:
    """Coerce to a JSON-safe finite float, or None.

    Yahoo's `fast_info` often returns NaN/Inf when a quote is missing; those
    blow up FastAPI's JSON encoder if left as-is.
    """
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


class YahooFinanceMarketData:
    """Market-data-only client. Not registered as a brokerage sync provider."""

    def search_symbols(self, query: str) -> list[ProviderSymbol]:
        trimmed = (query or "").strip()
        if not trimmed:
            return []

        try:
            search = yf.Search(trimmed, max_results=25)
            quotes = search.quotes or []
        except Exception:
            logger.exception("Yahoo symbol search failed for %r", trimmed)
            raise

        results: list[ProviderSymbol] = []
        for quote in quotes:
            symbol = quote.get("symbol")
            if not symbol:
                continue
            results.append(
                ProviderSymbol(
                    symbol=str(symbol),
                    name=quote.get("longname") or quote.get("shortname"),
                    exchange=quote.get("exchDisp") or quote.get("exchange"),
                    instrument_type=_normalize_quote_type(quote.get("quoteType")),
                    currency=quote.get("currency"),
                    isin=quote.get("isin"),
                )
            )

        self._attach_quotes(results[:12])
        return results

    def _attach_quotes(self, symbols: list[ProviderSymbol]) -> None:
        for item in symbols:
            try:
                fast = yf.Ticker(item.symbol).fast_info
                last = _safe_float(getattr(fast, "last_price", None))
                prev = _safe_float(getattr(fast, "previous_close", None)) or _safe_float(
                    getattr(fast, "regular_market_previous_close", None)
                )
                item.last_price = last
                if last is not None and prev not in (None, 0):
                    item.day_change_pct = round((last - prev) / prev * 100, 2)
                if item.currency is None:
                    currency = getattr(fast, "currency", None)
                    if currency:
                        item.currency = str(currency)
            except Exception:  # noqa: BLE001 - quote enrichment is best-effort
                logger.debug("Yahoo quote enrich failed for %s", item.symbol, exc_info=True)

    def get_news(
        self,
        query: str = "",
        symbol: Optional[str] = None,
        limit: int = 30,
        offset: int = 0,
        language: Optional[str] = None,  # noqa: ARG002 - Yahoo feed is locale-driven globally
    ) -> ProviderNewsPage:
        fetch_count = min(max(limit + offset, limit), 100)
        items: list[ProviderNewsItem] = []

        if symbol:
            try:
                raw = yf.Ticker(symbol).get_news(count=fetch_count) or []
            except Exception:
                logger.exception("Yahoo ticker news failed for %s", symbol)
                raise
            items = [self._map_ticker_news(entry, fallback_symbol=symbol) for entry in raw]
            items = [i for i in items if i is not None]
        else:
            search_term = (query or "").strip() or "stock market"
            try:
                raw = yf.Search(search_term, news_count=fetch_count).news or []
            except Exception:
                logger.exception("Yahoo search news failed for %r", search_term)
                raise
            items = [self._map_search_news(entry) for entry in raw]
            items = [i for i in items if i is not None]
            if query.strip():
                needle = query.strip().lower()
                items = [
                    i
                    for i in items
                    if needle in i.title.lower()
                    or any(needle in s.lower() for s in i.symbols)
                    or (i.summary and needle in i.summary.lower())
                ]

        for item in items:
            _cache_story(item)

        page = items[offset : offset + limit]
        return ProviderNewsPage(items=page, total=len(items))

    def get_news_story(self, story_id: str) -> ProviderNewsItem:
        cached = _get_cached_story(story_id)
        if cached is not None:
            # Prefer a body when we only cached a list teaser.
            if cached.body_html:
                return cached
            summary = cached.summary or ""
            body = f"<p>{html.escape(summary)}</p>" if summary else None
            return ProviderNewsItem(
                story_id=cached.story_id,
                title=cached.title,
                summary=cached.summary,
                url=cached.url,
                source=cached.source,
                published_at=cached.published_at,
                sentiment=cached.sentiment,
                image_url=cached.image_url,
                symbols=list(cached.symbols),
                body_html=body,
            )
        raise LookupError(f"News story not found: {story_id}")

    def get_company_profile(self, symbol: str) -> dict[str, Any]:
        trimmed = (symbol or "").strip().upper()
        if not trimmed:
            raise ValueError("Symbol is required")

        ticker = yf.Ticker(trimmed)
        try:
            info = ticker.info or {}
        except Exception:
            logger.exception("Yahoo company info failed for %s", trimmed)
            raise

        if not info or (info.get("quoteType") is None and info.get("symbol") is None and not info.get("shortName")):
            raise LookupError(f"No company data for symbol: {trimmed}")

        price = _safe_float(info.get("currentPrice")) or _safe_float(info.get("regularMarketPrice"))
        change_pct = _safe_float(info.get("regularMarketChangePercent"))
        if change_pct is None:
            prev = _safe_float(info.get("previousClose"))
            if price is not None and prev not in (None, 0):
                change_pct = round((price - prev) / prev * 100, 2)

        return {
            "symbol": str(info.get("symbol") or trimmed),
            "name": info.get("longName") or info.get("shortName"),
            "short_name": info.get("shortName"),
            "exchange": info.get("fullExchangeName") or info.get("exchange"),
            "quote_type": _normalize_quote_type(info.get("quoteType")),
            "currency": info.get("currency"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "website": info.get("website"),
            "summary": info.get("longBusinessSummary"),
            "city": info.get("city"),
            "state": info.get("state"),
            "country": info.get("country"),
            "employees": info.get("fullTimeEmployees"),
            "market_cap": _safe_float(info.get("marketCap")),
            "trailing_pe": _safe_float(info.get("trailingPE")),
            "forward_pe": _safe_float(info.get("forwardPE")),
            "dividend_yield": _safe_float(info.get("dividendYield")),
            "beta": _safe_float(info.get("beta")),
            "fifty_two_week_high": _safe_float(info.get("fiftyTwoWeekHigh")),
            "fifty_two_week_low": _safe_float(info.get("fiftyTwoWeekLow")),
            "previous_close": _safe_float(info.get("previousClose")),
            "open": _safe_float(info.get("open")),
            "day_high": _safe_float(info.get("dayHigh")),
            "day_low": _safe_float(info.get("dayLow")),
            "volume": _safe_float(info.get("volume")),
            "average_volume": _safe_float(info.get("averageVolume")),
            "current_price": price,
            "day_change_pct": change_pct,
            "target_mean_price": _safe_float(info.get("targetMeanPrice")),
            "recommendation": info.get("recommendationKey"),
        }

    def _map_search_news(self, entry: dict[str, Any]) -> Optional[ProviderNewsItem]:
        story_id = entry.get("uuid") or entry.get("id")
        title = entry.get("title")
        if not story_id or not title:
            return None
        return ProviderNewsItem(
            story_id=str(story_id),
            title=str(title),
            summary=entry.get("summary"),
            url=entry.get("link"),
            source=entry.get("publisher"),
            published_at=_parse_unix(entry.get("providerPublishTime")),
            image_url=_thumb_from_resolutions(entry.get("thumbnail")),
            symbols=[str(s) for s in (entry.get("relatedTickers") or []) if s],
            body_html=None,
        )

    def _map_ticker_news(
        self, entry: dict[str, Any], fallback_symbol: Optional[str] = None
    ) -> Optional[ProviderNewsItem]:
        content = entry.get("content") if isinstance(entry.get("content"), dict) else entry
        story_id = entry.get("id") or content.get("id")
        title = content.get("title")
        if not story_id or not title:
            return None

        provider = content.get("provider") or {}
        canonical = content.get("canonicalUrl") or {}
        click = content.get("clickThroughUrl") or {}
        url = canonical.get("url") or click.get("url") or content.get("previewUrl")

        description = content.get("description")
        summary = content.get("summary")
        body_html = description if description and "<" in str(description) else None
        if body_html is None and summary:
            body_html = f"<p>{html.escape(str(summary))}</p>"

        symbols: list[str] = []
        if fallback_symbol:
            symbols.append(fallback_symbol)
        related = entry.get("relatedTickers") or content.get("relatedTickers") or []
        for related_symbol in related:
            if related_symbol and str(related_symbol) not in symbols:
                symbols.append(str(related_symbol))

        return ProviderNewsItem(
            story_id=str(story_id),
            title=str(title),
            summary=str(summary) if summary else None,
            url=str(url) if url else None,
            source=(provider.get("displayName") if isinstance(provider, dict) else None),
            published_at=_parse_iso(content.get("pubDate")),
            image_url=_thumb_from_resolutions(content.get("thumbnail")),
            symbols=symbols,
            body_html=body_html,
        )


# Singleton used by the router — no credentials to manage.
yahoo_market_data = YahooFinanceMarketData()
