import pytest

from app import ai_skills
from app.ai_skills.report_email import tools as re_tools
from app.routers.notifications import _get_or_create_settings
from app.services import mail_service

REPORT = """# Review

Savings rate is **18%**.

| Metric | Value |
|---|---|
| Income | 3,000 EUR |
| Net | 540 EUR |

## Actions

1. Cut dining by 50 EUR per month.

*This is automated guidance.* Αυτό είναι δοκιμή.
"""


@pytest.fixture()
def smtp_ready(db, seed_user, monkeypatch):
    row = _get_or_create_settings(db, seed_user.id)
    row.email_enabled = True
    db.commit()
    cfg = mail_service.SmtpConfig(host="h", port=587, user="u", password="pw", sender="f@x", use_tls=True)
    monkeypatch.setattr(mail_service, "resolve_smtp_config", lambda *_a, **_k: cfg)
    return cfg


@pytest.fixture()
def outbox(monkeypatch):
    sent = []

    def fake(to, subject, html, cfg, text=None, attachments=None):
        sent.append({"to": to, "subject": subject, "html": html, "text": text, "attachments": attachments})
        return True, None

    monkeypatch.setattr(mail_service, "send_email_detailed", fake)
    return sent


def call(db, user, **kwargs):
    return re_tools.send_report_email_tool(db, user.id, user_email=user.email, **kwargs)


def test_skill_loads_from_real_directory():
    from app.services import ai_service

    registry = ai_skills.load_all(core_tool_names=set(ai_service.TOOL_DISPATCH))
    skill = registry["report-email"]
    assert skill.command == "email"
    assert skill.requires == ["email"]
    assert skill.tool_names == ["send_report_email_tool"]
    assert skill.needs_user_email == {"send_report_email_tool"}
    assert "user_email" not in str(skill.tools)  # never exposed to the model


def test_sends_rendered_html_and_text_to_user(db, seed_user, smtp_ready, outbox):
    out = call(db, seed_user, subject="Monthly review", markdown=REPORT)
    assert out == {"sent": True, "to": seed_user.email, "attached_pdf": False}
    (mail,) = outbox
    assert mail["to"] == seed_user.email
    assert mail["subject"] == "Monthly review"
    assert "<table" in mail["html"] and "<strong" in mail["html"]
    assert "Αυτό είναι δοκιμή" in mail["html"]
    assert "Savings rate" in mail["text"]
    assert not mail["attachments"]


def test_recipient_cannot_be_overridden_by_model_arguments(db, seed_user, smtp_ready, outbox):
    fn = re_tools.DISPATCH["send_report_email_tool"]
    # ai_service calls fn(db, user_id, **model_args, user_email=...): a model-supplied
    # user_email or recipient is a TypeError there, reported back as "Invalid arguments".
    for evil in ({"user_email": "evil@example.com"}, {"to": "evil@example.com"}):
        with pytest.raises(TypeError):
            fn(db, seed_user.id, **{"subject": "x", "markdown": "y", **evil}, user_email=seed_user.email)
    assert outbox == []
    props = re_tools.TOOLS[0]["function"]["parameters"]["properties"]
    assert set(props) == {"subject", "markdown", "attach_pdf"}


def test_pdf_attachment_is_attached(db, seed_user, smtp_ready, outbox):
    out = call(db, seed_user, subject="Αναφορά Q3 / review", markdown=REPORT, attach_pdf=True)
    assert out["sent"] and out["attached_pdf"] is True
    (mail,) = outbox
    (filename, content, mimetype) = mail["attachments"][0]
    assert filename.endswith(".pdf") and "/" not in filename
    assert mimetype == "application/pdf"
    assert content.startswith(b"%PDF")


def test_pdf_reaches_the_smtp_message(db, seed_user, smtp_ready, monkeypatch):
    captured = {}

    class FakeSMTP:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            pass

        def login(self, u, p):
            pass

        def send_message(self, msg):
            captured["msg"] = msg

    monkeypatch.setattr(mail_service.smtplib, "SMTP", FakeSMTP)
    out = call(db, seed_user, subject="Review", markdown=REPORT, attach_pdf=True)
    assert out["sent"] and out["attached_pdf"]
    msg = captured["msg"]
    assert msg["To"] == seed_user.email
    attachments = list(msg.iter_attachments())
    assert len(attachments) == 1
    assert attachments[0].get_content_type() == "application/pdf"
    assert attachments[0].get_payload(decode=True).startswith(b"%PDF")


def test_disabled_notifications_block_sending(db, seed_user, smtp_ready, outbox):
    row = _get_or_create_settings(db, seed_user.id)
    row.email_enabled = False
    db.commit()
    out = call(db, seed_user, subject="x", markdown=REPORT)
    assert out["sent"] is False and out["to"] == seed_user.email
    assert "disabled" in out["error"]
    assert outbox == []


def test_missing_smtp_config(db, seed_user, monkeypatch, outbox):
    row = _get_or_create_settings(db, seed_user.id)
    row.email_enabled = True
    db.commit()
    monkeypatch.setattr(mail_service, "resolve_smtp_config", lambda *_a, **_k: None)
    out = call(db, seed_user, subject="x", markdown=REPORT)
    assert out["sent"] is False and "SMTP" in out["error"]
    assert outbox == []


def test_size_limit_and_empty_body(db, seed_user, smtp_ready, outbox):
    too_long = call(db, seed_user, subject="x", markdown="a" * (re_tools.MAX_MARKDOWN_CHARS + 1))
    assert too_long["sent"] is False and "too long" in too_long["error"]
    at_limit = call(db, seed_user, subject="x", markdown="a" * re_tools.MAX_MARKDOWN_CHARS)
    assert at_limit["sent"] is True
    empty = call(db, seed_user, subject="x", markdown="   ")
    assert empty["sent"] is False and "non-empty" in empty["error"]
    assert len(outbox) == 1


def test_blank_subject_gets_default_and_html_is_sanitised(db, seed_user, smtp_ready, outbox):
    call(db, seed_user, subject="  ", markdown="Hello <script>alert(1)</script> [x](javascript:alert(1))")
    (mail,) = outbox
    assert mail["subject"] == re_tools.DEFAULT_SUBJECT
    assert "<script" not in mail["html"] and "href=\"javascript" not in mail["html"]


def test_send_failure_is_reported_without_pdf_claim(db, seed_user, smtp_ready, monkeypatch):
    monkeypatch.setattr(mail_service, "send_email_detailed", lambda *a, **k: (False, "boom"))
    out = call(db, seed_user, subject="x", markdown=REPORT, attach_pdf=True)
    assert out == {"sent": False, "to": seed_user.email, "attached_pdf": False, "error": "boom"}


def test_pdf_render_failure_sends_nothing(db, seed_user, smtp_ready, outbox, monkeypatch):
    def broken(md, title):
        raise RuntimeError("secret internals")

    monkeypatch.setattr(re_tools.report_rendering, "markdown_to_pdf", broken)
    out = call(db, seed_user, subject="x", markdown=REPORT, attach_pdf=True)
    assert out["sent"] is False and "secret internals" not in out["error"]
    assert outbox == []
