"""Cross-user FK references must 404 and leave the other user's data untouched."""
from datetime import date

import pytest

from app.models import Account, Category, Debt, FinancialGoal, RecurringExpense, Transaction, User
from tests.factories import make_account, make_category, make_debt, make_transaction


@pytest.fixture()
def victim(db):
    u = User(email="b@example.com", hashed_password="x", full_name="B", is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def b(db, victim):
    acct = make_account(db, victim, name="B acct", balance=500.0)
    cat = make_category(db, victim, name="B cat")
    tx = make_transaction(db, victim, acct, cat, amount=10.0)
    return acct, cat, tx


def _balance(db, acct):
    db.expire_all()
    return db.get(Account, acct.id).balance


def test_transaction_put_foreign_account_404(client, db, seed_user, b):
    b_acct, b_cat, _ = b
    mine = make_account(db, seed_user)
    tx = make_transaction(db, seed_user, mine)
    for body in ({"account_id": b_acct.id}, {"destination_account_id": b_acct.id},
                 {"category_id": b_cat.id}):
        r = client.put(f"/api/transactions/{tx.id}", json=body)
        assert r.status_code == 404, body
    assert _balance(db, b_acct) == 500.0


def test_transaction_put_own_ids_ok(client, db, seed_user):
    a1 = make_account(db, seed_user, name="a1", balance=100.0)
    a2 = make_account(db, seed_user, name="a2", balance=100.0)
    cat = make_category(db, seed_user)
    tx = make_transaction(db, seed_user, a1, amount=10.0, type="expense")
    r = client.put(f"/api/transactions/{tx.id}",
                   json={"account_id": a2.id, "category_id": cat.id})
    assert r.status_code == 200, r.text
    assert _balance(db, a2) == 90.0


def test_debt_payment_foreign_refs_404_balance_unchanged(client, db, seed_user, b):
    b_acct, _, b_tx = b
    debt = make_debt(db, seed_user)
    pay = {"amount": 50, "payment_date": date.today().isoformat()}
    r = client.post(f"/api/debts/{debt.id}/payments",
                    json={**pay, "account_id": b_acct.id, "create_transaction": True})
    assert r.status_code == 404
    r = client.post(f"/api/debts/{debt.id}/payments", json={**pay, "transaction_id": b_tx.id})
    assert r.status_code == 404
    assert _balance(db, b_acct) == 500.0
    assert db.query(Transaction).filter(Transaction.user_id == b_tx.user_id).count() == 1


def test_debt_payment_own_account_ok(client, db, seed_user):
    mine = make_account(db, seed_user, balance=200.0)
    debt = make_debt(db, seed_user)
    r = client.post(f"/api/debts/{debt.id}/payments",
                    json={"amount": 50, "payment_date": date.today().isoformat(),
                          "account_id": mine.id, "create_transaction": True})
    assert r.status_code == 200, r.text
    assert db.query(Transaction).filter(Transaction.account_id == mine.id).count() == 1
