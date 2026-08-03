"""Delete an account's transactions over a date span, leaving its balance alone.

The de-duplication tool. When an account you tracked by hand is superseded by a
bank-synced one, the overlap is the problem: the same spending recorded twice.
Removing the duplicated span from the manual account fixes the ledger — but the
account's *balance* was never wrong, so it must not move.

That is the whole reason this is a script and not a loop over the API.
`TransactionService` maintains `Account.balance` as a running total: every
delete reverses the transaction's effect on it. Correct for an ordinary
correction, exactly wrong here, where the balance is the one number already
right. This deletes the rows underneath that machinery and asserts afterwards
that no balance moved.

Usage:
    cd backend
    python scripts/delete_transactions_range.py --account 5 --from 2024-01-01 --to 2024-06-30
    python scripts/delete_transactions_range.py --account "Eurobank (manual)" --from 2024-01-01 --to 2024-06-30 --user me@example.com

    --dry-run   report what would go, change nothing
    --yes       skip the confirmation prompt
    --include-transfers
                also delete transfers that touch another account (see below)
"""

import argparse
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal  # noqa: E402
from app.models import Account, Transaction, User  # noqa: E402


def _parse_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"'{value}' is not a date in YYYY-MM-DD form"
        ) from None


def _resolve_user(db, email: str | None) -> User:
    """The owning user, required to scope everything that follows.

    Account ids are global, so every query below is filtered by user as well —
    otherwise a mistyped id silently operates on somebody else's ledger.
    """
    if email:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise SystemExit(f"No user with email {email!r}.")
        return user

    users = db.query(User).all()
    if not users:
        raise SystemExit("This database has no users.")
    if len(users) > 1:
        listed = ", ".join(u.email for u in users)
        raise SystemExit(
            f"This database has {len(users)} users; pass --user to say which.\n"
            f"  Known: {listed}"
        )
    return users[0]


def _resolve_account(db, user: User, ref: str) -> Account:
    """Accept either an account id or an exact name, whichever the user typed."""
    query = db.query(Account).filter(Account.user_id == user.id)

    if ref.isdigit():
        account = query.filter(Account.id == int(ref)).first()
        if account:
            return account

    matches = query.filter(Account.name == ref).all()
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        listed = ", ".join(f"{a.name} (id {a.id})" for a in matches)
        raise SystemExit(f"{ref!r} matches several accounts; use the id.\n  {listed}")

    available = ", ".join(f"{a.name} (id {a.id})" for a in query.all()) or "none"
    raise SystemExit(f"No account matching {ref!r} for {user.email}.\n  Available: {available}")


def _describe(transaction: Transaction) -> str:
    return (
        f"  {transaction.date}  {transaction.type:<8} "
        f"{transaction.amount:>12,.2f}  {(transaction.description or '')[:52]}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Delete one account's transactions in a date range, preserving its balance.",
    )
    parser.add_argument(
        "--account",
        required=True,
        help="Account id, or its exact name.",
    )
    parser.add_argument(
        "--from",
        dest="date_from",
        required=True,
        type=_parse_date,
        help="First date to delete, inclusive (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--to",
        dest="date_to",
        required=True,
        type=_parse_date,
        help="Last date to delete, inclusive (YYYY-MM-DD).",
    )
    parser.add_argument("--user", help="Owner's email. Only needed with several users.")
    parser.add_argument(
        "--include-transfers",
        action="store_true",
        help=(
            "Also delete transfers whose other side is a different account. Off by "
            "default because a transfer is a single row shared by both accounts, so "
            "deleting it removes the entry from the other account's ledger too."
        ),
    )
    parser.add_argument("--dry-run", action="store_true", help="Report only; change nothing.")
    parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation.")
    args = parser.parse_args()

    if args.date_from > args.date_to:
        raise SystemExit("--from is after --to.")

    db = SessionLocal()
    try:
        user = _resolve_user(db, args.user)
        account = _resolve_account(db, user, args.account)

        # Scoped to account_id only. Rows where this account is the *destination*
        # of someone else's transfer belong to that other account's ledger; this
        # command is about one account's own entries.
        candidates = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user.id,
                Transaction.account_id == account.id,
                Transaction.date >= args.date_from,
                Transaction.date <= args.date_to,
            )
            .order_by(Transaction.date)
            .all()
        )

        # A transfer row is shared: it is the only record of the movement for the
        # account on the far side too. Deleting it there is a side effect the
        # caller did not ask for, so it is opt-in and always reported.
        shared_transfers = [t for t in candidates if t.destination_account_id is not None]
        doomed = candidates if args.include_transfers else [
            t for t in candidates if t.destination_account_id is None
        ]

        print(f"Account : {account.name} (id {account.id}, {account.currency})")
        print(f"Owner   : {user.email}")
        print(f"Range   : {args.date_from} .. {args.date_to} (inclusive)")
        print(f"Balance : {account.balance:,.2f}  — will not change")
        print()

        if shared_transfers:
            other_ids = sorted({t.destination_account_id for t in shared_transfers})
            print(
                f"{len(shared_transfers)} transfer(s) in this range also touch "
                f"account(s) {', '.join(str(i) for i in other_ids)}:"
            )
            for transaction in shared_transfers:
                print(_describe(transaction))
            print(
                "  -> "
                + (
                    "INCLUDED (--include-transfers): these will also vanish from the "
                    "other account's ledger."
                    if args.include_transfers
                    else "SKIPPED. Pass --include-transfers to delete them too."
                )
            )
            print()

        if not doomed:
            print("Nothing to delete.")
            return 0

        synced = sum(1 for t in doomed if t.external_id is not None)
        if synced:
            print(
                f"WARNING: {synced} of these came from bank sync. If this account is "
                "still linked and the bank still serves this period, the next sync "
                "will import them again. Unlink the account first if that is not "
                "what you want."
            )
            print()

        print(f"{len(doomed)} transaction(s) to delete:")
        for transaction in doomed:
            print(_describe(transaction))
        print()

        if args.dry_run:
            print("Dry run — nothing was changed.")
            return 0

        if not args.yes:
            answer = input(f"Delete these {len(doomed)} transaction(s)? [y/N] ").strip().lower()
            if answer not in {"y", "yes"}:
                print("Aborted.")
                return 1

        # Every account any doomed row could conceivably touch, so the assertion
        # at the end covers the transfer case as well as the target account.
        watched_ids = {account.id} | {
            t.destination_account_id for t in doomed if t.destination_account_id
        }
        before = {
            a.id: a.balance
            for a in db.query(Account).filter(Account.id.in_(watched_ids)).all()
        }

        deleted = (
            db.query(Transaction)
            .filter(Transaction.id.in_([t.id for t in doomed]))
            .delete(synchronize_session=False)
        )
        db.commit()

        # Belt and braces. A bulk delete does not run the balance bookkeeping in
        # TransactionService, so nothing *should* have moved — but this script's
        # entire promise is that nothing did, and a silent drift here would be
        # discovered as a wrong number weeks later.
        db.expire_all()
        drifted = []
        for account_id, old in before.items():
            now = db.get(Account, account_id)
            if now is not None and now.balance != old:
                now.balance = old
                drifted.append((account_id, old))
        if drifted:
            db.commit()
            print(
                "NOTE: restored "
                + ", ".join(f"account {i} to {b:,.2f}" for i, b in drifted)
            )

        print(f"Deleted {deleted} transaction(s). {account.name} balance unchanged "
              f"at {before[account.id]:,.2f}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
