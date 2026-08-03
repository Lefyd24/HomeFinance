"""Retagging linked-account transactions as transfers.

A linked account's balance is bank-authoritative (see
app/utils/linked_accounts.py), so pairing/retagging must never re-run the
normal transfer balance math on a linked leg.
"""

import pytest

from app.services.transaction_service import TransactionService
from tests.factories import make_account, make_transaction


def test_pairing_two_linked_legs_marks_both_as_transfer_without_touching_balances(db, seed_user):
    account_a = make_account(db, seed_user, name="Bank A", balance=500.0, is_linked=True)
    account_b = make_account(db, seed_user, name="Bank B", balance=700.0, is_linked=True)

    tx_a = make_transaction(
        db, seed_user, account_a, amount=100.0, type="expense", external_id="ext-a"
    )
    tx_b = make_transaction(
        db, seed_user, account_b, amount=100.0, type="income", external_id="ext-b"
    )

    TransactionService.pair_as_transfer(db, tx_a, tx_b)

    db.refresh(tx_a)
    db.refresh(tx_b)
    db.refresh(account_a)
    db.refresh(account_b)

    assert tx_a.type == "transfer"
    assert tx_a.destination_account_id == account_b.id
    assert tx_a.paired_transaction_id == tx_b.id
    assert tx_a.transfer_direction == "outgoing"
    assert tx_a.original_type == "expense"

    assert tx_b.type == "transfer"
    assert tx_b.destination_account_id == account_a.id
    assert tx_b.paired_transaction_id == tx_a.id
    assert tx_b.transfer_direction == "incoming"
    assert tx_b.original_type == "income"

    assert account_a.balance == 500.0
    assert account_b.balance == 700.0


def test_pairing_legs_with_mismatched_amounts_is_rejected(db, seed_user):
    account_a = make_account(db, seed_user, name="Bank A", is_linked=True)
    account_b = make_account(db, seed_user, name="Bank B", is_linked=True)

    tx_a = make_transaction(db, seed_user, account_a, amount=100.0, type="expense", external_id="ext-a")
    tx_b = make_transaction(db, seed_user, account_b, amount=95.0, type="income", external_id="ext-b")

    with pytest.raises(ValueError, match="amount"):
        TransactionService.pair_as_transfer(db, tx_a, tx_b)


def test_retagging_a_linked_expense_credits_the_manual_destination(db, seed_user):
    linked = make_account(db, seed_user, name="Bank", balance=400.0, is_linked=True)
    manual = make_account(db, seed_user, name="Cash Envelope", balance=50.0, is_linked=False)

    tx = make_transaction(
        db, seed_user, linked, amount=100.0, type="expense", external_id="ext-a"
    )

    TransactionService.retag_as_transfer(db, tx, destination_account_id=manual.id)

    db.refresh(tx)
    db.refresh(linked)
    db.refresh(manual)

    assert tx.type == "transfer"
    assert tx.original_type == "expense"
    assert tx.destination_account_id == manual.id
    assert tx.transfer_direction == "outgoing"
    assert tx.paired_transaction_id is None

    # Linked leg's balance is bank-authoritative — untouched.
    assert linked.balance == 400.0
    # Manual leg had no prior record of this money arriving — now applied.
    assert manual.balance == 150.0


def test_retagging_a_linked_income_debits_the_manual_source(db, seed_user):
    linked = make_account(db, seed_user, name="Bank", balance=600.0, is_linked=True)
    manual = make_account(db, seed_user, name="Cash Envelope", balance=200.0, is_linked=False)

    tx = make_transaction(
        db, seed_user, linked, amount=100.0, type="income", external_id="ext-b"
    )

    TransactionService.retag_as_transfer(db, tx, destination_account_id=manual.id)

    db.refresh(tx)
    db.refresh(linked)
    db.refresh(manual)

    assert tx.type == "transfer"
    assert tx.original_type == "income"
    assert tx.transfer_direction == "incoming"

    # Linked leg's balance is bank-authoritative — untouched.
    assert linked.balance == 600.0
    # Manual leg is where the money actually left from — now applied.
    assert manual.balance == 100.0


def test_retagging_to_a_linked_destination_is_rejected(db, seed_user):
    linked_a = make_account(db, seed_user, name="Bank A", is_linked=True)
    linked_b = make_account(db, seed_user, name="Bank B", is_linked=True)

    tx = make_transaction(db, seed_user, linked_a, amount=100.0, type="expense", external_id="ext-a")

    with pytest.raises(ValueError, match="already linked accounts"):
        TransactionService.retag_as_transfer(db, tx, destination_account_id=linked_b.id)


def test_unmarking_a_retagged_transfer_reverses_the_manual_balance_and_restores_type(db, seed_user):
    linked = make_account(db, seed_user, name="Bank", balance=400.0, is_linked=True)
    manual = make_account(db, seed_user, name="Cash Envelope", balance=50.0, is_linked=False)

    tx = make_transaction(db, seed_user, linked, amount=100.0, type="expense", external_id="ext-a")
    TransactionService.retag_as_transfer(db, tx, destination_account_id=manual.id)

    TransactionService.unmark_transfer(db, tx)

    db.refresh(tx)
    db.refresh(linked)
    db.refresh(manual)

    assert tx.type == "expense"
    assert tx.original_type is None
    assert tx.destination_account_id is None
    assert tx.transfer_direction is None
    assert linked.balance == 400.0
    assert manual.balance == 50.0


def test_unmarking_one_leg_of_a_paired_transfer_leaves_the_other_leg_paired(db, seed_user):
    account_a = make_account(db, seed_user, name="Bank A", balance=500.0, is_linked=True)
    account_b = make_account(db, seed_user, name="Bank B", balance=700.0, is_linked=True)

    tx_a = make_transaction(db, seed_user, account_a, amount=100.0, type="expense", external_id="ext-a")
    tx_b = make_transaction(db, seed_user, account_b, amount=100.0, type="income", external_id="ext-b")
    TransactionService.pair_as_transfer(db, tx_a, tx_b)

    TransactionService.unmark_transfer(db, tx_a)

    db.refresh(tx_a)
    db.refresh(tx_b)
    db.refresh(account_a)
    db.refresh(account_b)

    assert tx_a.type == "expense"
    assert tx_a.destination_account_id is None
    assert tx_a.paired_transaction_id is None

    # The partner leg keeps its own transfer tag until it's unmarked too.
    assert tx_b.type == "transfer"
    assert tx_b.paired_transaction_id == tx_a.id

    assert account_a.balance == 500.0
    assert account_b.balance == 700.0
