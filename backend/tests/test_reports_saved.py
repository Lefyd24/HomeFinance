from datetime import date
from tests.factories import make_account, make_category, make_transaction


def test_save_and_list_view(client):
    payload = {"name": "My Cashflow", "report_type": "cashflow",
               "configuration": '{"tab":"cashflow","filters":{"range":"6M"}}'}
    r = client.post("/api/reports/save", json=payload)
    assert r.status_code == 200
    saved = client.get("/api/reports/saved").json()
    assert any(s["name"] == "My Cashflow" for s in saved)


def test_csv_export(client, db, seed_user):
    acc = make_account(db, seed_user)
    cat = make_category(db, seed_user, name="Food")
    make_transaction(db, seed_user, acc, cat, amount=12.5, type="expense", tx_date=date.today())
    r = client.get("/api/reports/export?report=spending")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "Food" in r.text
