from app.services import email_templates


def test_render_escapes_html_in_title():
    html_out, text_out = email_templates.render("<script>alert(1)</script>", "<p>body</p>")
    assert "<script>alert(1)</script>" not in html_out
    assert "&lt;script&gt;" in html_out
    assert text_out.strip()


def test_recurring_due_produces_plain_text():
    html_out, text_out = email_templates.recurring_due("Netflix", 15.5, "2026-08-01", 3)
    assert "Netflix" in html_out
    assert "15.50" in html_out or "15.5" in html_out
    assert text_out.strip()
    assert "<" not in text_out
