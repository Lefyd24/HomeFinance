import smtplib

from app.services import mail_service
from app.services.mail_service import SmtpConfig


class _FakeSMTP:
    sent = []

    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self):
        pass

    def login(self, *a):
        pass

    def send_message(self, msg):
        _FakeSMTP.sent.append(msg)


def _cfg():
    return SmtpConfig("h", 587, None, None, "me@x.co", False)


def test_attachments_added(monkeypatch):
    _FakeSMTP.sent = []
    monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
    ok, err = mail_service.send_email_detailed(
        "to@x.co",
        "Subj",
        "<p>hi</p>",
        _cfg(),
        text="hi",
        attachments=[("report.pdf", b"%PDF-1.4 fake", "application/pdf")],
    )
    assert ok and err is None
    msg = _FakeSMTP.sent[0]
    atts = list(msg.iter_attachments())
    assert len(atts) == 1
    assert atts[0].get_filename() == "report.pdf"
    assert atts[0].get_content_type() == "application/pdf"
    assert atts[0].get_payload(decode=True) == b"%PDF-1.4 fake"
    assert msg.get_body(("html",)) is not None
    assert msg.get_body(("plain",)) is not None


def test_no_attachments_backward_compatible(monkeypatch):
    _FakeSMTP.sent = []
    monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
    ok, _ = mail_service.send_email_detailed("to@x.co", "S", "<p>x</p>", _cfg(), "x")
    assert ok
    assert list(_FakeSMTP.sent[0].iter_attachments()) == []
