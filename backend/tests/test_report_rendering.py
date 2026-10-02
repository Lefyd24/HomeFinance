import io
import os

from pypdf import PdfReader

from app.services import email_templates
from app.services.report_rendering import (
    markdown_to_html,
    markdown_to_pdf,
    markdown_to_text,
)

SAMPLE = """# Αναφορά Επενδύσεων

Σύνοψη με **έντονο** και *πλάγιο* κείμενο, και [σύνδεσμος](https://example.com/x).

## Λίστα

- πρώτο στοιχείο
- δεύτερο στοιχείο

1. one
2. two

| Σύμβολο | Αξία |
|---|---|
| AAPL | 1234.50 |
| ΟΤΕ | 99.10 |

> quote here

---

`inline code`
"""


def test_html_renders_features():
    html = markdown_to_html(SAMPLE)
    for tag in ("<h1", "<h2", "<ul", "<ol", "<li", "<table", "<th", "<td", "<strong", "<em", "<blockquote", "<hr", "<code"):
        assert tag in html
    assert 'href="https://example.com/x"' in html
    assert "AAPL" in html and "1234.50" in html
    assert "border" in html  # inline table styles survive
    assert "<style" not in html


def test_html_strips_scripts_and_bad_urls():
    md = (
        "<script>alert(1)</script>\n\n"
        '<img src=x onerror="alert(1)">\n\n'
        '<p onclick="evil()">hi</p>\n\n'
        "[click](javascript:alert(1)) [data](data:text/html;base64,AAAA) "
        "[ok](mailto:a@b.co) [rel](/relative)\n"
    )
    html = markdown_to_html(md)
    low = html.lower()
    assert "<script" not in low
    assert "<img" not in low
    assert "<p onclick" not in low
    assert "<a href=\"javascript" not in low
    assert 'href="javascript' not in low
    assert 'href="data:' not in low
    assert "mailto:a@b.co" in html


def test_plain_text_contains_table_and_structure():
    text = markdown_to_text(SAMPLE)
    assert "Αναφορά Επενδύσεων\n=====" in text
    assert "| AAPL" in text and "1234.50" in text
    assert "- πρώτο στοιχείο\n- δεύτερο στοιχείο" in text
    assert "1. one\n2. two" in text
    assert "https://example.com/x" in text
    assert "**" not in text and "<" not in text


def test_pdf_has_greek_and_table(tmp_path):
    pdf = markdown_to_pdf(SAMPLE, "Αναφορά Test")
    assert pdf.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(pdf))
    text = "\n".join(p.extract_text() for p in reader.pages)
    assert "Σύνοψη" in text
    assert "AAPL" in text and "1234.50" in text
    assert "Αναφορά Test" in text
    out = os.environ.get("REPORT_SAMPLE_PDF")
    if out:
        with open(out, "wb") as fh:
            fh.write(pdf)


def test_pdf_multipage_and_empty():
    long_md = "\n\n".join(f"Παράγραφος {i} " + "λέξη " * 60 for i in range(60))
    reader = PdfReader(io.BytesIO(markdown_to_pdf(long_md, "Long")))
    assert len(reader.pages) > 1
    assert markdown_to_pdf("", "Empty").startswith(b"%PDF")


def test_render_embeds_prerendered_html_and_text():
    body = markdown_to_html("| a | b |\n|---|---|\n| 1 | 2 |")
    html, text = email_templates.render("T", body, text_body="plain body")
    assert "<table" in html and "&lt;table" not in html
    assert "plain body" in text
