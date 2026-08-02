"""Guards keeping bank-linked accounts read-only.

A linked account is owned by the bank: bank_sync_service overwrites its balance
from the bank's reported figure on every sync, and its transactions come from
the bank's own records. Letting a manual write through would put the ledger and
the bank permanently out of step — the running-total balance maintained by
transaction_service and import_wizard would fight the synced value, and manual
rows would look synced without ever appearing on a statement.

Every write path that can touch an account balance must call one of these.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, Transaction

# Fields on a synced transaction that mirror the bank's own record. Everything
# else — category_id, notes, description — stays editable, because synced rows
# arrive uncategorised and categorising them is the whole point.
BANK_OWNED_TRANSACTION_FIELDS = frozenset(
    {"account_id", "destination_account_id", "amount", "type", "date"}
)


def is_linked(account: Account | None) -> bool:
    return bool(account is not None and account.is_linked)


def reject_if_linked(account: Account | None, action: str = "modified") -> None:
    """Raise 400 when `account` is bank-linked."""
    if is_linked(account):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{account.name}' is synced from your bank and cannot be {action} "
                "manually. Disconnect the bank first if you want to edit it by hand."
            ),
        )


def reject_linked_account_ids(db: Session, user_id: int, *account_ids: int | None) -> None:
    """Raise 400 if any of the given account ids belongs to a linked account.

    Takes ids rather than objects so callers can check a transfer's source and
    destination in one go without loading both.
    """
    ids = [account_id for account_id in account_ids if account_id is not None]
    if not ids:
        return

    linked = (
        db.query(Account)
        .filter(
            Account.user_id == user_id,
            Account.id.in_(ids),
            Account.is_linked.is_(True),
        )
        .first()
    )
    reject_if_linked(linked, action="used for manual transactions")


def is_synced(transaction: Transaction) -> bool:
    """True for a transaction that came from a bank sync."""
    return bool(transaction.external_id)


def reject_synced_field_edits(transaction: Transaction, update_fields: set[str]) -> None:
    """Block edits to bank-owned fields of a synced transaction.

    Categorising, annotating and renaming stay allowed — only the figures the
    bank reported are frozen, since the next sync would contradict any change.
    """
    if not is_synced(transaction):
        return

    conflicting = BANK_OWNED_TRANSACTION_FIELDS & update_fields
    if conflicting:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{', '.join(sorted(conflicting))} cannot be changed on a transaction "
                "synced from your bank. You can still change its category and notes."
            ),
        )


def reject_synced_delete(transaction: Transaction) -> None:
    """Block deleting a synced transaction.

    Deletion does not stick: dedup works by looking for external_id in the
    ledger, so a deleted row is simply re-imported by the next sync.
    """
    if is_synced(transaction):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This transaction was synced from your bank and cannot be deleted — "
                "the next sync would just restore it. Disconnect the bank to stop syncing."
            ),
        )
