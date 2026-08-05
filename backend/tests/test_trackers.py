from datetime import date

from app.models import Tracker, TrackerTransaction

from .factories import make_account, make_category, make_transaction


def make_tracker(client, name="Trip to Italy", **kwargs):
    payload = {"name": name, **kwargs}
    resp = client.post("/api/trackers/", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_tracker_without_target_amount(client):
    tracker = make_tracker(client)

    assert tracker["target_amount"] is None
    assert tracker["is_active"] is True
    assert tracker["transaction_count"] == 0
    assert tracker["total_amount"] == 0
    assert tracker["progress_percentage"] is None


def test_create_tracker_with_target_amount_reports_progress(client, db, seed_user):
    tracker = make_tracker(client, target_amount=1000)
    account = make_account(db, seed_user)

    client.post(
        f"/api/trackers/{tracker['id']}/transactions",
        json={
            "account_id": account.id,
            "amount": 250,
            "type": "expense",
            "description": "Flights",
            "date": date.today().isoformat(),
        },
    )

    updated = client.get(f"/api/trackers/{tracker['id']}").json()
    assert updated["total_amount"] == 250
    assert updated["progress_percentage"] == 25.0
    assert updated["remaining_amount"] == 750


def test_add_transaction_creates_real_transaction_and_moves_balance(
    client, db, seed_user
):
    tracker = make_tracker(client)
    account = make_account(db, seed_user, balance=1000.0)
    category = make_category(db, seed_user)

    resp = client.post(
        f"/api/trackers/{tracker['id']}/transactions",
        json={
            "account_id": account.id,
            "category_id": category.id,
            "amount": 120.5,
            "type": "expense",
            "description": "Hotel",
            "date": date.today().isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["transaction_count"] == 1

    listing = client.get("/api/transactions/").json()
    assert listing["total"] == 1
    assert listing["items"][0]["description"] == "Hotel"
    assert listing["items"][0]["tracker_names"] == ["Trip to Italy"]

    db.refresh(account)
    assert account.balance == 879.5


def test_income_inside_a_tracker_reduces_the_total(client, db, seed_user):
    tracker = make_tracker(client)
    account = make_account(db, seed_user)
    spend = make_transaction(db, seed_user, account, amount=200, type="expense")
    refund = make_transaction(db, seed_user, account, amount=50, type="income")

    for tx in (spend, refund):
        client.post(
            f"/api/trackers/{tracker['id']}/transactions/link",
            json={"transaction_id": tx.id},
        )

    detail = client.get(f"/api/trackers/{tracker['id']}/transactions").json()
    assert detail["count"] == 2
    assert detail["total_amount"] == 150


def test_setting_trackers_on_a_transaction_replaces_the_whole_set(
    client, db, seed_user
):
    italy = make_tracker(client, name="Italy")
    kitchen = make_tracker(client, name="Kitchen")
    account = make_account(db, seed_user)
    tx = make_transaction(db, seed_user, account)

    resp = client.put(
        f"/api/transactions/{tx.id}/trackers",
        json={"tracker_ids": [italy["id"], kitchen["id"]]},
    )
    assert resp.status_code == 200
    assert sorted(resp.json()["tracker_ids"]) == sorted([italy["id"], kitchen["id"]])

    resp = client.put(
        f"/api/transactions/{tx.id}/trackers", json={"tracker_ids": [kitchen["id"]]}
    )
    assert resp.json()["tracker_ids"] == [kitchen["id"]]

    resp = client.put(f"/api/transactions/{tx.id}/trackers", json={"tracker_ids": []})
    assert resp.json()["tracker_ids"] == []
    assert db.query(TrackerTransaction).count() == 0


def test_active_only_filter_hides_inactive_trackers(client):
    active = make_tracker(client, name="Active one")
    inactive = make_tracker(client, name="Done with this")
    client.put(f"/api/trackers/{inactive['id']}", json={"is_active": False})

    names = [t["name"] for t in client.get("/api/trackers/?active_only=true").json()]
    assert names == [active["name"]]

    assert len(client.get("/api/trackers/").json()) == 2


def test_first_and_last_transaction_dates(client, db, seed_user):
    tracker = make_tracker(client)
    account = make_account(db, seed_user)
    older = make_transaction(db, seed_user, account, tx_date=date(2026, 1, 5))
    newer = make_transaction(db, seed_user, account, tx_date=date(2026, 3, 20))

    for tx in (older, newer):
        client.post(
            f"/api/trackers/{tracker['id']}/transactions/link",
            json={"transaction_id": tx.id},
        )

    detail = client.get(f"/api/trackers/{tracker['id']}").json()
    assert detail["first_transaction_date"] == "2026-01-05"
    assert detail["last_transaction_date"] == "2026-03-20"


def test_removing_a_transaction_from_a_tracker_keeps_the_transaction(
    client, db, seed_user
):
    tracker = make_tracker(client)
    account = make_account(db, seed_user)
    tx = make_transaction(db, seed_user, account)
    client.post(
        f"/api/trackers/{tracker['id']}/transactions/link",
        json={"transaction_id": tx.id},
    )

    resp = client.delete(f"/api/trackers/{tracker['id']}/transactions/{tx.id}")
    assert resp.status_code == 200

    assert client.get(f"/api/trackers/{tracker['id']}").json()["transaction_count"] == 0
    assert client.get("/api/transactions/").json()["total"] == 1


def test_deleting_a_transaction_drops_its_tracker_membership(client, db, seed_user):
    tracker = make_tracker(client)
    account = make_account(db, seed_user)
    tx = make_transaction(db, seed_user, account)
    client.post(
        f"/api/trackers/{tracker['id']}/transactions/link",
        json={"transaction_id": tx.id},
    )

    assert client.delete(f"/api/transactions/{tx.id}").status_code == 200

    assert db.query(TrackerTransaction).count() == 0
    assert client.get(f"/api/trackers/{tracker['id']}").json()["transaction_count"] == 0


def test_deleting_a_tracker_keeps_its_transactions(client, db, seed_user):
    tracker = make_tracker(client)
    account = make_account(db, seed_user)
    tx = make_transaction(db, seed_user, account)
    client.post(
        f"/api/trackers/{tracker['id']}/transactions/link",
        json={"transaction_id": tx.id},
    )

    assert client.delete(f"/api/trackers/{tracker['id']}").status_code == 200

    assert db.query(Tracker).count() == 0
    assert db.query(TrackerTransaction).count() == 0
    assert client.get("/api/transactions/").json()["total"] == 1


def test_linking_the_same_transaction_twice_is_a_no_op(client, db, seed_user):
    tracker = make_tracker(client)
    account = make_account(db, seed_user)
    tx = make_transaction(db, seed_user, account)

    for _ in range(2):
        resp = client.post(
            f"/api/trackers/{tracker['id']}/transactions/link",
            json={"transaction_id": tx.id},
        )
        assert resp.status_code == 200

    assert resp.json()["transaction_count"] == 1


def test_tracker_endpoints_reject_unknown_ids(client, db, seed_user):
    assert client.get("/api/trackers/999").status_code == 404

    account = make_account(db, seed_user)
    tx = make_transaction(db, seed_user, account)
    resp = client.put(f"/api/transactions/{tx.id}/trackers", json={"tracker_ids": [999]})
    assert resp.status_code == 404


def test_tracker_transaction_rejects_linked_account(client, db, seed_user):
    tracker = make_tracker(client)
    linked = make_account(db, seed_user, name="Bank", is_linked=True)

    resp = client.post(
        f"/api/trackers/{tracker['id']}/transactions",
        json={
            "account_id": linked.id,
            "amount": 10,
            "type": "expense",
            "description": "Nope",
            "date": date.today().isoformat(),
        },
    )
    assert resp.status_code == 400
