import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Account,
    InvestmentCredential,
    InvestmentTransaction,
    MarketPriceBar,
    PortfolioPosition,
    PortfolioSnapshot,
)
from app.services.investment_providers import get_provider
from app.services.investment_providers.base import (
    day_change_amount,
    ProviderBalance,
    ProviderCandle,
    ProviderPosition,
    ProviderTransaction,
)
from app.services.market_data.broker_symbols import yahoo_candidates
from app.utils.crypto import decrypt, encrypt, DecryptionError

logger = logging.getLogger("app.investments")

# Charts need ≥2 points; without a backfill a brand-new account only has today's
# sync snapshot and sparklines stay blank until the next calendar day. Long
# enough to cover a whole trade tape: a shorter window starts the curve mid-way
# through the account's life, so "all-time" net invested and gain leave out
# everything before it while the P&L breakdown still counts those trades.
_HISTORY_LOOKBACK_DAYS = 365 * 10

# Per provider, the current version of the history reconstruction. An account
# whose credential records an older version has its past snapshots discarded
# and rebuilt on its next sync. Bump when a reconstruction bug is fixed.
#   freedom24 1: FX trades booked one leg only, amounts were summed across
#   currencies, and missing deposits were papered over with a constant cash
#   shift — the rebuilt curve went negative and tripled in a day.
HISTORY_VERSIONS: dict[str, int] = {"freedom24": 1}  # also: candles dated a day early


def get_provider_for_account(account: Account):
    """Build a provider adapter for an account's stored credentials.

    Raises DecryptionError / ValueError on bad keys — callers (search/news
    endpoints, sync_account) decide how to surface that.
    """
    credential = account.investment_credential
    if credential is None:
        raise ValueError(f"Account {account.id} has no investment credential")
    public_key = decrypt(credential.encrypted_public_key)
    private_key = decrypt(credential.encrypted_private_key)
    return get_provider(account.provider, public_key, private_key, account.currency)


def sync_account(db: Session, account: Account) -> InvestmentCredential:
    """Pull balance/positions/transactions for one brokerage-synced account.

    Never raises — failures are recorded on the account's InvestmentCredential
    (sync_status="error", sync_error=<message>) so one account's outage never
    blocks others (mirrors app/services/scheduler.py's per-user isolation).
    """
    credential = account.investment_credential
    if credential is None:
        raise ValueError(f"Account {account.id} has no investment credential")

    try:
        public_key = decrypt(credential.encrypted_public_key)
        private_key = decrypt(credential.encrypted_private_key)
    except DecryptionError as exc:
        credential.sync_status = "error"
        credential.sync_error = str(exc)
        db.commit()
        return credential

    try:
        provider = get_provider(account.provider, public_key, private_key, account.currency)
        balance = provider.get_balance()
        positions = provider.get_positions()
        # Always pull the full trade tape. Incremental `since=last_synced_at`
        # left early (wrongly-parsed) rows stuck forever because we keyed on
        # external_id and never updated them.
        transactions = provider.get_transactions(since=None)
        target_version = HISTORY_VERSIONS.get(account.provider or "", 0)
        rebuild = (credential.history_version or 0) < target_version
        # Candle fetches are one network call per symbol. Do them now, before the
        # first write, so no SQLite write transaction is open across network I/O
        # (every other writer would otherwise sit on its busy timeout meanwhile).
        backfill = _fetch_backfill_candles(
            db, account, provider, positions, transactions, force=rebuild
        )
        _attach_cached_day_changes(db, account, positions)

        account.balance = round(balance.total_value, 2)
        account.currency = balance.currency
        account.last_synced_at = datetime.now(timezone.utc)

        db.query(PortfolioPosition).filter(PortfolioPosition.account_id == account.id).delete(
            synchronize_session=False
        )
        for position in positions:
            db.add(
                PortfolioPosition(
                    account_id=account.id,
                    symbol=position.symbol,
                    name=position.name,
                    quantity=position.quantity,
                    avg_price=position.avg_price,
                    current_price=position.current_price,
                    market_value=position.market_value,
                    currency=position.currency,
                    cost_basis=position.cost_basis,
                    fx_rate=position.fx_rate,
                    market_value_base=position.market_value_base,
                    cost_basis_base=position.cost_basis_base,
                    day_change=position.day_change,
                    day_change_pct=position.day_change_pct,
                    exchange=position.exchange,
                )
            )

        _upsert_transactions(db, account.id, transactions)
        if rebuild and backfill is not None:
            # Drop the curve the old reconstruction built (today's row is
            # rewritten below from the live balance).
            db.query(PortfolioSnapshot).filter(
                PortfolioSnapshot.account_id == account.id,
                PortfolioSnapshot.date < date.today(),
            ).delete(synchronize_session=False)

        today = date.today()
        snapshot = (
            db.query(PortfolioSnapshot)
            .filter(PortfolioSnapshot.account_id == account.id, PortfolioSnapshot.date == today)
            .first()
        )
        if snapshot is None:
            snapshot = PortfolioSnapshot(account_id=account.id, date=today)
            db.add(snapshot)
        snapshot.total_value = balance.total_value
        snapshot.cash_balance = balance.cash_balance
        snapshot.positions_value = balance.positions_value
        snapshot.currency = balance.currency
        # Flush so the live row is visible to the backfill query and cannot be
        # duplicated by a reconstructed "today" point.
        db.flush()

        _backfill_portfolio_history(db, account, balance, positions, backfill)
        if backfill is not None or not rebuild:
            credential.history_version = max(credential.history_version or 0, target_version)

        credential.sync_status = "ok"
        credential.sync_error = None
        db.commit()
    except Exception as exc:  # noqa: BLE001 - one broker's failure must not raise past this call
        db.rollback()
        logger.exception("Investment sync failed for account %s", account.id)
        credential.sync_status = "error"
        credential.sync_error = str(exc)
        db.commit()

    return credential


def _attach_cached_day_changes(
    db: Session, account: Account, positions: list[ProviderPosition]
) -> None:
    """Fill an unknown day change from the last two cached Yahoo closes.

    Some venues (Greek stocks on Freedom24) come back from the quote feed
    without any usable move — no `pcp` and no `ClosePrice` — and the provider
    correctly reports None rather than a fabricated 0.0. The ticker mapping
    (`market_data.broker_symbols`) names the Yahoo listings to try; the price
    cache `market_data.prices` maintains (`MarketPriceBar`) supplies the
    closes. Read cache-only, best-effort: a position the cache has never seen
    was simply priced nowhere that day and keeps its None.
    """
    for position in positions:
        if position.day_change_pct is not None:
            continue
        for candidate in yahoo_candidates(position.symbol, account.provider):
            bars = (
                db.query(MarketPriceBar.close)
                .filter(MarketPriceBar.symbol == candidate)
                .order_by(MarketPriceBar.date.desc())
                .limit(2)
                .all()
            )
            if len(bars) < 2:
                continue
            previous, last = bars[1][0], bars[0][0]
            if not previous or previous <= 0 or last is None:
                continue
            position.day_change_pct = round((last - previous) / previous * 100, 2)
            position.day_change = day_change_amount(
                position.market_value, position.day_change_pct
            )
            break


def _upsert_transactions(
    db: Session, account_id: int, transactions: list[ProviderTransaction]
) -> None:
    """Insert new trades and refresh fields on ones we already stored.

    Early Freedom24 parses mis-labelled every trade as `fee` with amount 0; a
    plain insert-if-missing left those rows frozen. Updating in place lets the
    next successful sync heal the tape.
    """
    existing = {
        row.external_id: row
        for row in db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.account_id == account_id)
        .all()
    }
    for txn in transactions:
        row = existing.get(txn.external_id)
        if row is None:
            db.add(
                InvestmentTransaction(
                    account_id=account_id,
                    external_id=txn.external_id,
                    type=txn.type,
                    symbol=txn.symbol,
                    quantity=txn.quantity,
                    price=txn.price,
                    amount=txn.amount,
                    currency=txn.currency,
                    date=txn.date,
                    raw_payload=str(txn.raw_payload),
                )
            )
            continue
        row.type = txn.type
        row.symbol = txn.symbol
        row.quantity = txn.quantity
        row.price = txn.price
        row.amount = txn.amount
        row.currency = txn.currency
        row.date = txn.date
        row.raw_payload = str(txn.raw_payload)


@dataclass
class _BackfillData:
    start: date
    closes_by_symbol: dict[str, dict[date, float]]


def _fetch_backfill_candles(
    db: Session,
    account: Account,
    provider,
    positions: list[ProviderPosition],
    transactions: list[ProviderTransaction],
    force: bool = False,
) -> Optional[_BackfillData]:
    """Network half of the history backfill; must run before any write.

    Returns None when no backfill is needed (provider can't do candles, or the
    account already has a usable series and `force` is off). Reads only, then
    releases the pooled connection before talking to the broker.
    """
    get_candles = getattr(provider, "get_candles", None)
    if not callable(get_candles):
        return None

    today = date.today()
    existing_count = (
        db.query(PortfolioSnapshot.date)
        .filter(PortfolioSnapshot.account_id == account.id)
        .count()
    )
    # Already have a usable series (today + at least one prior day).
    if existing_count >= 2 and not force:
        return None

    stored = (
        db.query(InvestmentTransaction.type, InvestmentTransaction.symbol, InvestmentTransaction.date)
        .filter(InvestmentTransaction.account_id == account.id)
        .all()
    )
    # The sync pulls the full tape, so stored + fetched is what the DB will hold
    # once the upsert below has run.
    trades = [(t.type, t.symbol, t.date) for t in stored] + [
        (t.type, t.symbol, t.date) for t in transactions
    ]
    symbols = {sym for typ, sym, _ in trades if sym and typ in ("buy", "sell")} | {
        p.symbol for p in positions if p.symbol
    }
    dates = [d.date() for _, _, d in trades if d]
    start = min(dates) if dates else today - timedelta(days=180)
    start = max(start, today - timedelta(days=_HISTORY_LOOKBACK_DAYS))

    # Return the connection to the pool for the duration of the network calls.
    db.rollback()

    closes_by_symbol: dict[str, dict[date, float]] = {}
    for symbol in symbols:
        try:
            candles: list[ProviderCandle] = get_candles(symbol, start, today)
        except Exception:  # noqa: BLE001 - one symbol must not kill the sync
            logger.warning(
                "Freedom24 getHloc failed for %s; skipping in history backfill",
                symbol,
                exc_info=True,
            )
            continue
        closes_by_symbol[symbol] = {c.date: c.close for c in candles if c.close}
    return _BackfillData(start=start, closes_by_symbol=closes_by_symbol)


def _backfill_portfolio_history(
    db: Session,
    account: Account,
    balance: ProviderBalance,
    positions: list[ProviderPosition],
    backfill: Optional[_BackfillData],
) -> None:
    """Fill missing daily snapshots so charts have something to draw.

    Freedom24 has no portfolio equity-curve endpoint. We rebuild one from the
    trade tape + daily closes (fetched beforehand by `_fetch_backfill_candles`),
    then shift the series so it ends on today's live balance. Existing snapshot
    dates are left alone (a real sync always wins over a reconstruction).
    Database-only: no network I/O happens here.
    """
    if backfill is None:
        return

    today = date.today()
    start = backfill.start
    closes_by_symbol = backfill.closes_by_symbol
    existing_dates = {
        row.date
        for row in db.query(PortfolioSnapshot.date)
        .filter(PortfolioSnapshot.account_id == account.id)
        .all()
    }
    txns = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.account_id == account.id)
        .order_by(InvestmentTransaction.date.asc())
        .all()
    )

    if not closes_by_symbol and not positions:
        return

    points = _reconstruct_daily_values(
        txns=txns,
        positions=positions,
        closes_by_symbol=closes_by_symbol,
        start=start,
        end=today,
        live_total=balance.total_value,
        live_cash=balance.cash_balance,
        live_positions=balance.positions_value,
        fx_rates=balance.fx_rates,
        base_currency=balance.currency,
    )

    for point in points:
        if point["date"] >= today or point["date"] in existing_dates:
            continue
        db.add(
            PortfolioSnapshot(
                account_id=account.id,
                date=point["date"],
                total_value=point["total_value"],
                cash_balance=point["cash_balance"],
                positions_value=point["positions_value"],
                currency=balance.currency,
            )
        )


def _reconstruct_daily_values(
    *,
    txns: list,
    positions: list[ProviderPosition],
    closes_by_symbol: dict[str, dict[date, float]],
    start: date,
    end: date,
    live_total: float,
    live_cash: float,
    live_positions: float,
    fx_rates: Optional[dict[str, float]] = None,
    base_currency: Optional[str] = None,
) -> list[dict]:
    """Replay trades day-by-day and mark positions to market with daily closes.

    Every amount and close is converted into the account currency with
    `fx_rates` (today's broker rates — the tape has no historical ones), so a
    USD buy no longer moves EUR cash by its USD figure.

    The tape has no deposits or withdrawals (no broker here reports them), so
    cash is rebuilt with the fewest external flows that explain it: replaying
    from zero, whenever trades would take cash below the floor a deposit is
    assumed to have arrived that day; whatever cash is left over at the end
    beyond the live balance is assumed withdrawn as early as the account
    could have paid it out. The old approach — replay trades alone, then shift the whole curve
    so it ends on today's balance — produced years of negative cash (-93.80 on
    the live Freedom24 account) and a total value that tripled overnight when
    the shift ran out, which every return figure then read as performance.

    Trades before `start` are replayed too (without emitting points), so the
    holdings and cash on the first charted day are the real ones.

    When the tape has no buy/sell rows, fall back to holding today's
    quantities constant and walking their historical closes, with cash flat.
    """
    rates = {k.upper(): v for k, v in (fx_rates or {}).items() if v}
    base = (base_currency or "").upper()

    def to_base(amount: float, currency: Optional[str]) -> float:
        ccy = (currency or base).upper()
        if not ccy or ccy == base:
            return amount
        return amount * rates.get(ccy, 1.0)

    symbol_ccy: dict[str, str] = {}
    for txn in txns:
        if txn.type in ("buy", "sell") and txn.symbol and txn.currency:
            symbol_ccy[txn.symbol] = txn.currency
    for position in positions:
        if position.currency:
            symbol_ccy[position.symbol] = position.currency

    events: dict[date, list] = defaultdict(list)
    for txn in txns:
        if not txn.date:
            continue
        day = txn.date.date() if isinstance(txn.date, datetime) else txn.date
        if day <= end:
            events[day].append(txn)

    has_trade_qty = any(t.type in ("buy", "sell") and t.symbol for t in txns)
    qty: dict[str, float] = defaultdict(float)
    last_close: dict[str, float] = {}

    if not has_trade_qty:
        for position in positions:
            qty[position.symbol] = position.quantity
            if position.current_price is not None:
                last_close[position.symbol] = position.current_price

    calendar_days: set[date] = {d for d in events if d >= start}
    for closes in closes_by_symbol.values():
        calendar_days.update(d for d in closes if start <= d <= end)
    calendar_days.add(end)

    def apply(txn) -> float:
        """Book one transaction's quantity; return its cash effect in base."""
        if txn.type in ("buy", "sell") and txn.symbol and txn.quantity is not None:
            signed = abs(txn.quantity) if txn.type == "buy" else -abs(txn.quantity)
            qty[txn.symbol] = qty.get(txn.symbol, 0.0) + signed
            if abs(qty[txn.symbol]) < 1e-9:
                qty[txn.symbol] = 0.0
            # Until a close arrives, the trade price is the best mark there is.
            if txn.price and txn.symbol not in last_close:
                last_close[txn.symbol] = txn.price
        return to_base(float(txn.amount or 0.0), txn.currency)

    # Trading cash effect per emitted day (pre-start activity folds into the first).
    trade_cash: list[float] = []
    pending = 0.0
    if has_trade_qty:
        for day in sorted(d for d in events if d < start):
            for txn in events[day]:
                pending += apply(txn)

    raw: list[dict] = []
    for day in sorted(calendar_days):
        effect = pending
        pending = 0.0
        if has_trade_qty:
            for txn in events.get(day, []):
                effect += apply(txn)

        for symbol, closes in closes_by_symbol.items():
            if day in closes:
                last_close[symbol] = closes[day]

        positions_value = 0.0
        for symbol, quantity in qty.items():
            if not quantity:
                continue
            price = last_close.get(symbol)
            if price is None:
                continue
            positions_value += to_base(quantity * price, symbol_ccy.get(symbol))

        trade_cash.append(effect)
        raw.append({"date": day, "positions_value": positions_value})

    if not raw:
        return []

    if has_trade_qty:
        cash_path = _minimal_flow_cash_path(trade_cash, live_cash)
    else:
        cash_path = [live_cash] * len(raw)

    for point, cash in zip(raw, cash_path):
        point["cash_balance"] = round(cash, 2)
        point["positions_value"] = round(point["positions_value"], 2)
        point["total_value"] = round(cash + point["positions_value"], 2)

    raw[-1]["cash_balance"] = round(live_cash, 2)
    raw[-1]["positions_value"] = round(live_positions, 2)
    raw[-1]["total_value"] = round(live_total, 2)
    return raw


def _minimal_flow_cash_path(effects: list[float], live_cash: float) -> list[float]:
    """Cash per day from daily trading effects, with the fewest assumed flows.

    The floor is zero, or the live balance when that is already negative (a
    commission can leave a broker account slightly overdrawn). Deposits are
    added the day cash would otherwise breach the floor; any surplus over the
    live balance at the end is withdrawn from the earliest day after which the
    account could have paid it out without breaching the floor.
    """
    floor = min(0.0, live_cash)
    path: list[float] = []
    cash = 0.0
    for effect in effects:
        cash += effect
        if cash < floor:
            cash = floor
        path.append(cash)

    surplus = path[-1] - live_cash
    if surplus < 0:
        # More cash now than trades explain: an earlier deposit sat idle.
        return [c - surplus for c in path]
    if surplus > 0:
        cut = len(path) - 1
        running_min = path[-1]
        for i in range(len(path) - 1, -1, -1):
            running_min = min(running_min, path[i])
            if running_min - surplus < floor - 1e-9:
                break
            cut = i
        path = path[:cut] + [c - surplus for c in path[cut:]]
    return path


def sync_all_investment_accounts(session_factory) -> None:
    """Sync every brokerage-linked account, isolating failures per account."""
    db = session_factory()
    try:
        accounts = db.query(Account).filter(Account.provider.isnot(None)).all()
        for account in accounts:
            sync_account(db, account)
    except Exception:
        logger.exception("Investment sync tick failed")
    finally:
        db.close()


def create_credential(
    db: Session, account_id: int, provider: str, public_key: str, private_key: str
) -> InvestmentCredential:
    credential = InvestmentCredential(
        account_id=account_id,
        provider=provider,
        encrypted_public_key=encrypt(public_key),
        encrypted_private_key=encrypt(private_key),
        sync_status="pending",
    )
    db.add(credential)
    db.commit()
    db.refresh(credential)
    return credential
