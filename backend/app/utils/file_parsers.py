"""Parse bank statement exports (CSV / Excel) into plain transaction rows.

Bank exports are messy: a few metadata lines above the table, headers in Greek
with or without accents, `1.234,56` vs `1,234.56`, debit/credit split into two
columns, a "Total" line at the bottom. The parser's job is to be forgiving
about *layout* and strict about *values*: a row whose date or amount can't be
read is reported back to the user as skipped, never guessed (an unreadable
date used to become "today", which silently put rows in the wrong month).
"""

import csv
import io
import logging
import math
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime

import pandas as pd

logger = logging.getLogger("app")

# How far down the file the header row may be. Greek bank exports typically
# have 3-8 lines of account details first.
HEADER_SCAN_ROWS = 20

SKIP_REASONS = ("missing_date", "invalid_date", "invalid_amount", "zero_amount")


def normalize_header(value: object) -> str:
    """Lowercase, strip accents, treat `_` as a space and collapse whitespace.

    casefold() also maps the Greek final sigma (ς) to σ, so "ΚΙΝΗΣΗΣ" and
    "κινήσης" compare equal.
    """
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold().replace("_", " ")
    return re.sub(r"\s+", " ", text).strip()


_ALIASES = {
    "date": [
        "date", "transaction date", "booking date", "posting date", "datum",
        "ημερομηνία", "ημ/νία", "ημερομηνία κίνησης", "ημ/νία κίνησης",
        "ημερομηνία συναλλαγής", "ημ/νία συναλλαγής",
    ],
    "description": [
        "description", "desc", "details", "narrative", "transactie", "omschrijving",
        "περιγραφή", "αιτιολογία", "περιγραφή κίνησης", "περιγραφή συναλλαγής",
    ],
    "amount": ["amount", "value", "bedrag", "ποσό", "ποσό κίνησης", "ποσό συναλλαγής"],
    "debit": ["debit", "af", "withdrawal", "withdrawals", "χρέωση", "χρεώσεις"],
    "credit": ["credit", "bij", "deposit", "deposits", "πίστωση", "πιστώσεις"],
}
COLUMN_ALIASES: dict[str, frozenset[str]] = {
    key: frozenset(normalize_header(a) for a in aliases) for key, aliases in _ALIASES.items()
}

# The user picks the date order on the Import page before uploading. "05/01/2026"
# is 5 January or 1 May depending on the bank, and no algorithm can tell from
# the text, so only the chosen order's patterns are tried.
DATE_ORDERS = ("dmy", "mdy", "ymd")


def _numeric_formats(first: str, second: str) -> tuple[str, ...]:
    formats = []
    for sep in ("/", "-", "."):
        for year in ("%Y", "%y"):
            base = f"{first}{sep}{second}{sep}{year}"
            formats += [base, f"{base} %H:%M", f"{base} %H:%M:%S"]
    return tuple(formats)


_DATE_FORMATS: dict[str, tuple[str, ...]] = {
    "dmy": _numeric_formats("%d", "%m"),
    "mdy": _numeric_formats("%m", "%d"),
    "ymd": (
        "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d",
        "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S",
    ),
}
# A spelled-out month can't be misread, so these work under every choice.
_TEXT_MONTH_FORMATS = ("%d %b %Y", "%d-%b-%Y", "%d %B %Y", "%d-%B-%Y")


@dataclass
class SkippedRow:
    line: int
    reason: str
    value: str = ""


@dataclass
class ParseResult:
    transactions: list[dict] = field(default_factory=list)
    skipped: list[SkippedRow] = field(default_factory=list)


def _is_blank(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def parse_date(value: object, date_order: str) -> date | None:
    """Parse with the user's chosen order only. Returns None rather than guessing."""
    if _is_blank(value):
        return None
    if isinstance(value, datetime):  # includes pd.Timestamp; Excel date cells
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in (*_DATE_FORMATS[date_order], *_TEXT_MONTH_FORMATS):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def parse_amount(value: object) -> float | None:
    """Parse `4,50`, `1.234,56`, `1,234.56`, `(50.00)`, `50,00-`, `€ 12`.

    A single separator followed by exactly three digits is read as a thousands
    separator (`1.234` -> 1234), anything else as the decimal point.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return None if math.isnan(value) else float(value)
    text = str(value).strip()
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative, text = True, text[1:-1]
    text = re.sub(r"[€$£¥₹\s ]|EUR|USD|GBP", "", text, flags=re.IGNORECASE)
    if text.endswith("-"):
        negative, text = not negative, text[:-1]
    if text[:1] in ("-", "+"):
        if text[0] == "-":
            negative = not negative
        text = text[1:]
    if not text or not re.fullmatch(r"[0-9.,']+", text):
        return None
    text = text.replace("'", "")

    last_comma, last_dot = text.rfind(","), text.rfind(".")
    if last_comma != -1 and last_dot != -1:
        decimal: str | None = "," if last_comma > last_dot else "."
    elif last_comma != -1 or last_dot != -1:
        sep = "," if last_comma != -1 else "."
        parts = text.split(sep)
        decimal = None if len(parts) > 2 or len(parts[-1]) == 3 else sep
    else:
        decimal = None

    if decimal is None:
        number = text.replace(",", "").replace(".", "")
    else:
        thousands = "." if decimal == "," else ","
        number = text.replace(thousands, "").replace(decimal, ".")
    try:
        amount = float(number)
    except ValueError:
        return None
    return -amount if negative else amount


def _decode(content: bytes) -> str:
    # utf-8-sig drops the BOM Excel writes; cp1253 is the Greek Windows code
    # page most Greek bank exports use; latin-1 never fails, so it goes last.
    for encoding in ("utf-8-sig", "cp1253", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1", errors="replace")


def _detect_delimiter(sample: str) -> str:
    candidates = [",", ";", "\t", "|"]
    try:
        return csv.Sniffer().sniff(sample, delimiters="".join(candidates)).delimiter
    except csv.Error:
        return max(candidates, key=sample.count)


def _read_grid(content: bytes, file_type: str) -> list[list]:
    if file_type == "csv":
        text = _decode(content)
        delimiter = _detect_delimiter(text[:8192])
        return [row for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
    if file_type in ("xlsx", "xls"):
        engine = "openpyxl" if file_type == "xlsx" else "xlrd"
        try:
            frame = pd.read_excel(io.BytesIO(content), engine=engine, header=None, dtype=object)
        except Exception:
            logger.info("Could not read %s upload", file_type, exc_info=True)
            raise ValueError(
                "The file could not be read as an Excel workbook. Re-save it as .xlsx or CSV and try again."
            )
        return frame.values.tolist()
    raise ValueError(f"Unsupported file type: {file_type}")


def _match_columns(cells: list) -> dict[str, int] | None:
    found: dict[str, int] = {}
    for index, cell in enumerate(cells):
        if _is_blank(cell):
            continue
        key = normalize_header(cell)
        for standard, aliases in COLUMN_ALIASES.items():
            if standard not in found and key in aliases:
                found[standard] = index
    has_money = "amount" in found or ("debit" in found and "credit" in found)
    if "date" in found and "description" in found and has_money:
        return found
    return None


def _cell(row: list, index: int | None) -> object:
    if index is None or index >= len(row):
        return None
    return row[index]


def _as_text(value: object) -> str:
    return "" if _is_blank(value) else str(value).strip()


def parse_bank_file(content: bytes, file_type: str, date_order: str) -> ParseResult:
    if date_order not in DATE_ORDERS:
        raise ValueError("Choose a date format: day first, month first or year first.")
    if not content or not content.strip():
        raise ValueError("The file is empty.")

    grid = _read_grid(content, file_type)
    if not any(any(not _is_blank(c) for c in row) for row in grid):
        raise ValueError("The file is empty.")

    header_index, columns = None, None
    for index, row in enumerate(grid[:HEADER_SCAN_ROWS]):
        columns = _match_columns(row)
        if columns:
            header_index = index
            break
    if columns is None or header_index is None:
        raise ValueError(
            "Could not find the column headers. The file needs a date column, a description "
            "column, and either an amount column or debit and credit columns. See the Import "
            "page for the accepted column names."
        )

    result = ParseResult()
    money_keys = ("amount",) if "amount" in columns else ("debit", "credit")
    for offset, row in enumerate(grid[header_index + 1:], start=header_index + 2):
        raw_date = _cell(row, columns.get("date"))
        raw_desc = _cell(row, columns.get("description"))
        raw_money = [_cell(row, columns.get(k)) for k in money_keys]
        if all(_is_blank(v) for v in (raw_date, raw_desc, *raw_money)):
            continue

        if _is_blank(raw_date):
            result.skipped.append(SkippedRow(offset, "missing_date"))
            continue
        tx_date = parse_date(raw_date, date_order)
        if tx_date is None:
            result.skipped.append(SkippedRow(offset, "invalid_date", _as_text(raw_date)))
            continue

        if "amount" in columns:
            amount = parse_amount(raw_money[0])
            bad_value = _as_text(raw_money[0])
        else:
            debit_raw, credit_raw = raw_money
            debit = 0.0 if _is_blank(debit_raw) else parse_amount(debit_raw)
            credit = 0.0 if _is_blank(credit_raw) else parse_amount(credit_raw)
            if _is_blank(debit_raw) and _is_blank(credit_raw):
                debit = credit = None
            amount = None if debit is None or credit is None else abs(credit) - abs(debit)
            bad_value = _as_text(debit_raw) or _as_text(credit_raw)
        if amount is None:
            result.skipped.append(SkippedRow(offset, "invalid_amount", bad_value))
            continue
        if amount == 0:
            result.skipped.append(SkippedRow(offset, "zero_amount", bad_value))
            continue

        result.transactions.append(
            {
                "line": offset,
                "date": tx_date,
                "description": _as_text(raw_desc) or "(no description)",
                "amount": round(amount, 2),
            }
        )

    if not result.transactions:
        raise ValueError("No transactions could be read from the file. Check the dates and amounts.")
    return result
