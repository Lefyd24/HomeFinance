"""Pull transactions from linked bank accounts and write them into the ledger.

Called from routers/bank_sync.py (manual sync) and from the scheduler's daily
bank_sync_tick. Deliberately does NOT go through TransactionService: that commits
once per transaction and mutates account.balance as a running total, both of which
are wrong here — a sync writes in bulk, and for a linked account the bank's
reported balance is the source of truth.
"""

import hashlib
import logging
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Account, BankConnection, Transaction
from app.services import enable_banking_client as eb
from app.utils import crypto

logger = logging.getLogger("app.bank_sync")

# Balance types in preference order. ITBD/CLBD are booked balances, which match
# what we import (booked transactions only); ITAV/available includes pending
# authorisations and would disagree with the transaction list.
_BALANCE_PREFERENCE = ("ITBD", "CLBD", "ITAV", "XPCD", "OTHR")

STATE_TTL_MINUTES = 15


def generate_state() -> str:
    """Opaque single-use nonce binding a bank callback back to a user."""
    return secrets.token_urlsafe(32)[:64]


# --- normalisation --------------------------------------------------------


def _decimal(value: Any) -> Decimal | None:
    """Enable Banking sends amounts as decimal STRINGS, always positive."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _description(raw: dict[str, Any]) -> str:
    """Best human-readable label available.

    remittance_information is an array of free-text lines; when the bank sends
    nothing useful, the counterparty name is the next best thing. Greek banks
    are often terse here, which is why synced rows land uncategorised.
    """
    parts = raw.get("remittance_information") or []
    if isinstance(parts, str):
        parts = [parts]
    text = " ".join(str(p).strip() for p in parts if p and str(p).strip()).strip()
    if text:
        return text[:500]

    is_credit = raw.get("credit_debit_indicator") == "CRDT"
    counterparty = (raw.get("debtor") if is_credit else raw.get("creditor")) or {}
    name = (counterparty.get("name") or "").strip()
    if name:
        return name[:500]

    code = raw.get("bank_transaction_code") or {}
    return (code.get("description") or "Bank transaction")[:500]


def build_external_id(raw: dict[str, Any], account: Account) -> str:
    """Stable dedup key, scoped to the account.

    `entry_reference` is the only identifier Enable Banking documents as unique
    and immutable across authorisation sessions — `transaction_id` explicitly is
    NOT ("may change if the list of transactions is retrieved again"), so it must
    never be used here. Entry references are only unique *within* an account, so
    the local account id is prefixed to keep them distinct under the
    (user_id, external_id) constraint.

    When a bank omits entry_reference entirely, fall back to a hash of the
    transaction's stable content. That is weaker — two genuinely identical
    same-day transactions collapse into one — but it is far better than
    duplicating every row on every sync.
    """
    entry_reference = (raw.get("entry_reference") or "").strip()
    if entry_reference:
        return f"{account.id}:{entry_reference}"

    amount = raw.get("transaction_amount") or {}
    digest = hashlib.sha256(
        "|".join(
            [
                str(account.id),
                str(raw.get("booking_date") or raw.get("value_date") or ""),
                str(amount.get("amount") or ""),
                str(amount.get("currency") or ""),
                str(raw.get("credit_debit_indicator") or ""),
                _description(raw),
            ]
        ).encode()
    ).hexdigest()
    return f"{account.id}:h:{digest[:40]}"


def normalize_transaction(raw: dict[str, Any], account: Account) -> dict[str, Any] | None:
    """Map one Enable Banking transaction onto our Transaction fields.

    Returns None for anything that must not enter the ledger.
    """
    # Booked only. Pending (PDNG) entries mutate and disappear, and would either
    # duplicate once booked or leave phantom rows behind. HOLD/RJCT/CNCL likewise.
    if raw.get("status") != "BOOK":
        return None

    amount = _decimal((raw.get("transaction_amount") or {}).get("amount"))
    if amount is None:
        logger.warning("Skipping transaction with unparseable amount on account %s", account.id)
        return None

    tx_date = _parse_date(
        raw.get("booking_date") or raw.get("value_date") or raw.get("transaction_date")
    )
    if tx_date is None:
        logger.warning("Skipping transaction with no usable date on account %s", account.id)
        return None

    # The amount is always positive; direction lives in credit_debit_indicator.
    is_credit = raw.get("credit_debit_indicator") == "CRDT"

    return {
        "user_id": account.user_id,
        "account_id": account.id,
        "category_id": None,  # categorised by the user afterwards
        "amount": abs(float(amount)),
        "type": "income" if is_credit else "expense",
        "description": _description(raw),
        "date": tx_date,
        "is_imported": True,
        "source_file": f"bank-sync:{account.name}",
        "external_id": build_external_id(raw, account),
    }


def _pick_balance(balances: list[dict[str, Any]]) -> float | None:
    """The bank's own balance figure, preferring booked over available."""
    by_type: dict[str, float] = {}
    for entry in balances or []:
        value = _decimal((entry.get("balance_amount") or {}).get("amount"))
        if value is None:
            continue
        by_type[str(entry.get("balance_type") or "OTHR").upper()] = float(value)

    for balance_type in _BALANCE_PREFERENCE:
        if balance_type in by_type:
            return by_type[balance_type]
    return next(iter(by_type.values()), None)


# --- writing --------------------------------------------------------------


def _write_transactions(db: Session, account: Account, rows: list[dict[str, Any]]) -> int:
    """Insert new transactions, skipping any we already hold. Does not commit.

    Dedup is done by pre-loading the existing external_ids for this account
    rather than relying on IntegrityError: a failed insert would poison the
    whole session and abort the rest of the sync.
    """
    if not rows:
        return 0

    incoming_ids = {row["external_id"] for row in rows}
    existing = {
        external_id
        for (external_id,) in db.query(Transaction.external_id)
        .filter(
            Transaction.user_id == account.user_id,
            Transaction.external_id.in_(incoming_ids),
        )
        .all()
    }

    inserted = 0
    seen: set[str] = set()
    for row in rows:
        external_id = row["external_id"]
        # `seen` also guards against duplicates *within* one response, which the
        # hash fallback can produce for genuinely identical same-day rows.
        if external_id in existing or external_id in seen:
            continue
        seen.add(external_id)
        db.add(Transaction(**row))
        inserted += 1

    return inserted


def sync_account(db: Session, account: Account) -> dict[str, Any]:
    """Sync one linked account. Does not commit — the caller owns the transaction."""
    if not account.external_account_id:
        raise eb.EnableBankingError(f"Account {account.id} has no Enable Banking UID")

    if account.last_synced_at:
        # Re-fetch an overlap window: banks backdate bookings, so a strict
        # "since last sync" cutoff silently drops transactions. Duplicates are
        # absorbed by the dedup above.
        date_from = (account.last_synced_at - timedelta(days=settings.EB_SYNC_OVERLAP_DAYS)).date()
    else:
        date_from = (datetime.utcnow() - timedelta(days=settings.EB_INITIAL_HISTORY_DAYS)).date()

    raw_transactions = eb.get_transactions(account.external_account_id, date_from=date_from)
    rows = [
        row
        for row in (normalize_transaction(raw, account) for raw in raw_transactions)
        if row is not None
    ]
    inserted = _write_transactions(db, account, rows)

    # The bank owns the balance of a linked account (see routers/accounts.py,
    # which blocks manual balance edits on these).
    balance = _pick_balance(eb.get_balances(account.external_account_id))
    if balance is not None:
        account.balance = round(balance, 2)

    account.last_synced_at = datetime.utcnow()
    account.sync_status = "ok"

    return {
        "account_id": account.id,
        "fetched": len(raw_transactions),
        "imported": inserted,
        "balance": account.balance,
    }


def sync_connection(db: Session, connection: BankConnection) -> dict[str, Any]:
    """Sync every linked account on one connection.

    Commits once at the end. Per-account failures are recorded and skipped so
    one unhappy account cannot block the others.
    """
    result: dict[str, Any] = {
        "connection_id": connection.id,
        "accounts": [],
        "imported": 0,
        "errors": [],
    }

    if not connection.is_usable:
        connection.status = "expired" if connection.status == "active" else connection.status
        db.commit()
        raise eb.ConsentExpired(
            f"The consent for {connection.aspsp_name} has expired — reconnect the bank."
        )

    # Account UIDs are addressed directly with the application JWT, so the
    # session id is not needed to fetch data — but decrypting it here fails fast
    # on a rotated SECRET_KEY / NOTIFICATION_ENCRYPTION_KEY, before burning the
    # account's small daily API quota on calls we could not revoke afterwards.
    try:
        crypto.decrypt(connection.session_id_encrypted or "")
    except crypto.DecryptionError as exc:
        connection.status = "error"
        connection.last_sync_error = str(exc)
        db.commit()
        raise eb.EnableBankingError(str(exc)) from exc

    accounts = (
        db.query(Account)
        .filter(
            Account.bank_connection_id == connection.id,
            Account.user_id == connection.user_id,
            Account.is_linked.is_(True),
            Account.is_active.is_(True),
        )
        .all()
    )

    for account in accounts:
        try:
            stats = sync_account(db, account)
            result["accounts"].append(stats)
            result["imported"] += stats["imported"]
        except eb.ConsentExpired:
            # Applies to the whole connection, not just this account — stop and
            # let the user re-authorise.
            connection.status = "expired"
            connection.last_sync_error = "Consent expired"
            db.commit()
            raise
        except eb.RateLimited as exc:
            # Expected: banks allow as few as 4 AIS calls per account per day.
            # Leave last_synced_at alone so the next tick retries this window.
            logger.info("Rate limited syncing account %s: %s", account.id, exc)
            account.sync_status = "rate_limited"
            result["errors"].append({"account_id": account.id, "error": "rate_limited"})
        except eb.EnableBankingError as exc:
            logger.warning("Failed to sync account %s: %s", account.id, exc)
            account.sync_status = "error"
            result["errors"].append({"account_id": account.id, "error": str(exc)})

    connection.last_sync_at = datetime.utcnow()
    connection.last_sync_error = (
        None if not result["errors"] else f"{len(result['errors'])} account(s) failed"
    )
    # Silence is the failure mode that matters here — an empty account list means
    # the user completed SCA but nothing was whitelisted in the Control Panel.
    if not accounts:
        logger.warning(
            "Connection %s (user %s) has no linked accounts to sync",
            connection.id,
            connection.user_id,
        )

    db.commit()
    return result


def sync_all_users(session_factory) -> None:
    """Scheduler entrypoint: sync every active connection across every user."""
    if not eb.is_configured():
        return

    db = session_factory()
    try:
        connections = (
            db.query(BankConnection).filter(BankConnection.status == "active").all()
        )
        logger.info("Bank sync tick: %s active connection(s)", len(connections))
        for connection in connections:
            try:
                stats = sync_connection(db, connection)
                logger.info(
                    "Synced connection %s (user %s): %s new transaction(s)",
                    connection.id,
                    connection.user_id,
                    stats["imported"],
                )
            except eb.ConsentExpired:
                logger.info(
                    "Connection %s (user %s) needs re-authorisation",
                    connection.id,
                    connection.user_id,
                )
            except Exception:
                logger.exception("Bank sync failed for connection %s", connection.id)
                db.rollback()
    except Exception:
        logger.exception("Bank sync tick failed")
    finally:
        db.close()
