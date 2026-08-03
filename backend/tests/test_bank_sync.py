"""Tests for Enable Banking sync: normalisation, dedup, guards and callback security."""

from datetime import date, datetime, timedelta

import pytest

from app.models import Account, BankConnection, Transaction, User
from app.routers import bank_sync as bank_sync_router
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


def test_sync_applies_categorisation_rules_to_new_rows(monkeypatch, db, seed_user, linked_account):
    from app.models.category_rule import CategoryRule, CategoryRuleCondition
    from tests.factories import make_category

    cat = make_category(db, seed_user, name="Groceries")
    rule = CategoryRule(
        user_id=seed_user.id,
        name="Supermarkets",
        category_id=cat.id,
        match_type="all",
        priority=10,
        is_active=True,
    )
    db.add(rule)
    db.flush()
    db.add(
        CategoryRuleCondition(
            rule_id=rule.id,
            field="description",
            operator="contains",
            value="SKLAVENITIS",
        )
    )
    db.commit()

    monkeypatch.setattr(eb, "get_transactions", lambda *a, **k: [raw_tx()])
    monkeypatch.setattr(eb, "get_balances", lambda uid: [])

    svc.sync_account(db, linked_account)
    db.commit()

    tx = db.query(Transaction).filter_by(user_id=seed_user.id).one()
    assert tx.category_id == cat.id


def test_longest_failure_retries_default_at_the_same_range(monkeypatch, linked_account):
    """Reproduces the production failure seen for Eurobank GR: `strategy=longest`
    itself is rejected outright (bare ASPSP_ERROR, regardless of date_from).
    That says nothing about what `default` can serve, so it must be retried at
    the SAME wide range before the window narrows at all — recovering the
    full requested history instead of falling straight back to 90 days.
    """
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
    assert attempts[0] == (start, "longest")
    # Retried at the SAME range under `default`, not narrowed to 90 days.
    assert attempts[1] == (start, "default")


def test_window_narrows_when_default_also_rejects_the_wide_range(monkeypatch, linked_account):
    """When even `default` at the full range is refused, narrow progressively
    instead of jumping straight to 90 days — some ASPSPs will serve more.
    """
    attempts = []

    def fake(uid, date_from, strategy="default", **kw):
        attempts.append((date_from, strategy))
        if len(attempts) < 3:
            raise eb.AspspError("Error interacting with ASPSP")
        return [raw_tx()]

    monkeypatch.setattr(eb, "get_transactions", fake)

    start = (datetime.utcnow() - timedelta(days=365)).date()
    rows = svc._fetch_with_fallback(linked_account, start, "longest")

    assert len(rows) == 1, "should have recovered instead of failing the account"
    assert attempts[0] == (start, "longest")
    assert attempts[1] == (start, "default")
    # Third attempt steps down to the widest narrowing window (270 days).
    assert attempts[2][0] == (datetime.utcnow() - timedelta(days=270)).date()
    assert attempts[2][1] == "default"


def test_full_history_fallback_is_logged_at_warning(monkeypatch, linked_account, caplog):
    """A `longest` request falling back is the case that silently strands an
    account on ~90 days of history forever — it must be visible in logs, not
    buried at INFO alongside routine incremental-sync retries.
    """
    def fake(uid, date_from, strategy="default", **kw):
        if strategy == "longest":
            raise eb.AspspError("Error interacting with ASPSP")
        return [raw_tx()]

    monkeypatch.setattr(eb, "get_transactions", fake)

    start = (datetime.utcnow() - timedelta(days=365)).date()
    with caplog.at_level("WARNING", logger="app.bank_sync"):
        svc._fetch_with_fallback(linked_account, start, "longest")

    assert any(record.levelname == "WARNING" for record in caplog.records)


def test_incremental_fallback_stays_at_info(monkeypatch, linked_account, caplog):
    """The routine 3-day-overlap retries are expected and frequent; they must
    not be promoted to WARNING alongside the first-sync case above."""
    def fake(uid, date_from, strategy="default", **kw):
        raise eb.AspspError("Error interacting with ASPSP")

    monkeypatch.setattr(eb, "get_transactions", fake)

    recent = (datetime.utcnow() - timedelta(days=3)).date()
    with caplog.at_level("INFO", logger="app.bank_sync"):
        with pytest.raises(eb.AspspError):
            svc._fetch_with_fallback(linked_account, recent, "default")

    assert not any(record.levelname == "WARNING" for record in caplog.records)


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


# --- pending transactions -------------------------------------------------


@pytest.fixture()
def include_pending(monkeypatch):
    monkeypatch.setattr(svc.settings, "EB_INCLUDE_PENDING", True)


def test_pending_is_skipped_when_not_opted_in(linked_account, monkeypatch):
    monkeypatch.setattr(svc.settings, "EB_INCLUDE_PENDING", False)
    assert svc.normalize_transaction(raw_tx(status="PDNG"), linked_account) is None


def test_pending_is_imported_and_flagged_when_opted_in(linked_account, include_pending):
    row = svc.normalize_transaction(raw_tx(status="PDNG"), linked_account)
    assert row is not None
    assert row["is_pending"] is True


def test_booked_is_never_flagged_pending(linked_account, include_pending):
    assert svc.normalize_transaction(raw_tx(), linked_account)["is_pending"] is False


@pytest.mark.parametrize("status", ["HOLD", "RJCT", "CNCL", "SCHD"])
def test_non_pending_non_booked_states_stay_excluded(linked_account, include_pending, status):
    # Money that has not moved and may never move.
    assert svc.normalize_transaction(raw_tx(status=status), linked_account) is None


def test_pending_external_id_cannot_collide_with_its_booked_form(linked_account, include_pending):
    """The booked entry must not be swallowed as a duplicate of its pending self."""
    pending = svc.build_external_id(raw_tx(status="PDNG"), linked_account)
    booked = svc.build_external_id(raw_tx(status="BOOK"), linked_account)
    assert pending != booked
    assert ":pending:" in pending


def test_pending_ignores_entry_reference(linked_account, include_pending):
    # A pending id may change once booked, so it must not seed the dedup key.
    a = svc.build_external_id(raw_tx(status="PDNG", entry_reference="X1"), linked_account)
    b = svc.build_external_id(raw_tx(status="PDNG", entry_reference="X2"), linked_account)
    assert a == b


def test_settled_pending_row_is_removed_on_next_sync(db, linked_account, include_pending):
    """A pending entry that books must not linger alongside its booked twin."""
    first = [svc.normalize_transaction(raw_tx(status="PDNG"), linked_account)]
    assert svc._replace_pending(db, linked_account, first) == 1
    db.commit()
    assert db.query(Transaction).filter(Transaction.is_pending.is_(True)).count() == 1

    # Next sync: it booked, so it is no longer in the pending set.
    assert svc._replace_pending(db, linked_account, []) == 0
    db.commit()
    assert db.query(Transaction).filter(Transaction.is_pending.is_(True)).count() == 0


def test_replacing_pending_leaves_booked_rows_alone(db, linked_account, include_pending):
    booked = [svc.normalize_transaction(raw_tx(), linked_account)]
    svc._write_transactions(db, linked_account, booked)
    db.commit()

    svc._replace_pending(db, linked_account, [])
    db.commit()

    assert db.query(Transaction).filter(Transaction.is_pending.is_(False)).count() == 1


def test_pending_replacement_is_scoped_to_one_account(db, seed_user, linked_account, include_pending):
    other = make_account(db, seed_user, name="Other")
    theirs = [svc.normalize_transaction(raw_tx(status="PDNG"), other)]
    svc._replace_pending(db, other, theirs)
    db.commit()

    svc._replace_pending(db, linked_account, [])
    db.commit()

    assert db.query(Transaction).filter(Transaction.account_id == other.id).count() == 1


def test_repeated_pending_sync_does_not_accumulate(db, linked_account, include_pending):
    rows = [svc.normalize_transaction(raw_tx(status="PDNG"), linked_account)]
    for _ in range(3):
        svc._replace_pending(db, linked_account, rows)
        db.commit()
    assert db.query(Transaction).count() == 1


def test_balance_uses_available_when_pending_included(include_pending):
    balances = [
        {"balance_type": "ITAV", "balance_amount": {"amount": "500.00"}},
        {"balance_type": "ITBD", "balance_amount": {"amount": "420.00"}},
    ]
    # With pending in the ledger, the available balance is the one that ties.
    assert svc._pick_balance(balances) == 500.00


def test_balance_uses_booked_when_pending_excluded(monkeypatch):
    monkeypatch.setattr(svc.settings, "EB_INCLUDE_PENDING", False)
    balances = [
        {"balance_type": "ITAV", "balance_amount": {"amount": "500.00"}},
        {"balance_type": "ITBD", "balance_amount": {"amount": "420.00"}},
    ]
    assert svc._pick_balance(balances) == 420.00


# --- account editing ------------------------------------------------------


def test_renaming_a_linked_account_while_resending_unchanged_fields(client, linked_account):
    """The edit form submits the whole account, not just what changed."""
    response = client.put(
        f"/api/accounts/{linked_account.id}",
        json={
            "name": "Everyday",
            "icon": "eurobank.svg",
            "type": linked_account.type,
            "currency": linked_account.currency,
            "balance": linked_account.balance,
        },
    )
    assert response.status_code == 200, response.json()
    assert response.json()["name"] == "Everyday"
    assert response.json()["icon"] == "eurobank.svg"


def test_changing_the_balance_of_a_linked_account_is_still_rejected(client, linked_account):
    response = client.put(
        f"/api/accounts/{linked_account.id}",
        json={"name": "Everyday", "balance": linked_account.balance + 100},
    )
    assert response.status_code == 400
    assert "balance" in response.json()["detail"]


def test_unchanged_balance_is_not_rewritten(client, db, linked_account):
    linked_account.balance = 123.45
    db.commit()
    client.put(f"/api/accounts/{linked_account.id}", json={"name": "X", "balance": 123.45})
    db.refresh(linked_account)
    assert linked_account.balance == 123.45


# --- editing a synced transaction -----------------------------------------


@pytest.fixture()
def synced_tx(db, seed_user, linked_account):
    tx = make_transaction(db, seed_user, linked_account, amount=60.0)
    tx.external_id = f"{linked_account.id}:REF-1"
    db.commit()
    db.refresh(tx)
    return tx


def _full_edit_payload(tx, **overrides):
    """What the edit form actually submits: the whole transaction, not a diff."""
    payload = {
        "account_id": tx.account_id,
        "destination_account_id": tx.destination_account_id,
        "category_id": tx.category_id,
        "amount": tx.amount,
        "type": tx.type,
        "description": tx.description,
        "date": tx.date.isoformat(),
        "notes": tx.notes,
    }
    payload.update(overrides)
    return payload


def test_recategorising_a_synced_transaction_with_a_full_payload(client, db, seed_user, synced_tx):
    """Resending unchanged amount/date/account_id must not be read as an edit."""
    from tests.factories import make_category

    category = make_category(db, seed_user)
    response = client.put(
        f"/api/transactions/{synced_tx.id}",
        json=_full_edit_payload(synced_tx, category_id=category.id),
    )
    assert response.status_code == 200, response.json()
    assert response.json()["category_id"] == category.id


def test_editing_the_description_of_a_synced_transaction(client, synced_tx):
    response = client.put(
        f"/api/transactions/{synced_tx.id}",
        json=_full_edit_payload(synced_tx, description="Weekly shop"),
    )
    assert response.status_code == 200, response.json()
    assert response.json()["description"] == "Weekly shop"


def test_changing_the_amount_of_a_synced_transaction_is_still_rejected(client, synced_tx):
    response = client.put(
        f"/api/transactions/{synced_tx.id}",
        json=_full_edit_payload(synced_tx, amount=synced_tx.amount + 5),
    )
    assert response.status_code == 400
    assert "amount" in response.json()["detail"]


def test_moving_a_synced_transaction_to_another_account_is_rejected(
    client, db, seed_user, synced_tx
):
    other = make_account(db, seed_user, name="Cash", type="cash")
    response = client.put(
        f"/api/transactions/{synced_tx.id}",
        json=_full_edit_payload(synced_tx, account_id=other.id),
    )
    assert response.status_code == 400


def test_response_exposes_pending_and_synced_flags(client, db, seed_user, linked_account):
    """Regression: the list response was hand-built and omitted is_pending."""
    tx = make_transaction(db, seed_user, linked_account)
    tx.external_id = f"{linked_account.id}:P1"
    tx.is_pending = True
    db.commit()

    item = next(
        row for row in client.get("/api/transactions/").json()["items"] if row["id"] == tx.id
    )
    assert item["is_pending"] is True
    assert item["is_bank_synced"] is True


def test_manual_transaction_is_not_reported_as_synced(client, db, seed_user):
    account = make_account(db, seed_user, name="Cash", type="cash")
    tx = make_transaction(db, seed_user, account)
    item = next(
        row for row in client.get("/api/transactions/").json()["items"] if row["id"] == tx.id
    )
    assert item["is_bank_synced"] is False
    assert item["is_pending"] is False


# --- splitting a transaction ----------------------------------------------


def test_split_divides_the_amount_across_parts(client, db, seed_user, synced_tx):
    from tests.factories import make_category

    groceries = make_category(db, seed_user, name="Groceries")
    household = make_category(db, seed_user, name="Household")

    response = client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={
            "parts": [
                {"amount": 40.0, "category_id": groceries.id},
                {"amount": 20.0, "category_id": household.id},
            ]
        },
    )
    assert response.status_code == 200, response.json()
    parts = response.json()
    assert [p["amount"] for p in parts] == [40.0, 20.0]
    assert [p["category_id"] for p in parts] == [groceries.id, household.id]


def test_split_preserves_the_total(client, db, synced_tx):
    original = synced_tx.amount
    client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 25.0}, {"amount": 20.0}, {"amount": 15.0}]},
    )
    db.expire_all()
    total = sum(
        t.amount
        for t in db.query(Transaction).filter(Transaction.account_id == synced_tx.account_id)
    )
    assert round(total, 2) == round(original, 2)


def test_split_keeps_description_and_date(client, db, synced_tx):
    response = client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 30.0}, {"amount": 30.0}]},
    )
    parts = response.json()
    assert {p["description"] for p in parts} == {synced_tx.description}
    assert len({p["date"] for p in parts}) == 1


def test_split_reuses_the_original_row_so_dedup_still_holds(client, db, synced_tx):
    """The original carries external_id; deleting it would re-import the charge."""
    original_id = synced_tx.id
    original_external = synced_tx.external_id

    client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 30.0}, {"amount": 30.0}]},
    )
    db.expire_all()

    kept = db.get(Transaction, original_id)
    assert kept is not None, "the original row must survive a split"
    assert kept.external_id == original_external
    assert kept.amount == 30.0


def test_split_parts_get_ids_no_bank_can_produce(client, db, synced_tx):
    client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 30.0}, {"amount": 30.0}]},
    )
    db.expire_all()
    extras = (
        db.query(Transaction)
        .filter(Transaction.external_id.like("%:split:%"))
        .all()
    )
    assert len(extras) == 1
    assert extras[0].external_id == f"{synced_tx.external_id}:split:1"


def test_resyncing_after_a_split_does_not_duplicate(db, linked_account, synced_tx):
    """The bank re-sends the original charge; dedup must still recognise it."""
    synced_tx.amount = 30.0
    db.add(
        Transaction(
            user_id=synced_tx.user_id,
            account_id=synced_tx.account_id,
            amount=30.0,
            type="expense",
            description=synced_tx.description,
            date=synced_tx.date,
            external_id=f"{synced_tx.external_id}:split:1",
        )
    )
    db.commit()
    before = db.query(Transaction).count()

    rows = [svc.normalize_transaction(raw_tx(), linked_account)]
    assert svc._write_transactions(db, linked_account, rows) == 0
    db.commit()
    assert db.query(Transaction).count() == before


def test_split_rejects_parts_that_do_not_add_up(client, synced_tx):
    response = client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 10.0}, {"amount": 20.0}]},
    )
    assert response.status_code == 400
    assert "add up" in response.json()["detail"]


def test_split_requires_at_least_two_parts(client, synced_tx):
    response = client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 60.0}]},
    )
    assert response.status_code == 422


def test_split_rejects_zero_or_negative_parts(client, synced_tx):
    response = client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 60.0}, {"amount": 0}]},
    )
    assert response.status_code == 422


def test_split_handles_amounts_that_do_not_sum_exactly_in_floats(client, db, seed_user, linked_account):
    """0.1 + 0.2 != 0.3 in binary floats; cents comparison must not care."""
    tx = make_transaction(db, seed_user, linked_account, amount=0.3)
    tx.external_id = f"{linked_account.id}:F1"
    db.commit()

    response = client.post(
        f"/api/transactions/{tx.id}/split",
        json={"parts": [{"amount": 0.1}, {"amount": 0.2}]},
    )
    assert response.status_code == 200, response.json()


def test_split_rejects_a_transfer(client, db, seed_user):
    source = make_account(db, seed_user, name="A", type="cash")
    dest = make_account(db, seed_user, name="B", type="cash")
    tx = make_transaction(db, seed_user, source, amount=50.0, type="transfer")
    tx.destination_account_id = dest.id
    db.commit()

    response = client.post(
        f"/api/transactions/{tx.id}/split",
        json={"parts": [{"amount": 25.0}, {"amount": 25.0}]},
    )
    assert response.status_code == 400


def test_split_rejects_a_category_from_another_user(client, db, synced_tx):
    from tests.factories import make_category

    other = User(email="thief@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    theirs = make_category(db, other, name="Theirs")

    response = client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 30.0, "category_id": theirs.id}, {"amount": 30.0}]},
    )
    assert response.status_code == 404


def test_split_cannot_touch_another_users_transaction(client, db):
    other = User(email="victim2@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    their_account = make_account(db, other, name="Theirs")
    their_tx = make_transaction(db, other, their_account, amount=50.0)

    response = client.post(
        f"/api/transactions/{their_tx.id}/split",
        json={"parts": [{"amount": 25.0}, {"amount": 25.0}]},
    )
    assert response.status_code == 404


def test_split_leaves_the_account_balance_alone(client, db, linked_account, synced_tx):
    linked_account.balance = 500.0
    db.commit()

    client.post(
        f"/api/transactions/{synced_tx.id}/split",
        json={"parts": [{"amount": 30.0}, {"amount": 30.0}]},
    )
    db.refresh(linked_account)
    # The total is unchanged by construction, so the balance must not move.
    assert linked_account.balance == 500.0


def test_split_can_be_applied_to_a_manual_transaction(client, db, seed_user):
    account = make_account(db, seed_user, name="Cash", type="cash")
    tx = make_transaction(db, seed_user, account, amount=100.0)

    response = client.post(
        f"/api/transactions/{tx.id}/split",
        json={"parts": [{"amount": 60.0}, {"amount": 40.0}]},
    )
    assert response.status_code == 200
    # Manual rows have no external_id, so parts get none either.
    assert all(p["is_bank_synced"] is False for p in response.json())


# --- re-authorisation reopens the full-history window ----------------------


def test_relinking_an_existing_account_resets_last_synced_at(db, seed_user, linked_account):
    """A fresh authorisation reopens Enable Banking's short post-auth window for
    full history, even for an account that got stuck on a narrow one on its
    first sync. Clearing last_synced_at is what makes the next sync retry
    strategy=longest instead of resuming from the old, narrow cutoff.
    """
    linked_account.last_synced_at = datetime.utcnow() - timedelta(days=10)
    db.commit()

    new_connection = BankConnection(
        user_id=seed_user.id,
        aspsp_name="Eurobank",
        aspsp_country="GR",
        status="active",
    )
    db.add(new_connection)
    db.commit()
    db.refresh(new_connection)

    created = bank_sync_router._link_accounts(
        db, new_connection, [{"uid": linked_account.external_account_id}]
    )
    db.commit()
    db.refresh(linked_account)

    assert created == 1
    assert linked_account.last_synced_at is None
    assert linked_account.bank_connection_id == new_connection.id


def test_relinking_makes_the_next_sync_use_longest_again(monkeypatch, db, seed_user, linked_account):
    """End-to-end check: after a re-link, sync_account must behave exactly like
    a first-ever sync, because that is what unlocks more history.
    """
    linked_account.last_synced_at = datetime.utcnow() - timedelta(days=10)
    db.commit()

    new_connection = BankConnection(
        user_id=seed_user.id, aspsp_name="Eurobank", aspsp_country="GR", status="active"
    )
    db.add(new_connection)
    db.commit()

    bank_sync_router._link_accounts(
        db, new_connection, [{"uid": linked_account.external_account_id}]
    )
    db.commit()
    db.refresh(linked_account)

    calls = []

    def fake(uid, date_from, strategy="default", **kw):
        calls.append(strategy)
        return []

    monkeypatch.setattr(eb, "get_transactions", fake)
    monkeypatch.setattr(eb, "get_balances", lambda uid: [])

    svc.sync_account(db, linked_account)
    assert calls == ["longest"]


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


# --- disconnecting --------------------------------------------------------


def _disconnect(client, connection_id, delete_accounts):
    return client.delete(
        f"/api/bank-sync/connections/{connection_id}",
        params={"delete_accounts": str(delete_accounts).lower()},
    )


def test_keeping_accounts_unlinks_them(client, db, connection, linked_account):
    response = _disconnect(client, connection.id, False)
    assert response.status_code == 200
    assert response.json()["accounts_unlinked"] == 1
    assert response.json()["accounts_deleted"] == 0

    db.expire_all()
    account = db.get(Account, linked_account.id)
    assert account is not None
    assert account.is_linked is False
    assert account.bank_connection_id is None


def test_kept_transactions_become_editable(client, db, seed_user, connection, linked_account):
    """The whole point of keeping them: they must behave as ordinary rows.

    Every guard treats "has an external_id" as "owned by the bank", so leaving
    it set would freeze the history on an account the user asked to be normal.
    """
    tx = make_transaction(db, seed_user, linked_account, amount=25.0)
    tx.external_id = f"{linked_account.id}:REF-9"
    db.commit()
    tx_id = tx.id

    assert _disconnect(client, connection.id, False).status_code == 200

    db.expire_all()
    assert db.get(Transaction, tx_id).external_id is None

    # Previously rejected as a bank-owned field.
    edit = client.put(f"/api/transactions/{tx_id}", json={"amount": 99.0})
    assert edit.status_code == 200, edit.json()
    # And deletion, which used to be refused outright.
    assert client.delete(f"/api/transactions/{tx_id}").status_code == 200


def test_keeping_accounts_preserves_booked_history(
    client, db, seed_user, connection, linked_account
):
    for i in range(3):
        tx = make_transaction(db, seed_user, linked_account)
        tx.external_id = f"{linked_account.id}:R{i}"
    db.commit()

    response = _disconnect(client, connection.id, False)
    assert response.json()["transactions_released"] == 3
    assert db.query(Transaction).count() == 3


def test_pending_rows_are_dropped_when_keeping(
    client, db, seed_user, connection, linked_account
):
    """Nothing will ever settle or withdraw them once syncing stops."""
    booked = make_transaction(db, seed_user, linked_account)
    booked.external_id = f"{linked_account.id}:B1"
    pending = make_transaction(db, seed_user, linked_account)
    pending.external_id = f"{linked_account.id}:pending:abc"
    pending.is_pending = True
    db.commit()
    booked_id = booked.id

    response = _disconnect(client, connection.id, False)
    assert response.json()["transactions_deleted"] == 1

    db.expire_all()
    remaining = db.query(Transaction).all()
    assert [t.id for t in remaining] == [booked_id]


def test_deleting_removes_accounts_and_transactions(
    client, db, seed_user, connection, linked_account
):
    for i in range(2):
        tx = make_transaction(db, seed_user, linked_account)
        tx.external_id = f"{linked_account.id}:D{i}"
    db.commit()
    account_id = linked_account.id

    response = _disconnect(client, connection.id, True)
    assert response.status_code == 200
    assert response.json()["accounts_deleted"] == 1
    assert response.json()["transactions_deleted"] == 2

    db.expire_all()
    assert db.get(Account, account_id) is None
    assert db.query(Transaction).count() == 0


def test_disconnecting_removes_the_connection_either_way(client, db, connection):
    connection_id = connection.id
    assert _disconnect(client, connection_id, False).status_code == 200
    db.expire_all()
    assert db.get(BankConnection, connection_id) is None


def test_deleting_does_not_touch_another_users_data(client, db, connection, linked_account):
    other = User(email="bystander@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    their_account = make_account(db, other, name="Theirs")
    their_tx = make_transaction(db, other, their_account)
    their_tx_id = their_tx.id

    _disconnect(client, connection.id, True)

    db.expire_all()
    assert db.get(Transaction, their_tx_id) is not None


# --- per-account unlink ---------------------------------------------------


@pytest.fixture()
def second_linked_account(db, seed_user, connection):
    account = Account(
        user_id=seed_user.id,
        name="Eurobank Savings",
        type="savings",
        currency="EUR",
        balance=0,
        bank_connection_id=connection.id,
        external_account_id="uid-2",
        is_linked=True,
        is_active=True,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _unlink(client, account_id, delete_account=False):
    return client.delete(
        f"/api/bank-sync/accounts/{account_id}",
        params={"delete_account": str(delete_account).lower()},
    )


def test_unlinking_one_account_leaves_the_others_syncing(
    client, db, connection, linked_account, second_linked_account
):
    """The whole point: one authorisation, but only some accounts wanted."""
    response = _unlink(client, linked_account.id)
    assert response.status_code == 200
    assert response.json()["connection_removed"] is False

    db.expire_all()
    assert db.get(Account, linked_account.id).is_linked is False
    kept = db.get(Account, second_linked_account.id)
    assert kept.is_linked is True
    assert kept.bank_connection_id == connection.id
    assert db.get(BankConnection, connection.id) is not None


def test_unlinked_account_transactions_become_editable(
    client, db, seed_user, linked_account, second_linked_account
):
    tx = make_transaction(db, seed_user, linked_account, amount=25.0)
    tx.external_id = f"{linked_account.id}:REF-7"
    db.commit()
    tx_id = tx.id

    assert _unlink(client, linked_account.id).json()["transactions_released"] == 1

    db.expire_all()
    assert db.get(Transaction, tx_id).external_id is None
    assert client.put(f"/api/transactions/{tx_id}", json={"amount": 99.0}).status_code == 200


def test_unlinking_does_not_touch_the_other_accounts_transactions(
    client, db, seed_user, linked_account, second_linked_account
):
    keeper = make_transaction(db, seed_user, second_linked_account)
    keeper.external_id = f"{second_linked_account.id}:KEEP"
    db.commit()
    keeper_id = keeper.id

    _unlink(client, linked_account.id, delete_account=True)

    db.expire_all()
    still_there = db.get(Transaction, keeper_id)
    assert still_there is not None
    assert still_there.external_id == f"{second_linked_account.id}:KEEP"


def test_deleting_one_account_removes_only_its_transactions(
    client, db, seed_user, linked_account, second_linked_account
):
    doomed = make_transaction(db, seed_user, linked_account)
    doomed.external_id = f"{linked_account.id}:X"
    survivor = make_transaction(db, seed_user, second_linked_account)
    survivor.external_id = f"{second_linked_account.id}:Y"
    db.commit()
    account_id = linked_account.id

    response = _unlink(client, account_id, delete_account=True)
    assert response.json()["transactions_deleted"] == 1

    db.expire_all()
    assert db.get(Account, account_id) is None
    assert db.query(Transaction).count() == 1


def test_unlinking_the_last_account_removes_the_connection(
    client, db, connection, linked_account
):
    """A connection with nothing left to sync is dead weight holding live consent."""
    response = _unlink(client, linked_account.id)
    assert response.status_code == 200
    assert response.json()["connection_removed"] is True

    db.expire_all()
    assert db.get(BankConnection, connection.id) is None


def test_unlinking_pending_rows_drops_them(client, db, seed_user, linked_account):
    pending = make_transaction(db, seed_user, linked_account)
    pending.external_id = f"{linked_account.id}:pending:zz"
    pending.is_pending = True
    db.commit()

    assert _unlink(client, linked_account.id).json()["transactions_deleted"] == 1
    db.expire_all()
    assert db.query(Transaction).count() == 0


def test_unlinking_a_manual_account_is_rejected(client, db, seed_user):
    manual = make_account(db, seed_user, name="Cash", type="cash")
    response = _unlink(client, manual.id)
    assert response.status_code == 400
    assert "not linked" in response.json()["detail"]


def test_cannot_unlink_another_users_account(client, db):
    other = User(email="victim3@example.com", hashed_password="x", is_active=True)
    db.add(other)
    db.commit()
    theirs = make_account(db, other, name="Theirs")
    assert _unlink(client, theirs.id).status_code == 404


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
