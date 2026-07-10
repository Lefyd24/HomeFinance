from datetime import date
from tests.factories import make_account, make_category, make_transaction


def test_income_report_shape(client, db, seed_user):
    acc = make_account(db, seed_user)
    cat = make_category(db, seed_user, name="Salary", type="income")
    make_transaction(db, seed_user, acc, cat, amount=2000, type="income",
                     tx_date=date.today())
    r = client.get("/api/reports/income")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"labels", "data"}
    assert "Salary" in body["labels"]


def test_balance_history_has_series_per_account(client, db, seed_user):
    a1 = make_account(db, seed_user, name="Checking")
    a2 = make_account(db, seed_user, name="Savings")
    make_transaction(db, seed_user, a1, amount=100, type="income", tx_date=date.today())
    r = client.get("/api/reports/balance-history")
    assert r.status_code == 200
    body = r.json()
    names = {s["name"] for s in body["series"]}
    assert {"Checking", "Savings", "Total"} <= names
    assert all(len(s["data"]) == len(body["labels"]) for s in body["series"])
