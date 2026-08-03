"""Bank account connection and sync (Enable Banking / PSD2).

Flow:
    POST /connections/start  -> persist a pending connection carrying a nonce,
                                return the bank's authorisation URL
    [user authenticates at their bank, completes SCA]
    GET  /callback           -> bank redirects the browser here with code+state;
                                exchange for a session, create linked accounts,
                                then redirect the browser back to the frontend
    POST /connections/{id}/sync -> manual re-sync (rate-limit aware)
"""

import logging
from datetime import datetime, timedelta
from typing import List
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Account, BankConnection, Transaction, User
from app.schemas import (
    BankConnectionResponse,
    ConnectionStartRequest,
    ConnectionStartResponse,
    InstitutionResponse,
    SyncResultResponse,
)
from app.services import bank_sync_service, enable_banking_client as eb
from app.utils import crypto
from app.utils.security import get_current_user_authenticated

logger = logging.getLogger("app.bank_sync")

router = APIRouter(prefix="/bank-sync", tags=["Bank Sync"])


def _require_enabled() -> None:
    if not eb.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Bank sync is not configured on this server. Set BANK_SYNC_ENABLED "
                "and the Enable Banking credentials in .env."
            ),
        )


def _frontend_redirect(**params: str) -> RedirectResponse:
    """Send the browser back to the SPA with a short status in the query string."""
    base = (settings.FRONTEND_BASE_URL or settings.PUBLIC_BASE_URL or "").rstrip("/")
    return RedirectResponse(url=f"{base}/connections?{urlencode(params)}", status_code=303)


def _owned_connection(db: Session, connection_id: int, user: User) -> BankConnection:
    connection = (
        db.query(BankConnection)
        .filter(BankConnection.id == connection_id, BankConnection.user_id == user.id)
        .first()
    )
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found"
        )
    return connection


@router.get("/institutions", response_model=List[InstitutionResponse])
def list_institutions(
    country: str = Query(default="GR", pattern="^[A-Za-z]{2}$"),
    current_user: User = Depends(get_current_user_authenticated),
):
    """Banks available in a country. Greek ASPSPs: Eurobank, Alpha, Piraeus, NBG."""
    _require_enabled()
    try:
        return eb.list_aspsps(country)
    except eb.EnableBankingError as exc:
        logger.warning("Failed to list institutions for %s: %s", country, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach the bank directory. Try again shortly.",
        ) from exc


@router.get("/connections", response_model=List[BankConnectionResponse])
def list_connections(
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """This user's bank connections. Never exposes the session credential."""
    connections = (
        db.query(BankConnection)
        .filter(
            BankConnection.user_id == current_user.id,
            # Abandoned authorisation attempts are noise, not connections.
            BankConnection.status != "pending",
        )
        .order_by(BankConnection.created_at.desc())
        .all()
    )
    # `accounts` is populated from the ORM relationship; unlinking clears
    # bank_connection_id, so it always reflects the currently linked set.
    return connections


@router.post("/connections/start", response_model=ConnectionStartResponse)
def start_connection(
    payload: ConnectionStartRequest,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Begin linking a bank; returns the URL to send the user's browser to."""
    _require_enabled()

    state = bank_sync_service.generate_state()
    connection = BankConnection(
        user_id=current_user.id,
        aspsp_name=payload.aspsp_name,
        aspsp_country=payload.aspsp_country.upper(),
        status="pending",
        state=state,
        state_expires_at=datetime.utcnow()
        + timedelta(minutes=bank_sync_service.STATE_TTL_MINUTES),
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)

    try:
        result = eb.start_authorization(
            aspsp_name=payload.aspsp_name,
            aspsp_country=payload.aspsp_country,
            state=state,
        )
    except eb.EnableBankingError as exc:
        connection.status = "error"
        connection.last_sync_error = str(exc)
        db.commit()
        logger.warning("Failed to start authorisation for %s: %s", payload.aspsp_name, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start the bank authorisation. Try again shortly.",
        ) from exc

    url = result.get("url") or result.get("authorization_url")
    if not url:
        connection.status = "error"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The bank did not return an authorisation URL.",
        )

    return ConnectionStartResponse(connection_id=connection.id, authorization_url=url)


def _initial_sync(connection_id: int) -> None:
    """First pull for a freshly linked connection, run just after the redirect.

    Timing is the point. Enable Banking documents full transaction history as
    reachable only for a short window after authorisation — "typically around
    one hour" — after which many banks clamp retrieval to the last 90 days.
    Waiting for the nightly tick would routinely miss that window and silently
    import a fraction of the available history.

    Runs as a background task with its own session: the browser is mid-redirect
    and must not wait on several round trips to the bank.
    """
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        connection = db.get(BankConnection, connection_id)
        if connection is None or connection.status != "active":
            return
        result = bank_sync_service.sync_connection(db, connection)
        logger.info(
            "Initial sync for connection %s imported %s transaction(s)",
            connection_id,
            result["imported"],
        )
    except Exception:
        # Never surface this: the link itself succeeded, and the scheduled tick
        # will retry. Failing loudly here would make a working connection look broken.
        logger.exception("Initial sync failed for connection %s", connection_id)
        db.rollback()
    finally:
        db.close()


@router.get("/callback")
def bank_callback(
    background_tasks: BackgroundTasks,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Handle the bank's redirect after SCA.

    Deliberately UNAUTHENTICATED: this is a browser redirect arriving from the
    bank, so it carries no Authorization header and no usable session. The
    `state` nonce is therefore the only thing binding this request to a user —
    it is looked up, checked for expiry and prior use, and the user identity is
    taken FROM THE STORED ROW. Nothing user-controlled in the query string is
    ever trusted to identify a user.

    Always redirects the browser rather than returning JSON; the user is looking
    at a page, not calling an API.
    """
    if not state:
        return _frontend_redirect(linked="0", error="missing_state")

    connection = db.query(BankConnection).filter(BankConnection.state == state).first()
    if not connection:
        logger.warning("Bank callback with unknown state")
        return _frontend_redirect(linked="0", error="invalid_state")

    # Single use: a replayed callback must not re-link or re-exchange.
    if connection.state_used_at is not None:
        logger.warning("Bank callback replayed for connection %s", connection.id)
        return _frontend_redirect(linked="0", error="state_already_used")

    if connection.state_expires_at and connection.state_expires_at < datetime.utcnow():
        logger.info("Bank callback with expired state for connection %s", connection.id)
        connection.status = "error"
        connection.last_sync_error = "Authorisation timed out"
        db.commit()
        return _frontend_redirect(linked="0", error="state_expired")

    connection.state_used_at = datetime.utcnow()
    db.commit()

    if error or not code:
        connection.status = "error"
        connection.last_sync_error = f"Bank returned: {error or 'no authorisation code'}"
        db.commit()
        return _frontend_redirect(linked="0", error="bank_declined")

    try:
        session = eb.create_session(code)
    except eb.EnableBankingError as exc:
        logger.warning("Session exchange failed for connection %s: %s", connection.id, exc)
        connection.status = "error"
        connection.last_sync_error = str(exc)
        db.commit()
        return _frontend_redirect(linked="0", error="session_failed")

    session_id = session.get("session_id") or session.get("id")
    if not session_id:
        connection.status = "error"
        connection.last_sync_error = "Enable Banking returned no session id"
        db.commit()
        return _frontend_redirect(linked="0", error="session_failed")

    connection.session_id_encrypted = crypto.encrypt(str(session_id))
    connection.status = "active"
    connection.last_sync_error = None

    granted = (session.get("access") or {}).get("valid_until")
    if granted:
        try:
            connection.consent_valid_until = datetime.fromisoformat(
                str(granted).replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except ValueError:
            connection.consent_valid_until = datetime.utcnow() + timedelta(
                days=settings.EB_CONSENT_DAYS
            )
    else:
        connection.consent_valid_until = datetime.utcnow() + timedelta(
            days=settings.EB_CONSENT_DAYS
        )

    icon_filename = _fetch_bank_icon(connection.aspsp_name, connection.aspsp_country)
    created = _link_accounts(db, connection, session.get("accounts") or [], icon_filename)
    db.commit()

    if created == 0:
        # In restricted (free tier) mode Enable Banking filters out every account
        # not whitelisted in the Control Panel, so a perfectly successful bank
        # login yields nothing. Call it out explicitly — otherwise it reads as a
        # bug in this app.
        logger.warning(
            "Connection %s (user %s) linked but returned no accounts — likely not "
            "whitelisted in the Enable Banking Control Panel",
            connection.id,
            connection.user_id,
        )
        return _frontend_redirect(linked="0", error="no_accounts")

    # Pull history now, while the bank still offers it (see _initial_sync).
    background_tasks.add_task(_initial_sync, connection.id)

    return _frontend_redirect(linked="1", accounts=str(created))


def _fetch_bank_icon(aspsp_name: str, aspsp_country: str) -> str | None:
    """Best-effort local copy of the bank's real logo (see bank_sync_service).

    Isolated in its own try/except even though the service function already
    guards its own steps: this runs on the callback path right after the
    account link succeeded, and no logo-fetching failure mode is worth
    turning into a broken bank connection.
    """
    try:
        return bank_sync_service.get_or_fetch_bank_icon(aspsp_name, aspsp_country)
    except Exception:
        logger.exception("Unexpected error fetching bank icon for %s", aspsp_name)
        return None


def _link_accounts(
    db: Session,
    connection: BankConnection,
    raw_accounts: list,
    icon_filename: str | None = None,
) -> int:
    """Create or re-attach Account rows for the accounts a session exposes."""
    created = 0
    for raw in raw_accounts:
        uid = raw.get("uid") if isinstance(raw, dict) else str(raw)
        if not uid:
            continue

        existing = (
            db.query(Account)
            .filter(
                Account.user_id == connection.user_id,
                Account.external_account_id == uid,
            )
            .first()
        )
        if existing:
            # Re-linking after a consent expiry: point the account at the new
            # connection rather than creating a duplicate.
            existing.bank_connection_id = connection.id
            existing.is_linked = True
            existing.is_active = True
            if icon_filename and not existing.icon:
                existing.icon = icon_filename
            # A fresh authorisation reopens the bank's short post-authorisation
            # full-history window (Enable Banking: "typically around one hour"),
            # even for an account that was already linked. Clearing
            # last_synced_at makes the next sync treat this as a first sync
            # again — requesting EB_INITIAL_HISTORY_DAYS with strategy=longest
            # instead of resuming from wherever the last (possibly
            # narrow-windowed) sync left off. Without this, an account that
            # fell back to 90 days on its very first sync had no way back to
            # more history short of deleting and recreating it.
            existing.last_synced_at = None
            created += 1
            continue

        identifiers = raw.get("account_id") or {} if isinstance(raw, dict) else {}
        iban = identifiers.get("iban") if isinstance(identifiers, dict) else None
        name = (
            (raw.get("name") if isinstance(raw, dict) else None)
            or (raw.get("product") if isinstance(raw, dict) else None)
            or (f"{connection.aspsp_name} {iban[-4:]}" if iban else connection.aspsp_name)
        )

        db.add(
            Account(
                user_id=connection.user_id,
                bank_connection_id=connection.id,
                external_account_id=uid,
                is_linked=True,
                icon=icon_filename,
                name=str(name)[:100],
                type="checking",
                currency=(raw.get("currency") if isinstance(raw, dict) else None) or "EUR",
                balance=0,
                description=f"Linked to {connection.aspsp_name}" + (f" ({iban})" if iban else ""),
                sync_status="never",
            )
        )
        created += 1

    return created


@router.post("/connections/{connection_id}/sync", response_model=SyncResultResponse)
def sync_connection(
    connection_id: int,
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Sync one connection now.

    Cooldown-limited: banks allow as few as 4 AIS calls per account per day, so
    an impatient refresh button can burn the quota the scheduled sync needs.
    """
    _require_enabled()
    connection = _owned_connection(db, connection_id, current_user)

    if connection.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This connection is {connection.status}. Reconnect the bank to sync it.",
        )

    cooldown = timedelta(minutes=settings.EB_MANUAL_SYNC_COOLDOWN_MINUTES)
    if connection.last_sync_at and datetime.utcnow() - connection.last_sync_at < cooldown:
        wait = cooldown - (datetime.utcnow() - connection.last_sync_at)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Synced recently. Banks limit how often accounts can be read — "
                f"try again in {int(wait.total_seconds() // 60) + 1} minute(s)."
            ),
        )

    try:
        result = bank_sync_service.sync_connection(db, connection)
    except eb.ConsentExpired as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The bank consent has expired. Reconnect the bank to resume syncing.",
        ) from exc
    except eb.RateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The bank is rate limiting requests. Try again later.",
        ) from exc
    except eb.AspspError as exc:
        # The bank refused us, not the other way round — say so, because
        # "sync failed" sends people hunting for a bug in this app.
        logger.warning("ASPSP error syncing connection %s: %s", connection_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Your bank rejected the request. This is usually temporary — the next "
                "scheduled sync will retry automatically."
            ),
        ) from exc
    except eb.EnableBankingError as exc:
        logger.warning("Manual sync failed for connection %s: %s", connection_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Sync failed. The bank or provider could not be reached.",
        ) from exc

    return SyncResultResponse(**result)


def _release_account(
    db: Session, user_id: int, account: Account, delete_account: bool
) -> tuple[int, int]:
    """Detach one account from bank sync. Returns (deleted, released) counts.

    Shared by whole-bank disconnect and single-account unlink so the subtle part
    — clearing `external_id` — cannot drift between the two.
    """
    if delete_account:
        removed = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                (Transaction.account_id == account.id)
                | (Transaction.destination_account_id == account.id),
            )
            .delete(synchronize_session=False)
        )
        db.delete(account)
        return removed, 0

    # Becomes an ordinary manual account again.
    account.is_linked = False
    account.bank_connection_id = None
    account.external_account_id = None
    account.sync_status = None

    # Pending entries were never confirmed by the bank and will now never be
    # reconciled — nothing is left to settle or withdraw them. Keeping them
    # would strand un-editable "Pending" rows in the ledger forever.
    removed = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.account_id == account.id,
            Transaction.is_pending.is_(True),
        )
        .delete(synchronize_session=False)
    )

    # Clearing external_id is what actually makes the history editable: every
    # guard treats "has an external_id" as "owned by the bank", so leaving it
    # set would keep these rows frozen on an account the user just asked to be
    # normal. Safe for a future re-link too — that creates a fresh account, and
    # dedup keys are prefixed with the account id.
    released = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.account_id == account.id,
            Transaction.external_id.isnot(None),
        )
        .update(
            {Transaction.external_id: None, Transaction.is_imported: True},
            synchronize_session=False,
        )
    )
    return removed, released


def _revoke_session(connection: BankConnection) -> None:
    """Best-effort consent revocation; never blocks local cleanup."""
    if not connection.session_id_encrypted:
        return
    try:
        eb.delete_session(crypto.decrypt(connection.session_id_encrypted))
    except crypto.DecryptionError:
        # Key rotated — nothing to revoke remotely, carry on unlinking locally.
        logger.warning("Could not decrypt session for connection %s", connection.id)


@router.delete("/accounts/{account_id}")
def unlink_account(
    account_id: int,
    delete_account: bool = Query(
        default=False,
        description=(
            "Also delete the account and its transactions. Off by default: "
            "unlinking keeps the synced history as ordinary manual data."
        ),
    ),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Stop syncing ONE account, leaving the bank's other accounts connected.

    One authorisation usually exposes several accounts, and wanting only some of
    them in the ledger is normal — a joint account tracked elsewhere, a card the
    user does not budget. Previously the only remedy was disconnecting the whole
    bank, which took the wanted accounts down with it.
    """
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )
    if not account.is_linked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account is not linked to a bank.",
        )

    connection = (
        db.query(BankConnection)
        .filter(
            BankConnection.id == account.bank_connection_id,
            BankConnection.user_id == current_user.id,
        )
        .first()
    )

    removed, released = _release_account(db, current_user.id, account, delete_account)

    # A connection with nothing left to sync is dead weight, and leaving the
    # consent alive would mean holding bank access we no longer use.
    connection_removed = False
    if connection is not None:
        remaining = (
            db.query(Account)
            .filter(
                Account.bank_connection_id == connection.id,
                Account.user_id == current_user.id,
                Account.id != account.id,
                Account.is_linked.is_(True),
            )
            .count()
        )
        if remaining == 0:
            _revoke_session(connection)
            db.delete(connection)
            connection_removed = True

    db.commit()

    return {
        "message": "Account unlinked",
        "account_deleted": delete_account,
        "transactions_deleted": removed,
        "transactions_released": released,
        # True when that was the bank's last account, so the UI can drop the
        # whole connection card rather than showing an empty one.
        "connection_removed": connection_removed,
    }


@router.delete("/connections/{connection_id}")
def delete_connection(
    connection_id: int,
    delete_accounts: bool = Query(
        default=False,
        description=(
            "Also delete the linked accounts and their transactions. Off by "
            "default: unlinking keeps the synced history as ordinary manual data."
        ),
    ),
    current_user: User = Depends(get_current_user_authenticated),
    db: Session = Depends(get_db),
):
    """Disconnect a bank, optionally removing the accounts it created."""
    connection = _owned_connection(db, connection_id, current_user)

    _revoke_session(connection)

    accounts = (
        db.query(Account)
        .filter(
            Account.bank_connection_id == connection.id,
            Account.user_id == current_user.id,
        )
        .all()
    )

    removed_transactions = 0
    released_transactions = 0
    for account in accounts:
        removed, released = _release_account(db, current_user.id, account, delete_accounts)
        removed_transactions += removed
        released_transactions += released

    db.delete(connection)
    db.commit()

    return {
        "message": "Bank disconnected",
        "accounts_deleted": len(accounts) if delete_accounts else 0,
        "accounts_unlinked": 0 if delete_accounts else len(accounts),
        "transactions_deleted": removed_transactions,
        "transactions_released": released_transactions,
    }
