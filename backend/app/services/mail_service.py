import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.utils import crypto

logger = logging.getLogger("app.notifications")


@dataclass
class SmtpConfig:
    host: str
    port: int
    user: str | None
    password: str | None
    sender: str
    use_tls: bool
    password_needs_reentry: bool = False


def resolve_smtp_config(row, app) -> "SmtpConfig | None":
    def pick(attr_row, attr_app, default=None):
        rv = getattr(row, attr_row, None) if row is not None else None
        return rv if rv not in (None, "") else getattr(app, attr_app, default)

    host = pick("smtp_host", "SMTP_HOST")
    if not host:
        return None
    password = None
    password_needs_reentry = False
    enc = getattr(row, "smtp_password_encrypted", None) if row else None
    if enc:
        try:
            password = crypto.decrypt(enc)
        except crypto.DecryptionError:
            logger.warning(
                "Stored SMTP password could not be decrypted for user_id=%s — "
                "encryption key changed since it was saved; needs re-entry.",
                getattr(row, "user_id", None),
            )
            password_needs_reentry = True
    if password is None and not password_needs_reentry:
        password = getattr(app, "SMTP_PASSWORD", None)
    return SmtpConfig(
        host=host,
        port=pick("smtp_port", "SMTP_PORT", 587),
        user=pick("smtp_user", "SMTP_USER"),
        password=password,
        sender=pick("smtp_from", "SMTP_FROM")
        or pick("smtp_user", "SMTP_USER")
        or "noreply@localhost",
        use_tls=pick("smtp_use_tls", "SMTP_USE_TLS", True),
        password_needs_reentry=password_needs_reentry,
    )


Attachment = tuple[str, bytes, str]  # (filename, content, mimetype)


def _send(
    to: str,
    subject: str,
    html: str,
    cfg: SmtpConfig,
    text: str | None = None,
    attachments: list[Attachment] | None = None,
) -> tuple[bool, str | None]:
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = cfg.sender
        msg["To"] = to
        msg.set_content(text or "This message requires an HTML-capable client.")
        msg.add_alternative(html, subtype="html")
        for filename, content, mimetype in attachments or []:
            maintype, _, subtype = (mimetype or "application/octet-stream").partition("/")
            msg.add_attachment(
                content,
                maintype=maintype or "application",
                subtype=subtype or "octet-stream",
                filename=filename,
            )
        use_ssl = cfg.port == 465
        smtp_cls = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_cls(cfg.host, cfg.port, timeout=15) as s:
            if cfg.use_tls and not use_ssl:
                s.starttls()
            if cfg.user and cfg.password:
                s.login(cfg.user, cfg.password)
            s.send_message(msg)
        return True, None
    except Exception as exc:
        logger.warning(
            "Email send failed to %s via %s:%s — %s", to, cfg.host, cfg.port, exc
        )
        return False, str(exc)


def send_email(
    to: str, subject: str, html: str, cfg: SmtpConfig, text: str | None = None
) -> bool:
    ok, _ = _send(to, subject, html, cfg, text)
    return ok


def send_email_detailed(
    to: str,
    subject: str,
    html: str,
    cfg: SmtpConfig,
    text: str | None = None,
    attachments: list[Attachment] | None = None,
) -> tuple[bool, str | None]:
    """Same as send_email but also returns the error string on failure, for UI diagnostics.

    `attachments` is an optional list of (filename, content, mimetype).
    """
    return _send(to, subject, html, cfg, text, attachments)


def send_transactional_email(
    to: str,
    subject: str,
    html: str,
    text: str,
    app_settings,
    *,
    action_link: str | None = None,
) -> None:
    """Send an app-level transactional email (password reset, verification) using
    the GLOBAL SMTP_* settings only — never a per-user notification SMTP config.

    Never raises: if SMTP is unconfigured, the action link is logged at WARNING
    level instead so the flow stays testable in dev (no SMTP_* set). If SMTP IS
    configured, the link is deliberately NOT logged — it would otherwise leak
    a password-reset / email-verify link into the server log in production.
    """
    cfg = resolve_smtp_config(None, app_settings)
    if cfg is None:
        logger.warning(
            "SMTP not configured — transactional email to %s not sent. Action link: %s",
            to,
            action_link or "(none)",
        )
        return

    ok, err = send_email_detailed(to, subject, html, cfg, text)
    if not ok:
        logger.warning("Transactional email to %s failed to send: %s", to, err)
