"""Pull transactions from linked bank accounts and write them into the ledger.

Called from routers/bank_sync.py (manual sync) and from the scheduler's daily
bank_sync_tick. Deliberately does NOT go through TransactionService: that commits
once per transaction and mutates account.balance as a running total, both of which
are wrong here — a sync writes in bulk, and for a linked account the bank's
reported balance is the source of truth.
"""

import hashlib
import logging
import re
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Account, BankConnection, Transaction
from app.services import enable_banking_client as eb
from app.utils import crypto

logger = logging.getLogger("app.bank_sync")

# Where AccountIcon (frontend/app/src/accounts/bankIcons.tsx) resolves
# `/assets/icons/banks/<file>` from. Two candidate write targets because dev
# and Docker serve icons from different places:
#  - frontend/app/public is Vite's dev public dir, served directly by
#    `vite dev` (this repo's normal local workflow).
#  - settings.FRONTEND_DIR is whatever the backend itself serves statically
#    (the built dist, copied to frontend/public in the Docker image) — the
#    directory manually-created accounts' icons already live in there.
# Writing to both keeps the two setups in sync; a missing directory is
# skipped rather than created, so this never conjures a frontend tree that
# doesn't already exist.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_BANK_ICON_DIRS = [
    _REPO_ROOT / "frontend" / "app" / "public" / "assets" / "icons" / "banks",
    Path(settings.FRONTEND_DIR) / "assets" / "icons" / "banks",
]

_LOGO_FETCH_TIMEOUT = 15.0
_CONTENT_TYPE_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
}

# Balance types in preference order. ITBD/CLBD are booked balances, which match
# what we import (booked transactions only); ITAV/available includes pending
# authorisations and would disagree with the transaction list.
_BALANCE_PREFERENCE = ("ITBD", "CLBD", "ITAV", "XPCD", "OTHR")
# ITAV (interim available) already nets off pending authorisations, so it is the
# figure that ties to a ledger containing them.
_BALANCE_PREFERENCE_WITH_PENDING = ("ITAV", "ITBD", "CLBD", "XPCD", "OTHR")

STATE_TTL_MINUTES = 15

# Progressively narrower windows tried when a bank refuses the requested range.
# 90 days is the floor most institutions fall back to once the post-authorisation
# full-history window has closed; 30 and 7 cover banks that are stricter still.
_FALLBACK_WINDOW_DAYS = (90, 30, 7)


def generate_state() -> str:
    """Opaque single-use nonce binding a bank callback back to a user."""
    return secrets.token_urlsafe(32)[:64]


def _icon_slug(aspsp_name: str, aspsp_country: str) -> str:
    """Filesystem- and URL-safe stem, e.g. "Eurobank" + "GR" -> "eurobank-gr"."""
    slug = re.sub(r"[^a-z0-9]+", "-", aspsp_name.strip().lower()).strip("-")
    return f"{slug or 'bank'}-{aspsp_country.strip().lower()}"


def _find_existing_icon(slug: str) -> str | None:
    """An already-downloaded icon for this bank, if any directory has one.

    Checked by stem rather than a fixed extension because the extension is
    whatever Enable Banking served the first time this bank was linked.
    """
    for directory in _BANK_ICON_DIRS:
        if not directory.is_dir():
            continue
        for match in directory.glob(f"{slug}.*"):
            return match.name
    return None


def _write_icon(filename: str, content: bytes) -> None:
    for directory in _BANK_ICON_DIRS:
        # Only write where the frontend tree already exists — never create it,
        # this is a best-effort enrichment, not something that should conjure
        # directories in an unexpected layout.
        if not directory.is_dir():
            continue
        try:
            (directory / filename).write_bytes(content)
        except OSError as exc:
            logger.warning("Could not write bank icon to %s: %s", directory, exc)


def get_or_fetch_bank_icon(aspsp_name: str, aspsp_country: str) -> str | None:
    """Persist the ASPSP's real logo locally and return its filename, or None.

    Mirrors how manually-created accounts pick an icon: a filename under
    frontend/app/public/assets/icons/banks/, resolved by bankIconSrc() at
    render time. Downloaded once per bank (matched by slug) rather than on
    every account link, both to avoid hammering the bank directory and
    because Enable Banking's logo URL is stable per ASPSP.

    Never raises: a failure here must not break account linking, so every
    step downgrades to a logged warning and a None return.
    """
    slug = _icon_slug(aspsp_name, aspsp_country)

    existing = _find_existing_icon(slug)
    if existing:
        return existing

    try:
        aspsps = eb.list_aspsps(aspsp_country)
    except eb.EnableBankingError as exc:
        logger.warning(
            "Could not list ASPSPs to find a logo for %s (%s): %s",
            aspsp_name,
            aspsp_country,
            exc,
        )
        return None

    logo_url = next(
        (
            a.get("logo")
            for a in aspsps
            if isinstance(a, dict) and a.get("name") == aspsp_name and a.get("logo")
        ),
        None,
    )
    if not logo_url:
        logger.info("No logo URL from Enable Banking for %s (%s)", aspsp_name, aspsp_country)
        return None

    try:
        with httpx.Client(timeout=_LOGO_FETCH_TIMEOUT, follow_redirects=True) as client:
            response = client.get(logo_url)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Failed to download bank logo for %s: %s", aspsp_name, exc)
        return None

    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    ext = _CONTENT_TYPE_EXTENSIONS.get(content_type) or Path(logo_url.split("?")[0]).suffix
    if not ext or len(ext) > 5:
        ext = ".png"

    filename = f"{slug}{ext}"
    _write_icon(filename, response.content)
    return filename


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


def _content_hash(raw: dict[str, Any], account: Account) -> str:
    amount = raw.get("transaction_amount") or {}
    return hashlib.sha256(
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
    # Pending entries get their own namespace and never use entry_reference:
    # Enable Banking documents it as supplied "only for booked transactions" in
    # most cases, and where a pending id does exist it may change on booking.
    # A pending row must therefore never collide with the booked row it becomes,
    # or the booked one would be silently dropped as a duplicate.
    if raw.get("status") == "PDNG":
        return f"{account.id}:pending:{_content_hash(raw, account)[:40]}"

    entry_reference = (raw.get("entry_reference") or "").strip()
    if entry_reference:
        return f"{account.id}:{entry_reference}"

    return f"{account.id}:h:{_content_hash(raw, account)[:40]}"


def normalize_transaction(raw: dict[str, Any], account: Account) -> dict[str, Any] | None:
    """Map one Enable Banking transaction onto our Transaction fields.

    Returns None for anything that must not enter the ledger.
    """
    # BOOK is always imported. PDNG only when the user opted in, because pending
    # entries mutate and disappear — they are handled by wholesale replacement
    # rather than dedup (see _replace_pending). HOLD/RJCT/CNCL/SCHD never are:
    # they represent money that has not moved and may never move.
    status = raw.get("status")
    if status == "PDNG":
        if not settings.EB_INCLUDE_PENDING:
            return None
    elif status != "BOOK":
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
        "is_pending": status == "PDNG",
    }


def _pick_balance(balances: list[dict[str, Any]]) -> float | None:
    """The bank's own balance figure, matched to the transactions we import.

    Which balance is "right" depends on what the ledger contains. Importing only
    booked entries means the booked balance is the one that reconciles; once
    pending entries are in the ledger too, the available balance is, because it
    is the one that already reflects them. Picking the wrong one leaves the
    account total permanently disagreeing with the sum of its transactions.
    """
    preference = (
        _BALANCE_PREFERENCE_WITH_PENDING
        if settings.EB_INCLUDE_PENDING
        else _BALANCE_PREFERENCE
    )
    by_type: dict[str, float] = {}
    for entry in balances or []:
        value = _decimal((entry.get("balance_amount") or {}).get("amount"))
        if value is None:
            continue
        by_type[str(entry.get("balance_type") or "OTHR").upper()] = float(value)

    for balance_type in preference:
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


def _replace_pending(db: Session, account: Account, rows: list[dict[str, Any]]) -> int:
    """Swap this account's pending rows for the set the bank currently reports.

    Pending entries cannot be reconciled by identifier — Enable Banking supplies
    entry_reference "only for booked transactions" in most cases, and any id a
    bank does give may change once the entry books. Matching on it would leave
    phantom rows behind for every pending entry that settled, was reversed, or
    had its amount adjusted.

    Deleting and re-inserting the whole set sidesteps all of that: whatever the
    bank says is pending right now is exactly what the ledger holds. Booked rows
    are untouched, so nothing durable is ever at risk.
    """
    db.query(Transaction).filter(
        Transaction.user_id == account.user_id,
        Transaction.account_id == account.id,
        Transaction.is_pending.is_(True),
    ).delete(synchronize_session=False)

    seen: set[str] = set()
    inserted = 0
    for row in rows:
        # The content hash can collide for two genuinely identical same-day
        # pending entries; the unique index would reject the second.
        if row["external_id"] in seen:
            continue
        seen.add(row["external_id"])
        db.add(Transaction(**row))
        inserted += 1
    return inserted


def _fetch_with_fallback(
    account: Account, date_from: date, strategy: str
) -> list[dict[str, Any]]:
    """Fetch transactions, narrowing the window when the bank refuses it.

    Banks cap how far back they will serve, and that cap tightens sharply once
    the account has been authorised for a while — Enable Banking documents full
    history as reachable only for "typically around one hour" after
    authorisation, after which many institutions allow just 90 days.

    Worse, they are inconsistent about saying so: some return the precise
    WRONG_TRANSACTIONS_PERIOD, others a bare ASPSP_ERROR / "Unknown error". Both
    are treated the same here — step the window down and try again, rather than
    failing the whole account and importing nothing.
    """
    attempts: list[tuple[date, str]] = [(date_from, strategy)]
    today = datetime.utcnow().date()
    for days in _FALLBACK_WINDOW_DAYS:
        candidate = today - timedelta(days=days)
        if candidate > date_from:
            attempts.append((candidate, "default"))

    last_error: Exception | None = None
    for attempt_from, attempt_strategy in attempts:
        try:
            return eb.get_transactions(
                account.external_account_id,
                date_from=attempt_from,
                strategy=attempt_strategy,
            )
        except (eb.WrongTransactionsPeriod, eb.AspspError) as exc:
            last_error = exc
            # The very first attempt of a `longest` request is the one that
            # matters: if IT falls back, this account is about to get stuck on
            # a narrow window until it is re-authorised (see _link_accounts),
            # since last_synced_at is stamped after this call regardless of
            # which window actually succeeded. That is worth a WARNING, not an
            # INFO buried among routine incremental-sync retries.
            is_full_history_attempt = attempt_strategy == strategy == "longest"
            log = logger.warning if is_full_history_attempt else logger.info
            log(
                "Account %s rejected transactions from %s (strategy=%s): %s — "
                "narrowing window%s",
                account.id,
                attempt_from,
                attempt_strategy,
                exc,
                " (full-history request failed on first sync — this account "
                "will only get recent history until reconnected)"
                if is_full_history_attempt
                else "",
            )

    assert last_error is not None
    raise last_error


def sync_account(db: Session, account: Account) -> dict[str, Any]:
    """Sync one linked account. Does not commit — the caller owns the transaction."""
    if not account.external_account_id:
        raise eb.EnableBankingError(f"Account {account.id} has no Enable Banking UID")

    if account.last_synced_at:
        # Re-fetch an overlap window: banks backdate bookings, so a strict
        # "since last sync" cutoff silently drops transactions. Duplicates are
        # absorbed by the dedup above.
        date_from = (account.last_synced_at - timedelta(days=settings.EB_SYNC_OVERLAP_DAYS)).date()
        strategy = "default"
    else:
        date_from = (datetime.utcnow() - timedelta(days=settings.EB_INITIAL_HISTORY_DAYS)).date()
        # First pull: we have no idea how much history this bank will serve, and
        # asking for more than it allows is rejected outright. `longest` lets
        # Enable Banking discover the earliest available transaction instead.
        strategy = "longest"

    # One call returns both booked and pending entries — the response is not
    # filtered by status. Splitting them here rather than making a second
    # request matters: banks allow as few as 4 AIS calls per account per day.
    raw_transactions = _fetch_with_fallback(account, date_from, strategy)
    if strategy == "longest" and raw_transactions:
        # Diagnostic for exactly the failure mode that prompted this comment:
        # a sync can succeed (no exception, no window-narrowing) while still
        # only returning a fraction of the account's real history, because the
        # ASPSP itself limits it — either via the SCA consent scope or its own
        # data retention. Logging the earliest date actually received makes
        # that visible without having to reproduce the sync to find out.
        earliest = min(
            _parse_date(raw.get("booking_date") or raw.get("value_date") or raw.get("transaction_date"))
            or date_from
            for raw in raw_transactions
        )
        logger.info(
            "Account %s: full-history sync returned %s transaction(s), earliest dated %s "
            "(requested from %s)",
            account.id,
            len(raw_transactions),
            earliest,
            date_from,
        )
    rows = [
        row
        for row in (normalize_transaction(raw, account) for raw in raw_transactions)
        if row is not None
    ]
    booked = [row for row in rows if not row["is_pending"]]
    pending = [row for row in rows if row["is_pending"]]

    # Categorise before insert so new rows land with a category. Rules are
    # loaded once for the whole batch — per-row loads would thrash SQLite on a
    # first sync of a year of history.
    from app.services import rule_service

    rules = rule_service.load_rules(db, account.user_id)
    for row in booked + pending:
        category_id = rule_service.categorise(db, account.user_id, row, rules=rules)
        if category_id is not None:
            row["category_id"] = category_id

    inserted = _write_transactions(db, account, booked)
    pending_count = 0
    if settings.EB_INCLUDE_PENDING:
        # Always run, even with an empty list: that is how entries that settled
        # or were dropped since the last sync get cleared out.
        pending_count = _replace_pending(db, account, pending)

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
        "pending": pending_count,
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
