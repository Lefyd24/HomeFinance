import logging
from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (
    Account,
    InvestmentCredential,
    InvestmentTransaction,
    PortfolioPosition,
    PortfolioSnapshot,
)
from app.services.investment_providers import get_provider
from app.services.investment_providers.base import (
    ProviderBalance,
    ProviderCandle,
    ProviderPosition,
    ProviderTransaction,
)
from app.utils.crypto import decrypt, encrypt, DecryptionError

logger = logging.getLogger("app.investments")

# Charts need ≥2 points; without a backfill a brand-new account only has today's
# sync snapshot and sparklines stay blank until the next calendar day.
_HISTORY_LOOKBACK_DAYS = 365 * 2


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

        account.balance = round(balance.total_value, 2)
        account.currency = balance.currency
        account.last_synced_at = datetime.utcnow()

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

        _backfill_portfolio_history(db, account, provider, balance, positions)

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


def _backfill_portfolio_history(
    db: Session,
    account: Account,
    provider,
    balance: ProviderBalance,
    positions: list[ProviderPosition],
) -> None:
    """Fill missing daily snapshots so charts have something to draw.

    Freedom24 has no portfolio equity-curve endpoint. We rebuild one from the
    trade tape + daily closes (`getHloc` / `get_candles`), then shift the series
    so it ends on today's live balance. Existing snapshot dates are left alone
    (a real sync always wins over a reconstruction).
    """
    get_candles = getattr(provider, "get_candles", None)
    if not callable(get_candles):
        return

    today = date.today()
    existing_dates = {
        row.date
        for row in db.query(PortfolioSnapshot.date)
        .filter(PortfolioSnapshot.account_id == account.id)
        .all()
    }
    # Already have a usable series (today + at least one prior day).
    if len(existing_dates) >= 2:
        return

    txns = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.account_id == account.id)
        .order_by(InvestmentTransaction.date.asc())
        .all()
    )

    symbols = {
        t.symbol
        for t in txns
        if t.symbol and t.type in ("buy", "sell")
    } | {p.symbol for p in positions if p.symbol}

    if txns:
        start = min(t.date.date() for t in txns if t.date)
    else:
        start = today - timedelta(days=180)
    start = max(start, today - timedelta(days=_HISTORY_LOOKBACK_DAYS))

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
) -> list[dict]:
    """Replay trades day-by-day and mark positions to market with HLOC closes.

    When the tape has no buy/sell rows (or candles are missing), fall back to
    holding today's quantities constant and walking their historical closes —
    still enough for a sparkline, even if cash is held flat.
    """
    events: dict[date, list] = defaultdict(list)
    for txn in txns:
        if not txn.date:
            continue
        day = txn.date.date() if isinstance(txn.date, datetime) else txn.date
        if start <= day <= end:
            events[day].append(txn)

    has_trade_qty = any(t.type in ("buy", "sell") and t.symbol for t in txns)
    qty: dict[str, float] = defaultdict(float)
    cash = 0.0

    if not has_trade_qty:
        for position in positions:
            qty[position.symbol] = position.quantity
        cash = live_cash

    calendar_days: set[date] = set(events)
    for closes in closes_by_symbol.values():
        calendar_days.update(d for d in closes if start <= d <= end)
    # Always include endpoints so the series can be aligned to live totals.
    calendar_days.add(end)

    last_close: dict[str, float] = {}
    for position in positions:
        if position.current_price is not None:
            last_close[position.symbol] = position.current_price

    raw: list[dict] = []
    for day in sorted(calendar_days):
        if day < start or day > end:
            continue

        if has_trade_qty:
            for txn in events.get(day, []):
                if txn.type in ("buy", "sell") and txn.symbol and txn.quantity is not None:
                    signed = txn.quantity if txn.type == "buy" else -txn.quantity
                    qty[txn.symbol] = qty.get(txn.symbol, 0.0) + signed
                    if abs(qty[txn.symbol]) < 1e-9:
                        qty[txn.symbol] = 0.0
                cash += float(txn.amount or 0.0)

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
            positions_value += quantity * price

        raw.append(
            {
                "date": day,
                "cash_balance": cash,
                "positions_value": positions_value,
                "total_value": cash + positions_value,
            }
        )

    if not raw:
        return []

    # Shift cash so the series ends on the live total. Deposits/dividends are
    # missing from the Freedom24 trade tape, so absolute cash is usually wrong;
    # the day-to-day shape from marks and trades is still useful for charts.
    cash_offset = live_total - raw[-1]["total_value"]
    for point in raw:
        point["cash_balance"] = round(point["cash_balance"] + cash_offset, 2)
        point["positions_value"] = round(point["positions_value"], 2)
        point["total_value"] = round(point["cash_balance"] + point["positions_value"], 2)

    raw[-1]["cash_balance"] = round(live_cash, 2)
    raw[-1]["positions_value"] = round(live_positions, 2)
    raw[-1]["total_value"] = round(live_total, 2)
    return raw


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
