import io
from datetime import date, datetime

import pandas as pd
import pytest
from openpyxl import Workbook

from app.utils.file_parsers import (
    normalize_header,
    parse_amount,
    parse_bank_file,
    parse_date,
)


def _rows(result):
    return [(t["date"], t["description"], t["amount"]) for t in result.transactions]


def test_normalize_header_ignores_case_accents_underscores_and_final_sigma():
    assert normalize_header("  Ημ/νία_Κίνησης ") == normalize_header("ΗΜ/ΝΙΑ ΚΙΝΗΣΗΣ")
    assert normalize_header("Transaction_Date") == "transaction date"


def test_parses_plain_english_csv():
    content = b"Date,Description,Amount\n2026-07-01,Coffee shop,-4.50\n2026-07-02,Salary,1500\n"
    result = parse_bank_file(content, "csv", "ymd")
    assert _rows(result) == [
        (date(2026, 7, 1), "Coffee shop", -4.5),
        (date(2026, 7, 2), "Salary", 1500.0),
    ]
    assert result.skipped == []
    assert [t["line"] for t in result.transactions] == [2, 3]


def test_parses_utf8_bom_semicolon_csv():
    content = "﻿date;description;amount\n05/01/2026;Rent;-800,00\n".encode("utf-8")
    assert _rows(parse_bank_file(content, "csv", "dmy")) == [(date(2026, 1, 5), "Rent", -800.0)]


def test_parses_greek_cp1253_csv_with_preamble_and_accented_headers():
    text = (
        "Τράπεζα Παράδειγμα;;;\n"
        "Λογαριασμός: GR00 0000 0000;;;\n"
        ";;;\n"
        "Ημερομηνία;Αιτιολογία;Χρέωση;Πίστωση\n"
        "05/01/2026;ΣΟΥΠΕΡΜΑΡΚΕΤ;42,30;\n"
        "06/01/2026;ΜΙΣΘΟΔΟΣΙΑ;;1.500,00\n"
    )
    result = parse_bank_file(text.encode("cp1253"), "csv", "dmy")
    assert _rows(result) == [
        (date(2026, 1, 5), "ΣΟΥΠΕΡΜΑΡΚΕΤ", -42.3),
        (date(2026, 1, 6), "ΜΙΣΘΟΔΟΣΙΑ", 1500.0),
    ]
    assert [t["line"] for t in result.transactions] == [5, 6]


def test_value_date_column_is_not_mistaken_for_amount():
    content = b"Date,Value_Date,Description,Amount\n2026-07-01,2026-07-02,Coffee,-4.50\n"
    assert parse_bank_file(content, "csv", "ymd").transactions[0]["amount"] == -4.5


def test_missing_headers_raises_readable_error():
    with pytest.raises(ValueError, match="column headers"):
        parse_bank_file(b"foo,bar\n1,2\n", "csv", "dmy")


def test_empty_file_raises_readable_error():
    with pytest.raises(ValueError, match="empty"):
        parse_bank_file(b"   \n\n", "csv", "dmy")


def test_unknown_date_order_raises():
    with pytest.raises(ValueError, match="date format"):
        parse_bank_file(b"Date,Description,Amount\n2026-07-01,A,1\n", "csv", "auto")


def test_same_text_follows_the_chosen_order():
    content = b"Date,Description,Amount\n05/01/2026,A,-1\n"
    assert parse_bank_file(content, "csv", "dmy").transactions[0]["date"] == date(2026, 1, 5)
    assert parse_bank_file(content, "csv", "mdy").transactions[0]["date"] == date(2026, 5, 1)


def test_wrong_order_choice_skips_rows_instead_of_inventing_dates():
    content = b"Date,Description,Amount\n31/01/2026,A,-1\n2026-01-31,B,-2\n"
    # 31/01 can't be month-first, and ISO isn't month-first either: both are reported.
    with pytest.raises(ValueError, match="No transactions"):
        parse_bank_file(content, "csv", "mdy")


def test_parses_xlsx_with_preamble_and_real_dates():
    wb = Workbook()
    ws = wb.active
    ws.append(["Statement for January"])
    ws.append([])
    ws.append(["Date", "Description", "Amount"])
    ws.append([datetime(2026, 1, 5), "Rent", -800])
    buf = io.BytesIO()
    wb.save(buf)
    # Real date cells are used as-is, whatever order was chosen.
    assert _rows(parse_bank_file(buf.getvalue(), "xlsx", "mdy")) == [(date(2026, 1, 5), "Rent", -800.0)]


def test_corrupt_xlsx_raises_readable_error_without_internals():
    with pytest.raises(ValueError) as exc:
        parse_bank_file(b"definitely not a zip", "xlsx", "dmy")
    assert "Excel" in str(exc.value)
    assert "zip" not in str(exc.value).lower()


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("4.50", 4.5),
        ("4,50", 4.5),
        ("1.234,56", 1234.56),
        ("1,234.56", 1234.56),
        ("1.234", 1234.0),
        ("1,234", 1234.0),
        ("1.234.567", 1234567.0),
        ("-12,5", -12.5),
        ("(50.00)", -50.0),
        ("50,00-", -50.0),
        ("€ 1 234,50", 1234.5),
        ("1 234,50 EUR", 1234.5),
        ("+20", 20.0),
        (12.5, 12.5),
        (-3, -3.0),
    ],
)
def test_parse_amount_formats(raw, expected):
    assert parse_amount(raw) == pytest.approx(expected)


@pytest.mark.parametrize("raw", ["", "abc", "-", "12abc", None, float("nan"), True])
def test_parse_amount_rejects_garbage(raw):
    assert parse_amount(raw) is None


@pytest.mark.parametrize(
    "raw, order, expected",
    [
        ("05/01/2026", "dmy", date(2026, 1, 5)),
        ("05.01.2026", "dmy", date(2026, 1, 5)),
        ("05-01-2026", "dmy", date(2026, 1, 5)),
        ("05/01/26", "dmy", date(2026, 1, 5)),
        ("05/01/2026 13:45", "dmy", date(2026, 1, 5)),
        ("01/05/2026", "mdy", date(2026, 1, 5)),
        ("01-05-26", "mdy", date(2026, 1, 5)),
        ("2026-01-05", "ymd", date(2026, 1, 5)),
        ("2026/01/05", "ymd", date(2026, 1, 5)),
        ("20260105", "ymd", date(2026, 1, 5)),
        ("2026-01-05 13:45:00", "ymd", date(2026, 1, 5)),
        ("2026-01-05T13:45:00", "ymd", date(2026, 1, 5)),
        ("5 Jan 2026", "mdy", date(2026, 1, 5)),
        ("5 January 2026", "ymd", date(2026, 1, 5)),
        (datetime(2026, 1, 5, 13, 0), "mdy", date(2026, 1, 5)),
        (date(2026, 1, 5), "dmy", date(2026, 1, 5)),
        (pd.Timestamp("2026-01-05"), "dmy", date(2026, 1, 5)),
    ],
)
def test_parse_date_formats(raw, order, expected):
    assert parse_date(raw, order) == expected


@pytest.mark.parametrize(
    "raw, order",
    [
        ("2026-01-05", "dmy"),  # ISO is not accepted unless the user picked year-first
        ("05/01/2026", "ymd"),
        ("13/01/2026", "mdy"),  # month 13
    ],
)
def test_parse_date_is_strict_about_order(raw, order):
    assert parse_date(raw, order) is None


@pytest.mark.parametrize("raw", ["Total", "", "31/02/2026", None, float("nan"), pd.NaT])
def test_parse_date_rejects_garbage(raw):
    assert parse_date(raw, "dmy") is None


def test_bad_rows_are_skipped_and_reported_not_imported_as_today():
    content = (
        b"Date,Description,Amount\n"
        b"2026-07-01,Coffee,-4.50\n"
        b"Total,,-4.50\n"
        b"2026-07-02,Refund,abc\n"
        b"2026-07-03,Nothing,0\n"
        b",continued line,\n"
        b",,\n"
    )
    result = parse_bank_file(content, "csv", "ymd")
    assert [t["description"] for t in result.transactions] == ["Coffee"]
    assert [(s.line, s.reason, s.value) for s in result.skipped] == [
        (3, "invalid_date", "Total"),
        (4, "invalid_amount", "abc"),
        (5, "zero_amount", "0"),
        (6, "missing_date", ""),
    ]


def test_file_with_only_bad_rows_raises():
    with pytest.raises(ValueError, match="No transactions"):
        parse_bank_file(b"Date,Description,Amount\nTotal,,1\n", "csv", "ymd")


def test_debit_credit_signs_use_absolute_values():
    # Some banks write debits as negative numbers, others as positive ones.
    content = b"Date,Description,Debit,Credit\n2026-07-01,A,-10,\n2026-07-02,B,10,\n2026-07-03,C,,5\n"
    assert [t["amount"] for t in parse_bank_file(content, "csv", "ymd").transactions] == [-10.0, -10.0, 5.0]
