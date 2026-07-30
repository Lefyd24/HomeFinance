"""Freedom24 (Tradernet API) adapter, built on the `tradernet-sdk` PyPI package.

Auth: HMAC-signed requests keyed by a public/private key pair generated at
https://freedom24.com/tradernet-api/auth-api — the `Tradernet` client class
handles the signing, we only issue commands.

Every field name and response shape below was verified against a live account
(2026-07-30), because the published docs are incomplete and the SDK's
convenience wrappers do not all work:

- `getPositionJson` (docs: /tradernet-api/portfolio-get-changes) answers
  `{"result": {"ps": {"acc": [...], "pos": [...]}}}` over HTTP. The docs show the
  *websocket* payload, which has `acc`/`pos` at the top level — both shapes are
  accepted here.
- `getTradesHistory` (docs: /tradernet-api/get-trades-history) answers
  `{"trades": {"trade": [...], "max_trade_id": [...]}}`. Trade side lives in
  `type` as "1"/"2" (not "buy"/"sell"), the cash amount in `v`/`summ`, and the
  currency in `curr_c`.
- `tickerFinder` (docs: /tradernet-api/quotes-finder) answers `{"found": [...]}`
  with the ticker in `t`, names in `n`/`nm`/`ln` and the venue in `codesub`/`mkt`.
- News is **not** `getNews`: that command 404s on API v3 (the version the SDK's
  keypair auth uses) and is unknown to the v1 endpoint too. The working
  commands are `getNewsList` (paged via `take`/`skip`, filtered by `ticker`)
  and `getNewsDetail` (`{"id": ...}`) for a single story's body. Neither is in
  the public docs, so `Tradernet.get_news()` is bypassed entirely.
- Quotes come from `/securities/export` (`Core.export_securities`), a plain GET
  that takes a `fields` whitelist — without it the payload carries large
  probability-distribution arrays per symbol.

Multi-currency: `acc`/`pos` rows carry `currval`, the row currency's rate
against one common base. Ratios of `currval` therefore give exact cross rates
(EUR 89.6292 / USD 78.0308 = 1.1486 EUR/USD), which is how every figure is
converted into the account's own currency. Using the broker's own rates keeps
the app's totals consistent with what the broker shows.
"""
import logging
from datetime import date, datetime
from typing import Any, Optional

from tradernet import Tradernet

from app.services.investment_providers.base import (
    InvestmentProvider,
    ProviderBalance,
    ProviderCandle,
    ProviderNewsItem,
    ProviderNewsPage,
    ProviderPosition,
    ProviderSymbol,
    ProviderTransaction,
)

logger = logging.getLogger("app.investments.freedom24")

# Only the columns we render — /securities/export otherwise returns ~40 fields
# per symbol including long comma-joined probability curves.
QUOTE_FIELDS = ["c", "ltp", "pcp", "chg", "ClosePrice", "name"]

# tickerFinder `type`/`kind` codes, documented at /tradernet-api/quotes-finder.
INSTRUMENT_TYPES: dict[int, str] = {
    1: "stock",
    2: "bond",
    3: "future",
    5: "index",
    6: "currency",
    8: "repo",
    9: "repo",
    10: "repo",
}
INSTRUMENT_KINDS: dict[tuple[int, int], str] = {
    (1, 1): "stock",
    (1, 2): "preferred stock",
    (1, 7): "fund",
    (6, 1): "cash",
    (6, 8): "crypto",
}

# `instr_type_c` on a trade row uses the same type codes as tickerFinder.
CURRENCY_INSTRUMENT_TYPE = 6


def _first(d: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in d and d[key] not in (None, ""):
            return d[key]
    return None


def _as_float(value: Any, default: float = 0.0) -> float:
    """Parse a Tradernet number.

    Amounts arrive as strings like ".17290000"; some quote endpoints have been
    seen to use a comma decimal separator, so both are accepted.
    """
    if isinstance(value, str):
        value = value.strip().replace(",", ".")
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _opt_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    parsed = _as_float(value, default=float("nan"))
    return None if parsed != parsed else parsed  # NaN check


def _parse_datetime(value: Any) -> Optional[datetime]:
    """Parse the several timestamp spellings Tradernet uses.

    Seen in the wild: "2021-10-06T15:57:18.000" (trades),
    "2026-07-30 10:36:15" (news), "30.07.2026" (some reference data).
    """
    if not value:
        return None
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


class Freedom24Provider(InvestmentProvider):
    def __init__(self, public_key: str, private_key: str, base_currency: str = "USD"):
        super().__init__(public_key, private_key, base_currency)
        self._client = Tradernet(public=public_key, private=private_key)
        self._portfolio_cache: Optional[dict[str, Any]] = None

    # ------------------------------------------------------------------ portfolio

    def _portfolio(self) -> dict[str, Any]:
        """`{"acc": [...], "pos": [...]}` from getPositionJson, cached per instance.

        A sync reads balance and positions back to back and both need the same
        snapshot; caching also halves the API calls per sync.
        """
        if self._portfolio_cache is not None:
            return self._portfolio_cache

        response = self._client.account_summary()
        if not isinstance(response, dict):
            raise ValueError("Unexpected response from Freedom24 (getPositionJson)")
        if response.get("errMsg") or response.get("error"):
            raise ValueError(
                f"Freedom24 API error: {response.get('errMsg') or response.get('error')}"
            )

        # HTTP nests under result.ps; the websocket payload documented at
        # /tradernet-api/portfolio-get-changes puts acc/pos at the top level.
        ps = (response.get("result") or {}).get("ps") or response.get("ps") or response
        if not isinstance(ps, dict) or ("acc" not in ps and "pos" not in ps):
            raise ValueError(
                "Unexpected Freedom24 response shape: no acc/pos in getPositionJson"
            )

        self._portfolio_cache = ps
        return ps

    def _fx_rates(self, ps: dict[str, Any]) -> tuple[dict[str, float], str]:
        """(currency -> `currval`, resolved base currency).

        `currval` is each currency's rate against one common base, so
        `currval[a] / currval[b]` is the a→b cross rate. The requested base
        currency is honoured when the broker reports a rate for it; otherwise we
        fall back to the currency holding the most value, rather than emitting
        numbers labelled with a currency we cannot actually convert into.
        """
        rates: dict[str, float] = {}
        exposure: dict[str, float] = {}

        for row in (ps.get("acc") or []) + (ps.get("pos") or []):
            if not isinstance(row, dict):
                continue
            currency = _first(row, "curr", "base_currency")
            if not currency:
                continue
            currency = str(currency).upper()
            rate = _opt_float(row.get("currval"))
            if rate and rate > 0:
                rates.setdefault(currency, rate)
            exposure[currency] = exposure.get(currency, 0.0) + abs(
                _as_float(_first(row, "market_value", "s"))
            )

        base = self.base_currency
        if base not in rates and exposure:
            fallback = max(exposure, key=lambda c: exposure[c])
            if fallback != base:
                logger.info(
                    "Freedom24 reports no rate for %s; reporting totals in %s instead",
                    base,
                    fallback,
                )
                base = fallback
        return rates, base

    @staticmethod
    def _convert(
        amount: float, currency: str, base: str, rates: dict[str, float]
    ) -> tuple[float, float]:
        """(amount in `base`, fx rate used). Rate is 1.0 when no conversion is possible."""
        currency = (currency or base).upper()
        if currency == base:
            return amount, 1.0
        from_rate = rates.get(currency)
        to_rate = rates.get(base)
        if not from_rate or not to_rate:
            return amount, 1.0
        rate = from_rate / to_rate
        return amount * rate, rate

    def get_balance(self) -> ProviderBalance:
        ps = self._portfolio()
        rates, base = self._fx_rates(ps)

        cash_by_currency: dict[str, float] = {}
        cash_base = 0.0
        for row in ps.get("acc") or []:
            if not isinstance(row, dict):
                continue
            currency = str(_first(row, "curr") or base).upper()
            # `s` is the available funds on that currency sub-account.
            amount = _as_float(row.get("s"))
            cash_by_currency[currency] = cash_by_currency.get(currency, 0.0) + amount
            converted, _ = self._convert(amount, currency, base, rates)
            cash_base += converted

        positions_value = sum(
            p.market_value_base if p.market_value_base is not None else p.market_value
            for p in self.get_positions()
        )

        return ProviderBalance(
            total_value=round(cash_base + positions_value, 2),
            cash_balance=round(cash_base, 2),
            currency=base,
            positions_value=round(positions_value, 2),
            cash_by_currency={c: round(v, 2) for c, v in cash_by_currency.items()},
        )

    def get_positions(self) -> list[ProviderPosition]:
        ps = self._portfolio()
        rates, base = self._fx_rates(ps)

        pos_rows = ps.get("pos") or []
        if not isinstance(pos_rows, list):
            raise ValueError("Unexpected Freedom24 response shape: pos is not a list")

        positions: list[ProviderPosition] = []
        for row in pos_rows:
            if not isinstance(row, dict):
                continue
            symbol = _first(row, "i", "base_contract_code")
            if not symbol:
                continue

            quantity = _as_float(row.get("q"))
            currency = str(_first(row, "curr", "base_currency") or base).upper()
            # `bal_price_a` is the position's book value per unit; `price_a` is
            # the book value at the time it was opened.
            avg_price = _opt_float(_first(row, "bal_price_a", "price_a"))
            current_price = _opt_float(_first(row, "mkt_price", "close_price"))

            market_value = _opt_float(row.get("market_value"))
            if market_value is None:
                market_value = quantity * (current_price or avg_price or 0.0)

            # `open_bal` is the broker's own book value for the whole position.
            # Preferred over quantity * avg_price because bond prices are quoted
            # as a percentage of face value, which open_bal already accounts for.
            cost_basis = _opt_float(row.get("open_bal"))
            if cost_basis is None and avg_price is not None:
                cost_basis = quantity * avg_price

            market_value_base, fx_rate = self._convert(market_value, currency, base, rates)
            cost_basis_base = (
                self._convert(cost_basis, currency, base, rates)[0]
                if cost_basis is not None
                else None
            )

            positions.append(
                ProviderPosition(
                    symbol=str(symbol),
                    name=_first(row, "name", "name2"),
                    quantity=quantity,
                    avg_price=avg_price,
                    current_price=current_price,
                    market_value=round(market_value, 2),
                    currency=currency,
                    cost_basis=round(cost_basis, 2) if cost_basis is not None else None,
                    fx_rate=fx_rate,
                    market_value_base=round(market_value_base, 2),
                    cost_basis_base=(
                        round(cost_basis_base, 2) if cost_basis_base is not None else None
                    ),
                    exchange=_first(row, "ltr"),
                )
            )

        self._attach_quotes(positions)
        return positions

    def _attach_quotes(self, positions: list[ProviderPosition]) -> None:
        """Fill in each position's intraday move from the quote feed.

        Best-effort: the portfolio response already carries everything needed
        for value and return, so a quote-feed failure costs the day-change
        column rather than failing the whole sync.
        """
        if not positions:
            return
        try:
            quotes = self._quotes([p.symbol for p in positions])
        except Exception:  # noqa: BLE001 - decorative data, never fatal
            logger.warning("Freedom24 quote lookup failed; skipping day change", exc_info=True)
            return

        for position in positions:
            quote = quotes.get(position.symbol)
            if not quote:
                continue
            position.previous_close = _opt_float(quote.get("ClosePrice"))
            position.day_change = _opt_float(quote.get("chg"))
            position.day_change_pct = _opt_float(quote.get("pcp"))
            last_price = _opt_float(quote.get("ltp"))
            if position.current_price is None and last_price is not None:
                position.current_price = last_price

    def _quotes(self, symbols: list[str]) -> dict[str, dict[str, Any]]:
        """symbol -> quote row, via the public /securities/export endpoint."""
        if not symbols:
            return {}
        rows = self._client.export_securities(symbols, fields=QUOTE_FIELDS)
        if not isinstance(rows, list):
            return {}
        return {str(row["c"]): row for row in rows if isinstance(row, dict) and row.get("c")}

    # -------------------------------------------------------------------- candles

    def get_candles(self, symbol: str, start: date, end: date) -> list[ProviderCandle]:
        """Daily OHLC via `getHloc` (docs: /tradernet-api/quotes-get-hloc).

        The tradernet-sdk wraps this as `get_candles`. Response shape (verified
        against the SDK's own TradernetSymbol parser and the published examples):

            {"hloc": {SYMBOL: [[h, l, o, c], ...]}, "xSeries": {SYMBOL: [unix_ts, ...]}}

        `timeframe` is in **minutes** on the wire (1440 = 1 day). The SDK takes
        seconds and divides by 60 — we pass 86400 so it sends the documented daily
        bar size. Dates must be `dd.mm.YYYY HH:MM` (the SDK formats them).
        """
        response = self._client.get_candles(
            symbol,
            start=datetime.combine(start, datetime.min.time()),
            end=datetime.combine(end, datetime.max.time().replace(microsecond=0)),
            timeframe=86400,
        )
        if not isinstance(response, dict):
            raise ValueError("Unexpected response from Freedom24 (getHloc)")
        if response.get("errMsg") or response.get("error"):
            raise ValueError(
                f"Freedom24 API error: {response.get('errMsg') or response.get('error')}"
            )

        hloc_map = response.get("hloc") or {}
        series_map = response.get("xSeries") or response.get("xseries") or {}
        bars = hloc_map.get(symbol)
        stamps = series_map.get(symbol)
        if not isinstance(bars, list) or not isinstance(stamps, list):
            # Some payloads nest under a single key or return empty when the
            # symbol has no history — treat as "no candles", not a hard error.
            return []

        candles: list[ProviderCandle] = []
        for stamp, bar in zip(stamps, bars):
            if not isinstance(bar, (list, tuple)) or len(bar) < 4:
                continue
            try:
                # xSeries is unix seconds; the SDK adds +3h for Moscow-session
                # alignment, but calendar-day charts only need the date part.
                ts = float(stamp)
                if ts > 1e12:  # milliseconds, just in case
                    ts /= 1000.0
                bar_date = datetime.utcfromtimestamp(ts).date()
            except (TypeError, ValueError, OSError, OverflowError):
                continue
            high, low, open_, close = (
                _as_float(bar[0]),
                _as_float(bar[1]),
                _as_float(bar[2]),
                _as_float(bar[3]),
            )
            candles.append(
                ProviderCandle(
                    date=bar_date, open=open_, high=high, low=low, close=close
                )
            )
        candles.sort(key=lambda c: c.date)
        return candles

    # --------------------------------------------------------------- transactions

    def get_transactions(self, since: Optional[datetime] = None) -> list[ProviderTransaction]:
        """Trades from getTradesHistory, plus one `fee` row per commission charged.

        `amount` is signed from the account's point of view: money leaving on a
        buy or as commission is negative, proceeds of a sale are positive.

        Trades only: dividends, deposits and withdrawals have no API v3 command
        (every candidate — getDividends, getBrokerReport, getRequestsHistory,
        getMoneyMoveHistory — 404s), so they are absent from this feed.
        """
        start: date = since.date() if since else date(1970, 1, 1)
        response = self._client.get_trades_history(start=start, end=date.today())
        if not isinstance(response, dict):
            raise ValueError("Unexpected response from Freedom24 (getTradesHistory)")
        if response.get("errMsg") or response.get("error"):
            raise ValueError(
                f"Freedom24 API error: {response.get('errMsg') or response.get('error')}"
            )

        trades = response.get("trades")
        if trades is None:
            trades = (response.get("result") or {}).get("trades") or []
        if isinstance(trades, dict):
            trades = trades.get("trade") or []
        if isinstance(trades, dict):  # a single trade is not wrapped in a list
            trades = [trades]
        if not isinstance(trades, list):
            raise ValueError("Unexpected Freedom24 response shape: trades is not a list")

        transactions: list[ProviderTransaction] = []
        for row in trades:
            if not isinstance(row, dict):
                continue
            external_id = _first(row, "id", "trade_id")
            if external_id is None:
                continue

            # `type` is "1" (buy) or "2" (sell); currency instruments are FX
            # conversions rather than holdings, so they get their own type.
            is_buy = str(_first(row, "type") or "").strip() == "1"
            if _as_float(row.get("instr_type_c")) == CURRENCY_INSTRUMENT_TYPE:
                txn_type = "fx"
            else:
                txn_type = "buy" if is_buy else "sell"

            gross = abs(_as_float(_first(row, "v", "summ")))
            currency = str(_first(row, "curr_c", "curr") or "USD").upper()
            txn_date = _parse_datetime(_first(row, "date", "pay_d")) or datetime.utcnow()

            transactions.append(
                ProviderTransaction(
                    external_id=str(external_id),
                    type=txn_type,
                    symbol=_first(row, "instr_nm", "base_contract_code"),
                    quantity=_opt_float(row.get("q")),
                    price=_opt_float(row.get("p")),
                    amount=round(-gross if is_buy else gross, 2),
                    currency=currency,
                    date=txn_date,
                    raw_payload=row,
                )
            )

            commission = abs(_as_float(row.get("commission")))
            if commission:
                transactions.append(
                    ProviderTransaction(
                        # Suffixed so it can never collide with a trade id — the
                        # sync is keyed on (account_id, external_id).
                        external_id=f"{external_id}-fee",
                        type="fee",
                        symbol=_first(row, "instr_nm"),
                        quantity=None,
                        price=None,
                        amount=round(-commission, 2),
                        currency=str(
                            _first(row, "commission_currency", "curr_c") or currency
                        ).upper(),
                        date=txn_date,
                        raw_payload={
                            "trade_id": external_id,
                            "commission": row.get("commission"),
                            "commission_currency": row.get("commission_currency"),
                        },
                    )
                )

        return transactions

    # -------------------------------------------------------------------- search

    def search_symbols(self, query: str) -> list[ProviderSymbol]:
        response = self._client.find_symbol(query)
        if not isinstance(response, dict):
            raise ValueError("Unexpected response from Freedom24 (tickerFinder)")
        if response.get("errMsg") or response.get("error"):
            raise ValueError(
                f"Freedom24 API error: {response.get('errMsg') or response.get('error')}"
            )

        rows = response.get("found")
        if rows is None:
            rows = response.get("result") or []
        if not isinstance(rows, list):
            raise ValueError("Unexpected Freedom24 response shape: found is not a list")

        symbols: list[ProviderSymbol] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            # `t` is the Tradernet ticker ("AAPL.US"); `code_nm` the plain
            # exchange ticker ("AAPL").
            symbol = _first(row, "t", "code_nm")
            if not symbol:
                continue
            type_code = int(_as_float(row.get("type"), -1))
            kind_code = int(_as_float(row.get("kind"), -1))
            symbols.append(
                ProviderSymbol(
                    symbol=str(symbol),
                    name=_first(row, "n", "nm", "ln"),
                    # `codesub` is the specific venue (NASDAQ), `mkt` the
                    # Tradernet market group (FIX) — the venue is more useful.
                    exchange=_first(row, "codesub", "mkt"),
                    instrument_type=INSTRUMENT_KINDS.get(
                        (type_code, kind_code), INSTRUMENT_TYPES.get(type_code)
                    ),
                    currency=_first(row, "x_curr", "base_currency"),
                    isin=_first(row, "isin"),
                )
            )

        self._attach_search_quotes(symbols)
        return symbols

    def _attach_search_quotes(self, symbols: list[ProviderSymbol], top: int = 12) -> None:
        """Add last price / day change to the first `top` hits, best-effort."""
        head = symbols[:top]
        if not head:
            return
        try:
            quotes = self._quotes([s.symbol for s in head])
        except Exception:  # noqa: BLE001 - decorative data, never fatal
            logger.warning("Freedom24 quote lookup failed for search", exc_info=True)
            return
        for result in head:
            quote = quotes.get(result.symbol)
            if not quote:
                continue
            result.last_price = _opt_float(quote.get("ltp"))
            result.day_change_pct = _opt_float(quote.get("pcp"))

    # ---------------------------------------------------------------------- news

    def get_news(
        self,
        query: str = "",
        symbol: Optional[str] = None,
        limit: int = 30,
        offset: int = 0,
        language: Optional[str] = None,
    ) -> ProviderNewsPage:
        """A page of the broker's newsfeed.

        `getNewsList` pages with `take`/`skip` and filters by `ticker`, but has
        no free-text parameter — so `query` is applied here by matching titles
        over a wider window of the feed. That keeps the search box working
        without pretending the broker supports it.
        """
        params: dict[str, Any] = {"take": limit, "skip": offset}
        if symbol:
            params["ticker"] = symbol
        if language:
            params["lang"] = language

        text = query.strip().lower()
        if text:
            # Scan a wider window locally, since the API cannot filter by text.
            params["take"] = max(limit * 10, 100)
            params["skip"] = 0

        response = self._client.authorized_request("getNewsList", params)
        if not isinstance(response, dict):
            raise ValueError("Unexpected response from Freedom24 (getNewsList)")
        if response.get("errMsg") or response.get("error"):
            raise ValueError(
                f"Freedom24 API error: {response.get('errMsg') or response.get('error')}"
            )

        rows = response.get("list")
        if not isinstance(rows, list):
            raise ValueError("Unexpected Freedom24 response shape: list is not a list")

        items = [self._news_item(row) for row in rows if isinstance(row, dict) and row.get("id")]
        total = int(_as_float(response.get("total"), len(items)))

        if text:
            items = [
                item
                for item in items
                if text in item.title.lower() or any(text in s.lower() for s in item.symbols)
            ]
            total = len(items)
            items = items[offset : offset + limit]

        return ProviderNewsPage(items=items, total=total)

    def get_news_story(self, story_id: str) -> ProviderNewsItem:
        response = self._client.authorized_request(
            "getNewsDetail", {"id": int(_as_float(story_id, -1))}
        )
        if not isinstance(response, dict):
            raise ValueError("Unexpected response from Freedom24 (getNewsDetail)")
        if response.get("errMsg") or response.get("error"):
            raise ValueError(
                f"Freedom24 API error: {response.get('errMsg') or response.get('error')}"
            )
        if not response.get("id"):
            raise ValueError(f"Freedom24 returned no story for id {story_id}")
        item = self._news_item(response)
        item.body_html = _first(response, "text", "body")
        return item

    @staticmethod
    def _news_item(row: dict[str, Any]) -> ProviderNewsItem:
        images = row.get("images")
        image_url = images[0] if isinstance(images, list) and images else None
        tickers = row.get("tickers")
        return ProviderNewsItem(
            story_id=str(row.get("id")),
            title=str(_first(row, "title") or ""),
            summary=None,  # the list endpoint carries no teaser text
            url=_first(row, "url"),
            source=_first(row, "providerAlias", "provider"),
            published_at=_parse_datetime(_first(row, "date", "dateTime")),
            sentiment=_first(row, "sentiment"),
            image_url=str(image_url) if image_url else None,
            symbols=[str(t) for t in tickers] if isinstance(tickers, list) else [],
        )
