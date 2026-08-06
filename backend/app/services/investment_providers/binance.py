"""Binance adapter, built on the `python-binance` PyPI package.

Auth: HMAC-signed requests keyed by an API key/secret pair generated at
https://www.binance.com/en/my/settings/api-management. The `public_key`/
`private_key` fields on `InvestmentProvider` map onto Binance's `api_key`/
`api_secret` — the base class's naming is broker-agnostic, Binance itself
calls them "API Key" and "Secret Key" (surfaced as such in the connect form).

This account has no separate cash sub-account like a broker does — every
asset, including stablecoins, is just a balance. To keep the cash/positions
split the UI already renders meaningful, stablecoin holdings (USDT, USDC,
BUSD, FDUSD, TUSD, USDP, DAI) are treated as "cash" and everything else as a
position, each priced against USDT via the public ticker book.

Known limitations, spelled out here rather than hidden behind a generic sync
failure:

- Binance's spot API has no "average buy price" or cost-basis endpoint —
  confirmed against the current docs at developers.binance.com/en/docs, and
  by every field `get_account` returns being a balance, never a cost. It's
  the same figure Binance's own app shows you, computed the same way: replay
  every trade in the pair and track a weighted-average cost. See
  `_average_cost` below for the method and its own caveats.
- `myTrades` (the trade-history endpoint) requires a `symbol` and Binance
  has no "all trades across every market" call. Trade and cost-basis history
  is fetched only for `{asset}USDT` pairs where `asset` is currently held or
  was deposited/withdrawn — a coin bought and fully sold in a market other
  than *USDT, or one whose full history exceeds the pagination cap below,
  won't be reflected. This mirrors a real limitation of the API, not an
  oversight; Binance itself points users at the account statement export for
  full history.
- FX conversion to the account's `base_currency` uses Binance's own
  `{BASE}USDT` spot pair (e.g. `EURUSDT`) when one exists; USD/USDT are
  treated as equivalent. A `base_currency` with no such pair (rare) falls
  back to 1:1, same fallback shape as Freedom24 uses when a rate is missing.
"""
import logging
from datetime import date, datetime, timezone
from typing import Any, Optional

from binance import Client
from binance.exceptions import BinanceAPIException

from app.services.investment_providers.base import (
    InvestmentProvider,
    ProviderBalance,
    ProviderCandle,
    ProviderPosition,
    ProviderSymbol,
    ProviderTransaction,
)

logger = logging.getLogger("app.investments.binance")

# Treated as cash rather than a "position" — see module docstring.
STABLECOINS = {"USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USDP", "DAI"}

# Balances at or below this are dust (unsellable, sub-cent) — Binance leaves
# these behind after trades far more often than a broker's rounding does.
DUST_QUANTITY = 1e-8

# `myTrades` caps at 1000 rows per call; this bounds how many pages
# `_full_trade_history` will fetch per symbol so one very active account
# can't stall a sync (25 * 1000 = 25k trades, far beyond a personal account).
MAX_TRADE_HISTORY_PAGES = 25


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _ms(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


class BinanceProvider(InvestmentProvider):
    def __init__(self, public_key: str, private_key: str, base_currency: str = "USD"):
        super().__init__(public_key, private_key, base_currency)
        self._client = Client(api_key=public_key, api_secret=private_key)
        self._ticker_cache: Optional[dict[str, float]] = None
        # symbol -> its full trade history, oldest first. A sync calls both
        # get_positions (cost basis) and get_transactions (activity feed) for
        # the same symbols, so caching here halves the paginated fetches.
        self._trade_history_cache: dict[str, list[dict[str, Any]]] = {}

    # -------------------------------------------------------------------- pricing

    def _tickers(self) -> dict[str, float]:
        """symbol -> price, e.g. "BTCUSDT" -> 68000.5. Cached per sync."""
        if self._ticker_cache is not None:
            return self._ticker_cache
        rows = self._client.get_all_tickers()
        if not isinstance(rows, list):
            raise ValueError("Unexpected response from Binance (get_all_tickers)")
        self._ticker_cache = {
            row["symbol"]: _as_float(row["price"])
            for row in rows
            if isinstance(row, dict) and row.get("symbol") and row.get("price") is not None
        }
        return self._ticker_cache

    def _price_in_usdt(self, asset: str) -> Optional[float]:
        """Best-effort USDT valuation for one unit of `asset`."""
        if asset in STABLECOINS:
            return 1.0
        tickers = self._tickers()
        direct = tickers.get(f"{asset}USDT")
        if direct is not None:
            return direct
        # Route through BTC for assets with no direct USDT market.
        via_btc = tickers.get(f"{asset}BTC")
        btc_usdt = tickers.get("BTCUSDT")
        if via_btc is not None and btc_usdt is not None:
            return via_btc * btc_usdt
        return None

    def _usdt_to_base_rate(self) -> float:
        """USDT -> base_currency rate, 1.0 fallback when no pair exists."""
        base = self.base_currency
        if base in ("USD", "USDT"):
            return 1.0
        tickers = self._tickers()
        pair = tickers.get(f"{base}USDT")
        if pair and pair > 0:
            return 1.0 / pair
        logger.info("Binance reports no %sUSDT pair; reporting totals in USD instead", base)
        return 1.0

    # ------------------------------------------------------------------ balances

    def _balances(self) -> list[dict[str, Any]]:
        account = self._client.get_account()
        if not isinstance(account, dict) or not isinstance(account.get("balances"), list):
            raise ValueError("Unexpected response from Binance (get_account)")
        result = []
        for row in account["balances"]:
            if not isinstance(row, dict):
                continue
            total = _as_float(row.get("free")) + _as_float(row.get("locked"))
            if total > DUST_QUANTITY:
                result.append({"asset": row["asset"], "quantity": total})
        return result

    def get_balance(self) -> ProviderBalance:
        rate = self._usdt_to_base_rate()
        cash_by_currency: dict[str, float] = {}
        cash_usdt = 0.0
        positions_value_usdt = 0.0

        for row in self._balances():
            asset = row["asset"]
            quantity = row["quantity"]
            if asset in STABLECOINS:
                cash_by_currency[asset] = cash_by_currency.get(asset, 0.0) + quantity
                cash_usdt += quantity
                continue
            price = self._price_in_usdt(asset)
            if price is not None:
                positions_value_usdt += quantity * price

        cash_base = cash_usdt * rate
        positions_base = positions_value_usdt * rate

        return ProviderBalance(
            total_value=round(cash_base + positions_base, 2),
            cash_balance=round(cash_base, 2),
            currency=self.base_currency,
            positions_value=round(positions_base, 2),
            cash_by_currency={c: round(v, 2) for c, v in cash_by_currency.items()},
        )

    def get_positions(self) -> list[ProviderPosition]:
        rate = self._usdt_to_base_rate()
        positions: list[ProviderPosition] = []
        for row in self._balances():
            asset = row["asset"]
            if asset in STABLECOINS:
                continue
            quantity = row["quantity"]
            price = self._price_in_usdt(asset)
            market_value = round(quantity * price, 2) if price is not None else 0.0
            positions.append(
                ProviderPosition(
                    symbol=asset,
                    name=asset,
                    quantity=quantity,
                    avg_price=self._average_cost(asset),
                    current_price=price,
                    market_value=market_value,
                    currency="USDT",
                    # Left unset — the router derives cost_basis (and its base-
                    # currency twin) as avg_price * quantity, using the real
                    # held quantity rather than the trade-implied one below.
                    cost_basis=None,
                    fx_rate=rate,
                    market_value_base=round(market_value * rate, 2),
                    cost_basis_base=None,
                    exchange="Binance",
                )
            )
        self._attach_day_change(positions)
        return positions

    def _full_trade_history(self, symbol: str) -> list[dict[str, Any]]:
        """Every trade ever made in `symbol`, oldest first. Cached per instance.

        Paginates `myTrades` via `fromId` — each page's last trade id + 1 seeds
        the next page — until a page comes back short of the 1000-row limit,
        capped at `MAX_TRADE_HISTORY_PAGES`. See the module docstring for why
        this (not a dedicated endpoint) is how cost basis gets computed.
        """
        if symbol in self._trade_history_cache:
            return self._trade_history_cache[symbol]

        trades: list[dict[str, Any]] = []
        from_id = 0
        for _ in range(MAX_TRADE_HISTORY_PAGES):
            try:
                page = self._client.get_my_trades(symbol=symbol, fromId=from_id, limit=1000)
            except BinanceAPIException as exc:
                if exc.code == -1121:  # no such market, e.g. an asset with no USDT pair
                    page = []
                else:
                    logger.warning("Binance trade history lookup failed for %s: %s", symbol, exc.message)
                    break
            if not isinstance(page, list) or not page:
                break
            trades.extend(row for row in page if isinstance(row, dict))
            if len(page) < 1000:
                break
            from_id = max(int(_as_float(row.get("id"), from_id)) for row in page) + 1

        trades.sort(key=lambda row: _as_float(row.get("time")))
        self._trade_history_cache[symbol] = trades
        return trades

    def _average_cost(self, asset: str) -> Optional[float]:
        """Average cost per unit paid on Binance for `asset`, in USDT.

        Weighted-average-cost method, same approach Binance's own app uses:
        each buy blends into a running average price; each sell reduces the
        held quantity without moving the average. A fee charged in `asset`
        itself reduces the quantity acquired; fees in any other asset (USDT,
        BNB, ...) are left out of the cost — they're already surfaced as their
        own `fee` transactions in the activity feed, so folding them in here
        too would double-count them.

        Only reflects trade-acquired quantity, which can differ from the
        actual balance (deposits, other quote markets — see the module
        docstring); the router applies this rate to the real held quantity
        rather than the trade-implied one computed here, on the assumption
        that a unit's cost doesn't depend on how it entered the account.
        """
        trades = self._full_trade_history(f"{asset}USDT")
        if not trades:
            return None

        held_qty = 0.0
        total_cost = 0.0
        for row in trades:
            qty = _as_float(row.get("qty"))
            if row.get("commissionAsset") == asset:
                qty = max(qty - _as_float(row.get("commission")), 0.0)
            quote_qty = _as_float(row.get("quoteQty"), qty * _as_float(row.get("price")))

            if row.get("isBuyer"):
                held_qty += qty
                total_cost += quote_qty
            elif held_qty > 0:
                avg_cost = total_cost / held_qty
                sold = min(qty, held_qty)
                total_cost -= avg_cost * sold
                held_qty -= sold

        if held_qty <= DUST_QUANTITY:
            return None
        return total_cost / held_qty

    def _attach_day_change(self, positions: list[ProviderPosition]) -> None:
        """Intraday move from the 24h ticker, best-effort like Freedom24's quote feed."""
        if not positions:
            return
        try:
            rows = self._client.get_ticker()
        except Exception:  # noqa: BLE001 - decorative data, never fatal
            logger.warning("Binance 24h ticker lookup failed; skipping day change", exc_info=True)
            return
        if not isinstance(rows, list):
            return
        by_symbol = {row["symbol"]: row for row in rows if isinstance(row, dict) and row.get("symbol")}
        for position in positions:
            row = by_symbol.get(f"{position.symbol}USDT")
            if not row:
                continue
            position.previous_close = _as_float(row.get("prevClosePrice")) or None
            position.day_change = _as_float(row.get("priceChange")) or None
            position.day_change_pct = _as_float(row.get("priceChangePercent")) or None

    # -------------------------------------------------------------------- candles

    def get_candles(self, symbol: str, start: date, end: date) -> list[ProviderCandle]:
        """Daily OHLC via `get_historical_klines`, quoted in USDT."""
        try:
            rows = self._client.get_historical_klines(
                f"{symbol}USDT",
                Client.KLINE_INTERVAL_1DAY,
                _ms(datetime.combine(start, datetime.min.time())),
                _ms(datetime.combine(end, datetime.max.time().replace(microsecond=0))),
            )
        except BinanceAPIException as exc:
            if exc.code == -1121:  # invalid symbol, e.g. an asset with no USDT market
                return []
            raise ValueError(f"Binance API error: {exc.message}") from exc
        if not isinstance(rows, list):
            raise ValueError("Unexpected response from Binance (get_historical_klines)")

        candles: list[ProviderCandle] = []
        for bar in rows:
            if not isinstance(bar, (list, tuple)) or len(bar) < 5:
                continue
            open_time_ms = bar[0]
            try:
                bar_date = datetime.fromtimestamp(open_time_ms / 1000, tz=timezone.utc).date()
            except (TypeError, ValueError, OSError, OverflowError):
                continue
            candles.append(
                ProviderCandle(
                    date=bar_date,
                    open=_as_float(bar[1]),
                    high=_as_float(bar[2]),
                    low=_as_float(bar[3]),
                    close=_as_float(bar[4]),
                )
            )
        candles.sort(key=lambda c: c.date)
        return candles

    # --------------------------------------------------------------- transactions

    def get_transactions(self, since: Optional[datetime] = None) -> list[ProviderTransaction]:
        """Trades for currently-relevant symbols, plus deposits/withdrawals.

        See the module docstring for why this can miss trades in assets that
        were fully bought and sold before `since` (or before the account was
        connected, on a first sync).
        """
        start_ms = _ms(since) if since else None
        transactions: list[ProviderTransaction] = []

        assets = {row["asset"] for row in self._balances()}
        # Also sweep assets with deposit/withdrawal activity, so a coin that
        # was fully sold still shows the trade that acquired it.
        deposits = self._deposit_history(start_ms)
        withdrawals = self._withdraw_history(start_ms)
        assets |= {d["coin"] for d in deposits} | {w["coin"] for w in withdrawals}

        for asset in sorted(assets - STABLECOINS):
            transactions.extend(self._trades_for_symbol(f"{asset}USDT", start_ms))

        for row in deposits:
            transactions.append(
                ProviderTransaction(
                    external_id=f"deposit-{row['id']}",
                    type="deposit",
                    symbol=row["coin"],
                    quantity=row["amount"],
                    price=None,
                    amount=round(row["amount"], 8),
                    currency=row["coin"],
                    date=row["date"],
                    raw_payload=row["raw"],
                )
            )
        for row in withdrawals:
            transactions.append(
                ProviderTransaction(
                    external_id=f"withdrawal-{row['id']}",
                    type="withdrawal",
                    symbol=row["coin"],
                    quantity=row["amount"],
                    price=None,
                    amount=round(-row["amount"], 8),
                    currency=row["coin"],
                    date=row["date"],
                    raw_payload=row["raw"],
                )
            )

        return transactions

    def _trades_for_symbol(self, symbol: str, start_ms: Optional[int]) -> list[ProviderTransaction]:
        """Trades in `symbol` since `start_ms`, from the same cache `_average_cost` fills.

        Filtered client-side rather than via `myTrades`' own `startTime` — the
        full history is already being fetched for cost basis, so this avoids a
        second paginated round-trip through the same trades.
        """
        rows = self._full_trade_history(symbol)
        if start_ms is not None:
            rows = [row for row in rows if _as_float(row.get("time")) >= start_ms]

        transactions: list[ProviderTransaction] = []
        for row in rows:
            if row.get("id") is None:
                continue
            qty = _as_float(row.get("qty"))
            price = _as_float(row.get("price"))
            quote_qty = _as_float(row.get("quoteQty"), qty * price)
            is_buyer = bool(row.get("isBuyer"))
            trade_date = datetime.fromtimestamp(
                _as_float(row.get("time")) / 1000, tz=timezone.utc
            )
            base_asset = symbol[:-4] if symbol.endswith("USDT") else symbol

            transactions.append(
                ProviderTransaction(
                    external_id=f"{symbol}-{row['id']}",
                    type="buy" if is_buyer else "sell",
                    symbol=base_asset,
                    quantity=qty,
                    price=price,
                    amount=round(-quote_qty if is_buyer else quote_qty, 8),
                    currency="USDT",
                    date=trade_date,
                    raw_payload=row,
                )
            )

            commission = _as_float(row.get("commission"))
            if commission:
                transactions.append(
                    ProviderTransaction(
                        external_id=f"{symbol}-{row['id']}-fee",
                        type="fee",
                        symbol=row.get("commissionAsset") or base_asset,
                        quantity=None,
                        price=None,
                        amount=round(-commission, 8),
                        currency=str(row.get("commissionAsset") or "USDT"),
                        date=trade_date,
                        raw_payload={"trade_id": row["id"], "commission": commission},
                    )
                )
        return transactions

    def _deposit_history(self, start_ms: Optional[int]) -> list[dict[str, Any]]:
        try:
            kwargs: dict[str, Any] = {}
            if start_ms is not None:
                kwargs["startTime"] = start_ms
            rows = self._client.get_deposit_history(**kwargs)
        except BinanceAPIException as exc:
            logger.warning("Binance deposit history lookup failed: %s", exc.message)
            return []
        if not isinstance(rows, list):
            return []
        parsed = []
        for row in rows:
            if not isinstance(row, dict) or row.get("id") is None:
                continue
            parsed.append(
                {
                    "id": row["id"],
                    "coin": str(row.get("coin") or "USDT"),
                    "amount": _as_float(row.get("amount")),
                    "date": datetime.fromtimestamp(
                        _as_float(row.get("insertTime")) / 1000, tz=timezone.utc
                    ),
                    "raw": row,
                }
            )
        return parsed

    def _withdraw_history(self, start_ms: Optional[int]) -> list[dict[str, Any]]:
        try:
            kwargs: dict[str, Any] = {}
            if start_ms is not None:
                kwargs["startTime"] = start_ms
            rows = self._client.get_withdraw_history(**kwargs)
        except BinanceAPIException as exc:
            logger.warning("Binance withdraw history lookup failed: %s", exc.message)
            return []
        if not isinstance(rows, list):
            return []
        parsed = []
        for row in rows:
            if not isinstance(row, dict) or row.get("id") is None:
                continue
            apply_time = row.get("applyTime") or row.get("applyTime ")
            parsed.append(
                {
                    "id": row["id"],
                    "coin": str(row.get("coin") or "USDT"),
                    "amount": _as_float(row.get("amount")),
                    "date": self._parse_withdraw_date(apply_time),
                    "raw": row,
                }
            )
        return parsed

    @staticmethod
    def _parse_withdraw_date(value: Any) -> datetime:
        if value:
            text = str(value).strip()
            for fmt in ("%Y-%m-%d %H:%M:%S",):
                try:
                    return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
        return datetime.now(timezone.utc)

    # -------------------------------------------------------------------- search

    def search_symbols(self, query: str) -> list[ProviderSymbol]:
        """Trading-pair search via the public exchange-info endpoint (no auth needed)."""
        try:
            info = self._client.get_exchange_info()
        except BinanceAPIException as exc:
            raise ValueError(f"Binance API error: {exc.message}") from exc
        if not isinstance(info, dict) or not isinstance(info.get("symbols"), list):
            raise ValueError("Unexpected response from Binance (get_exchange_info)")

        text = query.strip().upper()
        tickers = self._tickers()
        symbols: list[ProviderSymbol] = []
        for row in info["symbols"]:
            if not isinstance(row, dict) or row.get("status") != "TRADING":
                continue
            base_asset = str(row.get("baseAsset") or "")
            quote_asset = str(row.get("quoteAsset") or "")
            symbol = str(row.get("symbol") or "")
            if text not in base_asset and text not in symbol:
                continue
            symbols.append(
                ProviderSymbol(
                    symbol=symbol,
                    name=f"{base_asset}/{quote_asset}",
                    exchange="Binance",
                    instrument_type="crypto",
                    currency=quote_asset,
                    last_price=tickers.get(symbol),
                )
            )
            if len(symbols) >= 25:
                break
        return symbols
