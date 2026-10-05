from app.config import settings
from app.utils.file_parsers import parse_bank_file

CSV = b"Date,Description,Amount\n2026-07-01,Coffee,-4.50\nTotal,,-4.50\n2026-07-02,Salary,1500\n"


def _upload(client, content: bytes, name: str = "t.csv", date_format: str | None = "ymd"):
    data = {} if date_format is None else {"date_format": date_format}
    return client.post("/api/import/upload", files={"file": (name, content, "text/csv")}, data=data)


def test_upload_requires_a_date_format(client):
    assert _upload(client, CSV, date_format=None).status_code == 422
    res = _upload(client, CSV, date_format="auto")
    assert res.status_code == 400
    assert "date format" in res.json()["detail"]


def test_upload_uses_the_chosen_date_format(client):
    content = b"Date,Description,Amount\n05/01/2026,A,-1\n"
    dmy = _upload(client, content, date_format="dmy").json()["batch_id"]
    mdy = _upload(client, content, date_format="mdy").json()["batch_id"]
    assert client.get(f"/api/import/preview/{dmy}").json()["transactions"][0]["date"].startswith("2026-01-05")
    assert client.get(f"/api/import/preview/{mdy}").json()["transactions"][0]["date"].startswith("2026-05-01")


def test_upload_returns_batch_and_skipped_rows(client):
    res = _upload(client, CSV)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_rows"] == 2
    assert body["skipped"] == [{"line": 3, "reason": "invalid_date", "value": "Total"}]


def test_upload_rejects_files_over_the_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE", 20)
    res = _upload(client, CSV)
    assert res.status_code == 413
    assert "MB" in res.json()["detail"]


def test_upload_returns_parser_message_for_bad_headers(client):
    res = _upload(client, b"foo,bar\n1,2\n")
    assert res.status_code == 400
    assert "column headers" in res.json()["detail"]


def test_upload_rejects_unknown_extension(client):
    res = _upload(client, CSV, name="t.pdf")
    assert res.status_code == 400


def test_xls_engine_is_installed():
    # Without xlrd, pandas raises ImportError for .xls; the parser must turn a bad
    # .xls into a readable message, which proves the engine was found and tried.
    import xlrd  # noqa: F401

    try:
        parse_bank_file(b"not an xls", "xls", "dmy")
    except ValueError as exc:
        assert "Excel" in str(exc)


from datetime import date

from tests.factories import make_account, make_transaction


def _preview(client, batch_id, **params):
    return client.get(f"/api/import/preview/{batch_id}", params=params)


def test_preview_lists_rows_with_type_and_line(client):
    batch_id = _upload(client, CSV).json()["batch_id"]
    rows = _preview(client, batch_id).json()["transactions"]
    assert [(r["id"], r["line"], r["date"], r["amount"], r["type"]) for r in rows] == [
        (1, 2, "2026-07-01", -4.5, "expense"),
        (2, 4, "2026-07-02", 1500.0, "income"),
    ]
    assert all(r["is_duplicate"] is False for r in rows)


def test_preview_invert_signs_flips_type(client):
    batch_id = _upload(client, CSV).json()["batch_id"]
    rows = _preview(client, batch_id, invert_signs=True).json()["transactions"]
    assert [(r["amount"], r["type"]) for r in rows] == [(4.5, "income"), (-1500.0, "expense")]


def test_preview_flags_rows_already_in_account(client, db, seed_user):
    account = make_account(db, seed_user)
    make_transaction(db, seed_user, account, amount=4.5, type="expense",
                     tx_date=date(2026, 7, 2), description="COFFEE")
    batch_id = _upload(client, CSV).json()["batch_id"]
    body = _preview(client, batch_id, account_id=account.id).json()
    assert [r["is_duplicate"] for r in body["transactions"]] == [True, False]
    assert [r["id"] for r in body["duplicates"]] == [1]


def test_preview_does_not_flag_same_amount_with_different_description(client, db, seed_user):
    account = make_account(db, seed_user)
    make_transaction(db, seed_user, account, amount=4.5, type="expense",
                     tx_date=date(2026, 7, 1), description="Bakery")
    batch_id = _upload(client, CSV).json()["batch_id"]
    rows = _preview(client, batch_id, account_id=account.id).json()["transactions"]
    assert rows[0]["is_duplicate"] is False


def test_preview_rejects_someone_elses_account(client, db):
    from app.models import User

    other = User(email="other@example.com", hashed_password="x", full_name="O", is_active=True)
    db.add(other); db.commit()
    account = make_account(db, other)
    batch_id = _upload(client, CSV).json()["batch_id"]
    assert _preview(client, batch_id, account_id=account.id).status_code == 404


def test_preview_reads_legacy_batches(client, db, seed_user):
    from app.models import ImportBatch

    batch = ImportBatch(user_id=seed_user.id, filename="old.csv", file_type="csv", status="pending",
                        total_rows=1, processed_rows=0,
                        parsed_data=[{"date": "2026-07-01T00:00:00", "description": "Old", "amount": -3.0}])
    db.add(batch); db.commit()
    rows = _preview(client, batch.id).json()["transactions"]
    assert (rows[0]["date"], rows[0]["line"]) == ("2026-07-01", None)


from tests.factories import make_category
from app.models import ImportBatch, Transaction


def _confirm(client, batch_id, account_id, rows, **extra):
    return client.post(
        "/api/import/confirm",
        json={"batch_id": batch_id, "account_id": account_id, "rows": rows, **extra},
    )


def test_confirm_imports_only_selected_rows_from_the_batch(client, db, seed_user):
    account = make_account(db, seed_user, balance=100.0)
    category = make_category(db, seed_user, name="Coffee")
    batch_id = _upload(client, CSV).json()["batch_id"]

    res = _confirm(client, batch_id, account.id, [{"row_id": 1, "category_id": category.id}])
    assert res.status_code == 200, res.text
    assert res.json()["imported_count"] == 1

    txs = db.query(Transaction).filter(Transaction.account_id == account.id).all()
    assert [(t.description, t.amount, t.type, t.date, t.category_id, t.is_imported) for t in txs] == [
        ("Coffee", 4.5, "expense", date(2026, 7, 1), category.id, True)
    ]
    db.refresh(account)
    assert account.balance == 95.5
    assert db.get(ImportBatch, batch_id).status == "completed"


def test_confirm_twice_imports_once(client, db, seed_user):
    account = make_account(db, seed_user, balance=0.0)
    batch_id = _upload(client, CSV).json()["batch_id"]
    rows = [{"row_id": 1, "category_id": None}, {"row_id": 2, "category_id": None}]

    assert _confirm(client, batch_id, account.id, rows).status_code == 200
    second = _confirm(client, batch_id, account.id, rows)
    assert second.status_code == 409
    assert db.query(Transaction).count() == 2
    db.refresh(account)
    assert account.balance == 1495.5


def test_confirm_with_invert_signs_creates_expenses(client, db, seed_user):
    account = make_account(db, seed_user, balance=0.0)
    batch_id = _upload(client, b"Date,Description,Amount\n2026-07-01,Card purchase,25.00\n").json()["batch_id"]
    res = _confirm(client, batch_id, account.id, [{"row_id": 1, "category_id": None}], invert_signs=True)
    assert res.status_code == 200, res.text
    tx = db.query(Transaction).one()
    assert (tx.type, tx.amount) == ("expense", 25.0)
    db.refresh(account)
    assert account.balance == -25.0


def test_confirm_rejects_unknown_row(client, db, seed_user):
    account = make_account(db, seed_user)
    batch_id = _upload(client, CSV).json()["batch_id"]
    res = _confirm(client, batch_id, account.id, [{"row_id": 99, "category_id": None}])
    assert res.status_code == 400
    assert db.query(Transaction).count() == 0
    assert db.get(ImportBatch, batch_id).status == "pending"


def test_confirm_rejects_someone_elses_category(client, db, seed_user):
    from app.models import User

    other = User(email="other@example.com", hashed_password="x", full_name="O", is_active=True)
    db.add(other); db.commit()
    foreign = make_category(db, other)
    account = make_account(db, seed_user)
    batch_id = _upload(client, CSV).json()["batch_id"]
    res = _confirm(client, batch_id, account.id, [{"row_id": 1, "category_id": foreign.id}])
    assert res.status_code == 400


def test_confirm_rejects_linked_account(client, db, seed_user):
    account = make_account(db, seed_user, is_linked=True)
    batch_id = _upload(client, CSV).json()["batch_id"]
    res = _confirm(client, batch_id, account.id, [{"row_id": 1, "category_id": None}])
    assert res.status_code == 400
    assert db.query(Transaction).count() == 0


def test_confirm_requires_at_least_one_row(client, db, seed_user):
    account = make_account(db, seed_user)
    batch_id = _upload(client, CSV).json()["batch_id"]
    assert _confirm(client, batch_id, account.id, []).status_code == 422


def test_row_update_stub_is_gone(client):
    assert client.post("/api/import/preview/1/update").status_code in (404, 405)
