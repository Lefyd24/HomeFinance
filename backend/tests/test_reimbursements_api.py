from app.models import TransactionReimbursement, User
from tests.factories import make_account, make_transaction


def _pair(db, user, expense=100.0, income=33.0):
    account = make_account(db, user)
    return (
        make_transaction(db, user, account, amount=expense, type="expense", description="Dinner"),
        make_transaction(db, user, account, amount=income, type="income", description="George"),
    )


def _link(client, expense, income, **body):
    return client.post(
        f"/api/transactions/{expense.id}/reimbursements",
        json={"counterpart_id": income.id, **body},
    )


def test_link_shows_effective_amount_and_counterpart(client, db, seed_user):
    expense, income = _pair(db, seed_user)

    response = _link(client, expense, income)

    assert response.status_code == 200
    body = response.json()
    assert body["reimbursed_amount"] == 33.0
    assert body["effective_amount"] == 67.0
    assert [(r["transaction_id"], r["amount"], r["description"]) for r in body["reimbursements"]] == [
        (income.id, 33.0, "George")
    ]

    seen_from_income = client.get(f"/api/transactions/{income.id}").json()
    assert seen_from_income["effective_amount"] == 0.0
    assert seen_from_income["reimbursements"][0]["transaction_id"] == expense.id


def test_candidates_list_opposite_type_with_remaining(client, db, seed_user):
    expense, income = _pair(db, seed_user)

    response = client.get(f"/api/transactions/{expense.id}/reimbursement-candidates")

    assert response.status_code == 200
    assert [(c["id"], c["remaining"]) for c in response.json()] == [(income.id, 33.0)]


def test_over_allocation_is_409(client, db, seed_user):
    expense, income = _pair(db, seed_user)

    assert _link(client, expense, income, amount=40.0).status_code == 409


def test_other_users_data_is_404(client, db, seed_user):
    expense, _ = _pair(db, seed_user)
    other = User(email="b@example.com", hashed_password="x", full_name="B", is_active=True)
    db.add(other)
    db.commit()
    foreign = make_transaction(db, other, make_account(db, other), amount=10.0, type="income")

    assert _link(client, expense, foreign).status_code == 404
    assert client.delete("/api/transactions/reimbursements/999").status_code == 404


def test_linked_row_cannot_be_split_or_made_a_transfer(client, db, seed_user):
    expense, income = _pair(db, seed_user)
    _link(client, expense, income)
    other_account = make_account(db, seed_user, name="Savings")

    split = client.post(
        f"/api/transactions/{expense.id}/split",
        json={"parts": [{"amount": 60.0}, {"amount": 40.0}]},
    )
    retag = client.post(
        f"/api/transactions/{income.id}/retag-transfer",
        json={"destination_account_id": other_account.id},
    )
    edit = client.put(f"/api/transactions/{expense.id}", json={"amount": 20.0})

    assert (split.status_code, retag.status_code, edit.status_code) == (409, 409, 409)


def test_unlink_returns_204_and_restores_amounts(client, db, seed_user):
    expense, income = _pair(db, seed_user)
    link_id = _link(client, expense, income).json()["reimbursements"][0]["id"]

    assert client.delete(f"/api/transactions/reimbursements/{link_id}").status_code == 204

    assert client.get(f"/api/transactions/{expense.id}").json()["effective_amount"] == 100.0


def test_bulk_delete_and_account_delete_remove_links(client, db, seed_user):
    expense, income = _pair(db, seed_user)
    _link(client, expense, income)

    client.post("/api/transactions/bulk-delete", json={"ids": [expense.id]})
    assert client.get(f"/api/transactions/{income.id}").json()["reimbursements"] == []

    expense, income = _pair(db, seed_user)
    _link(client, expense, income)
    client.delete(f"/api/accounts/{expense.account_id}")
    assert db.query(TransactionReimbursement).count() == 0
