"""Tests for Enable Banking sync: normalisation, dedup, guards and callback security."""

from datetime import date, datetime, timedelta

import pytest

from app.models import Account, BankConnection, Transaction, User
from app.services import bank_sync_service as svc
from app.services import enable_banking_client as eb
from app.utils import crypto
from tests.factories import make_account, make_transaction


# --- fixtures -------------------------------------------------------------


@pytest.fixture()
def connection(db, seed_user):
    conn = BankConnection(
        user_id=seed_user.id,
        aspsp_name="Eurobank",
        aspsp_country="GR",
        status="active",
        session_id_encrypted=crypto.encrypt("session-abc"),
        consent_valid_until=datetime.utcnow() + timedelta(days=80),
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


@pytest.fixture()
def linked_account(db, seed_user, connection):
    account = Account(
        user_id=seed_user.id,
        name="Eurobank Current",
        type="checking",
        currency="EUR",
        balance=0,
        bank_connection_id=connection.id,
        external_account_id="uid-1",
        is_linked=True,
        is_active=True,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def raw_tx(**overrides):
    """A realistic Enable Banking transaction payload (snake_case, per their schema)."""
    payload = {
        "entry_reference": "REF-1",
        "transaction_amount": {"amount": "42.50", "currency": "EUR"},
        "credit_debit_indicator": "DBIT",
        "status": "BOOK",
        "booking_date": "2026-07-15",
        "value_date": "2026-07-15",
        "remittance_information": ["SKLAVENITIS ATHINA"],
    }
    payload.update(overrides)
    return payload


# --- normalisation --------------------------------------------------------


def test_debit_becomes_expense_with_positive_amount(linked_account):
    row = svc.normalize_transaction(raw_tx(), linked_account)
    assert row["type"] == "expense"
    # Enable Banking always sends a positive amount; direction is in the indicator.
    assert row["amount"] == 42.50
    assert row["date"] == date(2026, 7, 15)
    assert row["description"] == "SKLAVENITIS ATHINA"
    assert row["is_imported"] is True
    assert row["category_id"] is None


def test_credit_becomes_income(linked_account):
    row = svc.normalize_transaction(raw_tx(credit_debit_indicator="CRDT"), linked_account)
    assert row["type"] == "income"
    assert row["amount"] == 42.50


@pytest.mark.parametrize("status", ["PDNG", "HOLD", "RJCT", "CNCL", "SCHD"])
def test_only_booked_transactions_are_imported(linked_account, status):
    # Pending entries mutate and disappear; importing them would duplicate once booked.
    assert svc.normalize_transaction(raw_tx(status=status), linked_account) is None


def test_transaction_without_date_is_skipped(linked_account):
    raw = raw_tx()
    del raw["booking_date"]
    del raw["value_date"]
    assert svc.normalize_transaction(raw, linked_account) is None


def test_unparseable_amount_is_skipped(linked_account):
    raw = raw_tx(transaction_amount={"amount": "not-a-number", "currency": "EUR"})
    assert svc.normalize_transaction(raw, linked_account) is None


def test_description_falls_back_to_counterparty(linked_account):
    raw = raw_tx(remittance_information=[], creditor={"name": "DEI"})
    assert svc.normalize_transaction(raw, linked_account)["description"] == "DEI"


def test_description_uses_debtor_for_incoming(linked_account):
    raw = raw_tx(
        remittance_information=[],
        credit_debit_indicator="CRDT",
        debtor={"name": "ACME PAYROLL"},
    )
    assert svc.normalize_transaction(raw, linked_account)["description"] == "ACME PAYROLL"


def test_falls_back_to_value_date_when_booking_date_missing(linked_account):
    raw = raw_tx(value_date="2026-07-20")
    del raw["booking_date"]
    assert svc.normalize_transaction(raw, linked_account)["date"] == date(2026, 7, 20)


# --- external id ----------------------------------------------------------


def test_external_id_uses_entry_reference_scoped_to_account(linked_account):
    # transaction_id is explicitly NOT stable per Enable Banking's own schema,
    # so entry_reference must be what's used.
    assert svc.build_external_id(raw_tx(), linked_account) == f"{linked_account.id}:REF-1"


def test_external_id_ignores_unstable_transaction_id(linked_account):
    first = svc.build_external_id(raw_tx(transaction_id="AAA"), linked_account)
    second = svc.build_external_id(raw_tx(transaction_id="BBB"), linked_account)
    assert first == second, "a changing transaction_id must not change the dedup key"


def test_external_id_falls_back_to_content_hash(linked_account):
    raw = raw_tx()
    del raw["entry_reference"]
    external_id = svc.build_external_id(raw, linked_account)
    assert external_id.startswith(f"{linked_account.id}:h:")
    # Deterministic across calls, or every sync would re-import everything.
    assert external_id == svc.build_external_id(raw, linked_account)


def test_hash_fallback_differs_for_different_amounts(linked_account):
    a, b = raw_tx(), raw_tx(transaction_amount={"amount": "99.00", "currency": "EUR"})
    del a["entry_reference"], b["entry_reference"]
    assert svc.build_external_id(a, linked_account) != svc.build_external_id(b, linked_account)


def test_same_entry_reference_on_two_accounts_stays_distinct(db, seed_user, linked_account):
    # Enable Banking documents entry references as unique only WITHIN an account.
    other = make_account(db, seed_user, name="Second")
    assert svc.build_external_id(raw_tx(), linked_account) != svc.build_external_id(
        raw_tx(), other
    )


# --- balances -------------------------------------------------------------

def test_balance_prefers_booked_over_available():
    balances = [
        {"balance_type": "ITAV", "balance_amount": {"amount": "500.00"}},
        {"balance_type": "ITBD", "balance_amount": {"amount": "420.00"}},
    ]
    # Booked matches the booked-only transactions we import; available includes
    # pending authorisations and would disagree with the ledger.
    assert svc._pick_balance(balances) == 420.00


def test_balance_returns_none_when_empty():
    assert svc._pick_balance([]) is None


# --- dedup ----------------------------------------------------------------


def test_writing_the_same_batch_twice_inserts_once(db, linked_account):
    rows = [svc.normalize_transaction(raw_tx(), linked_account)]

    assert svc._write_transactions(db, linked_account, rows) == 1
    db.commit()
    assert svc._write_transactions(db, linked_account, rows) == 0, "re-sync must be idempotent"
    db.commit()

    assert db.query(Transaction).count() == 1


def test_duplicates_within_one_response_are_collapsed(db, linked_account):
    rows = [svc.normalize_transaction(raw_tx(), linked_account) for _ in range(3)]
    assert svc._write_transactions(db, linked_account, rows) == 1


def test_overlapping_window_only_adds_new_rows(db, linked_account):
    first = [svc.normalize_transaction(raw_tx(entry_reference=f"R{i}"), linked_account) for i in range(3)]
    assert svc._write_transactions(db, linked_account, first) == 3
    db.commit()

    # Next sync re-fetches the overlap window plus two genuinely new rows.
    second = [
        svc.normalize_transaction(raw_tx(entry_reference=f"R{i}"), linked_account)
        for i in range(5)
    ]
    assert svc._write_transactions(db, linked_account, second) == 2
    db.commit()
    assert db.query(Transaction).count() == 5


def test_dedup_does_not_leak_across_users(db, seed_user, linked_account):
    other_user = User(email="other@example.com", hashed_password="x", is_active=True)
    db.add(other_user)
    db.commit()
    other_account = make_account(db, other_user, name="Their Bank")

    rows = [svc.normalize_transaction(raw_tx(), linked_account)]
    assert svc._write_transactions(db, linked_account, rows) == 1
    db.commit()

    # A different user with a colliding reference must still get their row.
    their_rows = [svc.normalize_transaction(raw_tx(), other_account)]
    assert svc._write_transactions(db, other_account, their_rows) == 1
    db.commit()
    assert db.query(Transaction).count() == 2


# --- ASPSP error handling -------------------------------------------------


def _aspsp_400():
    """The exact body Eurobank returned in production."""

    class _Resp:
        status_code = 400
        text = '{"code":400,"message":"Error interacting with ASPSP","detail":"Unknown error","error":"ASPSP_ERROR"}'

        @staticmethod
        def json():
            return {
                "code": 400,
                "message": "Error interacting with ASPSP",
                "detail": "Unknown error",
                "error": "ASPSP_ERROR",
            }

    return _Resp()


def test_aspsp_error_body_is_classified_by_error_code(monkeypatch):
    # The HTTP status is 400 for a whole family of unrelated conditions, so the
    # body's `error` field is what must drive classification.
    assert isinstance(eb._classify(_aspsp_400()), eb.AspspError)


def test_wrong_transactions_period_is_classified(monkeypatch):
    class _Resp:
        status_code = 400
        text = '{"error":"WRONG_TRANSACTIONS_PERIOD"}'

        @staticmethod
        def json():
            return {"error": "WRONG_TRANSACTIONS_PERIOD"}

    assert isinstance(eb._classify(_Resp()), eb.WrongTransactionsPeriod)


def test_first_sync_uses_longest_strategy(monkeypatch, db, linked_account):
    """A never-synced account must not guess how much history the bank allows."""
    calls = []

    def fake(uid, date_from, strategy="default", **kw):
        calls.append(strategy)
        return []

    monkeypatch.setattr(eb, "get_transactions", fake)
    monkeypatch.setattr(eb, "get_balances", lambda uid: [])

    assert linked_account.last_synced_at is None
    svc.sync_account(db, linked_account)
    assert calls == ["longest"]


def test_incremental_sync_uses_default_strategy(monkeypatch, db, linked_account):
    calls = []

    def fake(uid, date_from, strategy="default", **kw):
        calls.append(strategy)
        return []

    monkeypatch.setattr(eb, "get_transactions", fake)
    monkeypatch.setattr(eb, "get_balances", lambda uid: [])

    linked_account.last_synced_at = datetime.utcnow() - timedelta(days=1)
    svc.sync_account(db, linked_account)
    assert calls == ["default"]


def test_window_narrows_when_the_bank_rejects_the_period(monkeypatch, linked_account):
    """Reproduces the production failure: reject the wide window, accept 90 days."""
    attempts = []

    def fake(uid, date_from, strategy="default", **kw):
        attempts.append((date_from, strategy))
        if len(attempts) == 1:
            raise eb.AspspError("Error interacting with ASPSP")
        return [raw_tx()]

    monkeypatch.setattr(eb, "get_transactions", fake)

    start = (datetime.utcnow() - timedelta(days=365)).date()
    rows = svc._fetch_with_fallback(linked_account, start, "longest")

    assert len(rows) == 1, "should have recovered instead of failing the account"
    assert attempts[0][1] == "longest"
    # Second attempt steps down to the 90-day floor most banks fall back to.
    assert attempts[1][0] == (datetime.utcnow() - timedelta(days=90)).date()


def test_fallback_gives_up_after_the_narrowest_window(monkeypatch, linked_account):
    def always_fail(uid, date_from, strategy="default", **kw):
        raise eb.AspspError("Error interacting with ASPSP")

    monkeypatch.setattr(eb, "get_transactions", always_fail)

    start = (datetime.utcnow() - timedelta(days=365)).date()
    with pytest.raises(eb.AspspError):
        svc._fetch_with_fallback(linked_account, start, "longest")


def test_incremental_window_is_not_widened_by_the_fallback(monkeypatch, linked_account):
    """A 3-day window failing is a bank problem, not a period problem."""
    attempts = []

    def fake(uid, date_from, strategy="default", **kw):
        attempts.append(date_from)
        raise eb.AspspError("boom")

    monkeypatch.setattr(eb, "get_transactions", fake)

    recent = (datetime.utcnow() - timedelta(days=3)).date()
    with pytest.raises(eb.AspspError):
        svc._fetch_with_fallback(linked_account, recent, "default")
    assert attempts == [recent], "must not reach further back than asked"


def test_transaction_status_filter_is_not_sent(monkeypatch):
    """Some ASPSPs reject the whole request when transaction_status is present."""
    captured = {}

    def fake_request(method, path, **kwargs):
        captured.update(kwargs.get("params") or {})
        return {"transactions": []}

    monkeypatch.setattr(eb, "_request", fake_request)
    eb.get_transactions("uid-1", date_from=date(2026, 1, 1))

    assert "transaction_status" not in captured
    assert captured["strategy"] == "default"


def test_longest_strategy_omits_date_to(monkeypatch):
    captured = {}

    def fake_request(method, path, **kwargs):
        captured.update(kwargs.get("params") or {})
        return {"transactions": []}

    monkeypatch.setattr(eb, "_request", fake_request)
    eb.get_transactions(
        "uid-1", date_from=date(2026, 1, 1), date_to=date(2026, 6, 1), strategy="longest"
    )

    # date_to is ignored by `longest`; sending it is noise.
    assert "date_to" not in captured


def test_aspsp_errors_are_retried_with_backoff(monkeypatch):
    calls = []
    monkeypatch.setattr(eb.time, "sleep", lambda s: calls.append(s))

    attempts = {"n": 0}

    def flaky(method, path, **kwargs):
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise eb.AspspError("transient")
        return {"ok": True}

    monkeypatch.setattr(eb, "_request_once", flaky)
    assert eb._request("GET", "/x") == {"ok": True}
    assert calls == [2.0, 4.0], "delay should double between attempts"


def test_rate_limits_are_never_retried(monkeypatch):
    """Retrying would burn the account's tiny daily quota."""
    slept = []
    monkeypatch.setattr(eb.time, "sleep", lambda s: slept.append(s))

    def limited(method, path, **kwargs):
        raise eb.RateLimited("429")

    monkeypatch.setattr(eb, "_request_once", limited)
    with pytest.raises(eb.RateLimited):
        eb._request("GET", "/x")
    assert slept == []


# --- connection state -----------------------------------------------------


def test_connection_with_lapsed_consent_is_not_usable(db, connection):
    connection.consent_valid_until = datetime.utcnow() - timedelta(days=1)
    assert connection.is_usable is False


def test_inactive_connection_is_not_usable(db, connection):
    connection.status = "expired"
    assert connection.is_usable is False


def test_active_connection_within_consent_is_usable(connection):
    assert connection.is_usable is True


def test_state_nonce_is_unique_and_long_enough():
    states = {svc.generate_state() for _ in range(200)}
    assert len(states) == 200
    assert all(24 <= len(s) <= 64 for s in states)


# --- API guards -----------------------------------------------------------


def test_manual_transaction_into_linked_account_is_rejected(client, linked_account):
    response = client.post(
        "/api/transactions/",
        json={
            "account_id": linked_account.id,
            "amount": 10,
            "type": "expense",
            "description": "manual",
            "date": "2026-07-01T00:00:00",
        },
    )
    assert response.status_code == 400
    assert "synced from your bank" in response.json()["detail"]


def test_transfer_into_linked_account_is_rejected(client, db, seed_user, linked_account):
    source = make_account(db, seed_user, name="Cash", type="cash")
    response = client.post(
        "/api/transactions/",
        json={
            "account_id": source.id,
            "destination_account_id": linked_account.id,
            "amount": 10,
            "type": "transfer",
            "description": "move",
            "date": "2026-07-01T00:00:00",
        },
    )
    assert response.status_code == 400


def test_balance_edit_on_linked_account_is_rejected(client, linked_account):
    response = client.put(f"/api/accounts/{linked_account.id}", json={"balance": 999})
    assert response.status_code == 400
    assert "cannot be edited" in response.json()["detail"]


def test_renaming_a_linked_account_is_allowed(client, linked_account):
    # Cosmetic fields stay editable — only bank-owned figures are frozen.
    response = client.put(f"/api/accounts/{linked_account.id}", json={"name": "Main"})
    assert response.status_code == 200
    assert response.json()["name"] == "Main"
    assert response.json()["is_linked"] is True


def test_deleting_a_linked_account_is_rejected(client, linked_account):
    response = client.delete(f"/api/accounts/{linked_account.id}")
    assert response.status_code == 400
    assert "Disconnect it" in response.json()["detail"]


def test_synced_transaction_cannot_be_deleted(client, db, linked_account, seed_user):
    tx = make_transaction(db, seed_user, linked_account)
    tx.external_id = f"{linked_account.id}:REF-1"
    db.commit()

    response = client.delete(f"/api/transactions/{tx.id}")
    assert response.status_code == 400
    # Deletion wouldn't stick anyway — dedup keys off external_id being present.
    assert "restore it" in response.json()["detail"]


def test_synced_transaction_amount_cannot_be_edited(client, db, linked_account, seed_user):
    tx = make_transaction(db, seed_user, linked_account)
    tx.external_id = f"{linked_account.id}:REF-1"
    db.commit()

    response = client.put(f"/api/transactions/{tx.id}", json={"amount": 1})
    assert response.status_code == 400


def test_synced_transaction_can_still_be_categorised(client, db, linked_account, seed_user):
    """The whole point of syncing uncategorised rows is that users can categorise them."""
    from tests.factories import make_category

    category = make_category(db, seed_user)
    tx = make_transaction(db, seed_user, linked_account)
    tx.external_id = f"{linked_account.id}:REF-1"
    db.commit()

    response = client.put(f"/api/transactions/{tx.id}", json={"category_id": category.id})
    assert response.status_code == 200
    assert response.json()["category_id"] == category.id


def test_bulk_delete_cannot_bypass_the_synced_guard(client, db, linked_account, seed_user):
    tx = make_transaction(db, seed_user, linked_account)
    tx.external_id = f"{linked_account.id}:REF-1"
    db.commit()

    response = client.post("/api/transactions/bulk-delete", json={"ids": [tx.id]})
    assert response.status_code == 400
    assert db.query(Transaction).filter(Transaction.id == tx.id).first() is not None


def test_csv_import_into_linked_account_is_rejected(client, db, seed_user, linked_account):
    from app.models import ImportBatch

    batch = ImportBatch(user_id=seed_user.id, filename="x.csv", file_type="csv", status="pending")
    db.add(batch)
    db.commit()
    db.refresh(batch)

    response = client.post(
        "/api/import/confirm",
        json={"batch_id": batch.id, "account_id": linked_account.id, "transactions": []},
    )
    assert response.status_code == 400


# --- callback security ----------------------------------------------------


def _callback(client, **params):
    return client.get("/api/bank-sync/callback", params=params, follow_redirects=False)


def test_callback_rejects_unknown_state(client):
    response = _callback(client, code="c", state="never-issued")
    assert response.status_code == 303
    assert "error=invalid_state" in response.headers["location"]


def test_callback_rejects_missing_state(client):
    response = _callback(client, code="c")
    assert "error=missing_state" in response.headers["location"]


def test_callback_rejects_expired_state(client, db, seed_user):
    conn = BankConnection(
        user_id=seed_user.id,
        aspsp_name="Eurobank",
        aspsp_country="GR",
        status="pending",
        state="expired-state",
        state_expires_at=datetime.utcnow() - timedelta(minutes=1),
    )
    db.add(conn)
    db.commit()

    response = _callback(client, code="c", state="expired-state")
    assert "error=state_expired" in response.headers["location"]


def test_callback_rejects_replayed_state(client, db, seed_user):
    """A single-use nonce is the only thing binding the callback to a user."""
    conn = BankConnection(
        user_id=seed_user.id,
        aspsp_name="Eurobank",
        aspsp_country="GR",
        status="active",
        state="used-state",
        state_expires_at=datetime.utcnow() + timedelta(minutes=10),
        state_used_at=datetime.utcnow(),
    )
    db.add(conn)
    db.commit()

    response = _callback(client, code="c", state="used-state")
    assert "error=state_already_used" in response.headers["location"]


def test_callback_does_not_trust_a_user_id_in_the_query_string(client, db, seed_user):
    """user_id must come from the stored row, never from the URL."""
    other = User(email="victim@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()

    conn = BankConnection(
        user_id=seed_user.id,
        aspsp_name="Eurobank",
        aspsp_country="GR",
        status="pending",
        state="s-1",
        state_expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(conn)
    db.commit()
    conn_id = conn.id

    _callback(client, code="bad", state="s-1", user_id=str(other.id))

    db.expire_all()
    assert db.get(BankConnection, conn_id).user_id == seed_user.id


# --- multi-tenant isolation -----------------------------------------------


def test_user_cannot_sync_another_users_connection(client, db):
    other = User(email="other2@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()

    theirs = BankConnection(
        user_id=other.id, aspsp_name="Alpha", aspsp_country="GR", status="active"
    )
    db.add(theirs)
    db.commit()

    assert client.post(f"/api/bank-sync/connections/{theirs.id}/sync").status_code in (404, 503)
    assert client.delete(f"/api/bank-sync/connections/{theirs.id}").status_code == 404


def test_connection_list_only_returns_own_connections(client, db, seed_user, connection):
    other = User(email="other3@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    db.add(
        BankConnection(
            user_id=other.id, aspsp_name="Piraeus", aspsp_country="GR", status="active"
        )
    )
    db.commit()

    body = client.get("/api/bank-sync/connections").json()
    assert [c["aspsp_name"] for c in body] == ["Eurobank"]


def test_pending_connections_are_hidden_from_the_list(client, db, seed_user):
    db.add(
        BankConnection(
            user_id=seed_user.id, aspsp_name="Abandoned", aspsp_country="GR", status="pending"
        )
    )
    db.commit()
    assert client.get("/api/bank-sync/connections").json() == []
