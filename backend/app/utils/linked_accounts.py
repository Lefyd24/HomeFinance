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
# else — category_id, notes, description, date — stays editable. `date` is
# deliberately not bank-owned: bank_sync_service only ever inserts new booked
# transactions by external_id and never overwrites an existing row (see
# _write_transactions), so a user correcting a transaction's date to when it
# actually happened (vs. when the bank cleared it) can't be clobbered by a
# later sync.
BANK_OWNED_TRANSACTION_FIELDS = frozenset(
    {"account_id", "destination_account_id", "amount", "type"}
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


def reject_synced_field_edits(transaction: Transaction, update_data: dict) -> None:
    """Block edits to bank-owned fields of a synced transaction.

    Categorising, annotating and renaming stay allowed — only the figures the
    bank reported are frozen, since the next sync would contradict any change.

    Compares VALUES, not merely which keys are present: the edit form submits the
    whole transaction, so rejecting on presence made a synced row impossible to
    recategorise — the exact thing this is supposed to keep working.
    """
    if not is_synced(transaction):
        return

    conflicting = sorted(
        field
        for field in BANK_OWNED_TRANSACTION_FIELDS
        if field in update_data and _differs(transaction, field, update_data[field])
    )
    if conflicting:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{', '.join(conflicting)} cannot be changed on a transaction synced "
                "from your bank. You can still change its category, description and "
                "notes, or use 'Break this transaction' to split the amount across "
                "several categories."
            ),
        )


def _differs(transaction: Transaction, field: str, new_value) -> bool:
    """True when `new_value` is a real change to `field`.

    Amounts round-trip through float, so they need normalising before comparison
    or every unchanged submission looks like an edit.
    """
    current = getattr(transaction, field)
    if new_value is None or current is None:
        return new_value is not current

    if field == "amount":
        return round(float(current), 2) != round(float(new_value), 2)

    return current != new_value


def strip_unchanged_synced_fields(transaction: Transaction, update_data: dict) -> dict:
    """Drop bank-owned keys that are being re-sent unchanged.

    Without this the unchanged values still flow into TransactionService, which
    recomputes account balances from them — needless work, and a float that
    round-tripped through JSON could write back a subtly different amount.
    """
    if not is_synced(transaction):
        return update_data
    return {
        key: value
        for key, value in update_data.items()
        if key not in BANK_OWNED_TRANSACTION_FIELDS
    }


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
