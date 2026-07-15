from datetime import date, timedelta

from tests.factories import make_account, make_recurring


def test_disable_drops_from_upcoming(client, db, seed_user):
    account = make_account(db, seed_user)
    expense = make_recurring(
        db, seed_user, account=account, name="Netflix", amount=15.0,
        next_due_date=date.today() + timedelta(days=3),
    )

    resp = client.get("/api/recurring-expenses/upcoming?days=15")
    assert resp.status_code == 200
    assert any(e["recurring_expense_id"] == expense.id for e in resp.json())

    disable_resp = client.put(f"/api/recurring-expenses/{expense.id}", json={"is_active": False})
    assert disable_resp.status_code == 200
    assert disable_resp.json()["is_active"] is False

    upcoming_after = client.get("/api/recurring-expenses/upcoming?days=15")
    assert not any(e["recurring_expense_id"] == expense.id for e in upcoming_after.json())

    enable_resp = client.put(f"/api/recurring-expenses/{expense.id}", json={"is_active": True})
    assert enable_resp.status_code == 200
    assert enable_resp.json()["is_active"] is True

    upcoming_reenabled = client.get("/api/recurring-expenses/upcoming?days=15")
    assert any(e["recurring_expense_id"] == expense.id for e in upcoming_reenabled.json())


def test_disable_retains_payment_history(client, db, seed_user):
    account = make_account(db, seed_user)
    expense = make_recurring(
        db, seed_user, account=account, name="Netflix", amount=15.0,
        next_due_date=date.today(),
    )

    pay_resp = client.post(
        f"/api/recurring-expenses/{expense.id}/payments",
        json={"amount": 15.0, "payment_date": date.today().isoformat()},
    )
    assert pay_resp.status_code == 201

    disable_resp = client.put(f"/api/recurring-expenses/{expense.id}", json={"is_active": False})
    assert disable_resp.status_code == 200

    txns_resp = client.get(f"/api/recurring-expenses/{expense.id}/transactions")
    assert txns_resp.status_code == 200
    assert txns_resp.json()["summary"]["payment_count"] == 1


def test_active_only_filter(client, db, seed_user):
    account = make_account(db, seed_user)
    make_recurring(db, seed_user, account=account, name="Active One", is_active=True)
    make_recurring(db, seed_user, account=account, name="Disabled One", is_active=False)

    resp_all = client.get("/api/recurring-expenses/")
    assert len(resp_all.json()) == 2

    resp_active = client.get("/api/recurring-expenses/?active_only=true")
    names = [e["name"] for e in resp_active.json()]
    assert names == ["Active One"]
