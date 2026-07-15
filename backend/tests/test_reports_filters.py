from datetime import date

from tests.factories import make_account, make_category, make_transaction


def test_category_breakdown_filters_by_account(client, db, seed_user):
    acc_a = make_account(db, seed_user, name="A")
    acc_b = make_account(db, seed_user, name="B")
    cat = make_category(db, seed_user, name="Groceries")
    make_transaction(db, seed_user, acc_a, cat, amount=40.0, type="expense", tx_date=date.today())
    make_transaction(db, seed_user, acc_b, cat, amount=60.0, type="expense", tx_date=date.today())

    resp_all = client.get("/api/reports/category-breakdown")
    assert resp_all.status_code == 200
    total_all = sum(c["amount"] for c in resp_all.json()["categories"])
    assert total_all == 100.0

    resp_filtered = client.get(f"/api/reports/category-breakdown?account_ids={acc_a.id}")
    assert resp_filtered.status_code == 200
    total_filtered = sum(c["amount"] for c in resp_filtered.json()["categories"])
    assert total_filtered == 40.0


def test_balance_history_filters_by_account(client, db, seed_user):
    acc_a = make_account(db, seed_user, name="A")
    acc_b = make_account(db, seed_user, name="B")
    make_transaction(db, seed_user, acc_a, amount=100.0, type="income", tx_date=date.today())
    make_transaction(db, seed_user, acc_b, amount=200.0, type="income", tx_date=date.today())

    resp_all = client.get("/api/reports/balance-history")
    assert resp_all.status_code == 200
    names_all = {s["name"] for s in resp_all.json()["series"]}
    assert {"A", "B", "Total"}.issubset(names_all)

    resp_filtered = client.get(f"/api/reports/balance-history?account_ids={acc_a.id}")
    assert resp_filtered.status_code == 200
    names_filtered = {s["name"] for s in resp_filtered.json()["series"]}
    assert "B" not in names_filtered
    assert "A" in names_filtered


def test_malformed_account_ids_returns_422(client):
    resp = client.get("/api/reports/category-breakdown?account_ids=abc")
    assert resp.status_code == 422
