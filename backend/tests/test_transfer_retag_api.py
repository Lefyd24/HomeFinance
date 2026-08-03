from app.models import Account
from tests.factories import make_account, make_transaction


def test_pair_transfer_endpoint_marks_both_legs(client, db, seed_user):
    account_a = make_account(db, seed_user, name="Bank A", balance=500.0, is_linked=True)
    account_b = make_account(db, seed_user, name="Bank B", balance=700.0, is_linked=True)

    tx_a = make_transaction(db, seed_user, account_a, amount=100.0, type="expense", external_id="ext-a")
    tx_b = make_transaction(db, seed_user, account_b, amount=100.0, type="income", external_id="ext-b")

    resp = client.post(
        f"/api/transactions/{tx_a.id}/pair-transfer",
        json={"paired_transaction_id": tx_b.id},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "transfer"
    assert body["paired_transaction_id"] == tx_b.id
    assert body["destination_account_id"] == account_b.id

    db.refresh(account_a)
    db.refresh(account_b)
    assert account_a.balance == 500.0
    assert account_b.balance == 700.0


def test_retag_transfer_endpoint_credits_manual_destination(client, db, seed_user):
    linked = make_account(db, seed_user, name="Bank", balance=400.0, is_linked=True)
    manual = make_account(db, seed_user, name="Cash Envelope", balance=50.0, is_linked=False)
    tx = make_transaction(db, seed_user, linked, amount=100.0, type="expense", external_id="ext-a")

    resp = client.post(
        f"/api/transactions/{tx.id}/retag-transfer",
        json={"destination_account_id": manual.id},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "transfer"
    assert body["transfer_direction"] == "outgoing"

    db.refresh(manual)
    assert manual.balance == 150.0


def test_unmark_transfer_endpoint_restores_original_type(client, db, seed_user):
    linked = make_account(db, seed_user, name="Bank", balance=400.0, is_linked=True)
    manual = make_account(db, seed_user, name="Cash Envelope", balance=50.0, is_linked=False)
    tx = make_transaction(db, seed_user, linked, amount=100.0, type="expense", external_id="ext-a")
    client.post(f"/api/transactions/{tx.id}/retag-transfer", json={"destination_account_id": manual.id})

    resp = client.post(f"/api/transactions/{tx.id}/unmark-transfer")

    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "expense"
    assert body["destination_account_id"] is None

    db.refresh(manual)
    assert manual.balance == 50.0
