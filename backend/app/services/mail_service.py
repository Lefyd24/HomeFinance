import smtplib, logging
from dataclasses import dataclass
from email.message import EmailMessage
from app.utils import crypto

logger = logging.getLogger("app.notifications")


@dataclass
class SmtpConfig:
    host: str; port: int; user: str | None; password: str | None
    sender: str; use_tls: bool


def resolve_smtp_config(row, app) -> "SmtpConfig | None":
    def pick(attr_row, attr_app, default=None):
        rv = getattr(row, attr_row, None) if row is not None else None
        return rv if rv not in (None, "") else getattr(app, attr_app, default)
    host = pick("smtp_host", "SMTP_HOST")
    if not host:
        return None
    password = None
    enc = getattr(row, "smtp_password_encrypted", None) if row else None
    if enc:
        try: password = crypto.decrypt(enc)
        except Exception: password = None
    if password is None:
        password = getattr(app, "SMTP_PASSWORD", None)
    return SmtpConfig(
        host=host, port=pick("smtp_port", "SMTP_PORT", 587),
        user=pick("smtp_user", "SMTP_USER"), password=password,
        sender=pick("smtp_from", "SMTP_FROM") or pick("smtp_user", "SMTP_USER") or "noreply@localhost",
        use_tls=pick("smtp_use_tls", "SMTP_USE_TLS", True),
    )


def send_email(to: str, subject: str, html: str, cfg: SmtpConfig) -> bool:
    try:
        msg = EmailMessage()
        msg["Subject"] = subject; msg["From"] = cfg.sender; msg["To"] = to
        msg.set_content("This message requires an HTML-capable client.")
        msg.add_alternative(html, subtype="html")
        with smtplib.SMTP(cfg.host, cfg.port, timeout=15) as s:
            if cfg.use_tls: s.starttls()
            if cfg.user and cfg.password: s.login(cfg.user, cfg.password)
            s.send_message(msg)
        return True
    except Exception as exc:
        logger.warning("Email send failed to %s via %s:%s — %s", to, cfg.host, cfg.port, exc)
        return False
