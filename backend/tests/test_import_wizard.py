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
