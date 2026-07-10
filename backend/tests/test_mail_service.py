def test_resolve_smtp_prefers_user_override():
    from app.services.mail_service import resolve_smtp_config, SmtpConfig
    class Row: smtp_host="user.smtp"; smtp_port=25; smtp_user="u"; smtp_password_encrypted=None
    class App: SMTP_HOST="env.smtp"; SMTP_PORT=587; SMTP_USER="e"; SMTP_PASSWORD="p"; SMTP_FROM="e@x"; SMTP_USE_TLS=True
    cfg = resolve_smtp_config(Row(), App())
    assert cfg.host == "user.smtp"
    assert cfg.port == 25


def test_send_email_mocked(monkeypatch):
    import app.services.mail_service as m
    sent = {}
    class FakeSMTP:
        def __init__(self,*a,**k): pass
        def __enter__(self): return self
        def __exit__(self,*a): return False
        def starttls(self): pass
        def login(self,u,p): sent["login"]=(u,p)
        def send_message(self,msg): sent["msg"]=msg
    monkeypatch.setattr(m.smtplib, "SMTP", FakeSMTP)
    cfg = m.SmtpConfig(host="h", port=587, user="u", password="pw", sender="f@x", use_tls=True)
    ok = m.send_email("to@x", "Hi", "<b>Hi</b>", cfg)
    assert ok and "msg" in sent
