"""send_report_email_tool: render a Markdown report and email it to the user, optionally
with a PDF copy attached.

Security boundary: the recipient is `user_email`, injected server-side for tools in
NEEDS_USER_EMAIL and absent from the schema, so the model cannot choose or redirect it.
Gating mirrors `send_analysis_email_tool`: the user's own `email_enabled` notification
setting and a resolvable SMTP configuration are both required.

Must not import app.services.ai_service (circular).
"""
import logging
import re
import unicodedata

from sqlalchemy.orm import Session

from app.routers.notifications import _get_or_create_settings
from app.services import email_templates, mail_service, report_rendering

logger = logging.getLogger("app.ai")

MAX_MARKDOWN_CHARS = 60_000
MAX_SUBJECT_CHARS = 200
DEFAULT_SUBJECT = "Your financial report"


def _pdf_filename(subject: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", subject).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Za-z0-9]+", "-", ascii_text).strip("-").lower()[:60]
    return f"{slug or 'report'}.pdf"


def _preheader(markdown: str) -> str:
    plain = report_rendering.markdown_to_text(markdown)
    for line in plain.splitlines():
        line = line.strip()
        if line:
            return line[:140]
    return ""


def send_report_email_tool(
    db: Session,
    user_id: int,
    subject: str,
    markdown: str,
    attach_pdf: bool = False,
    *,
    user_email: str,
) -> dict:
    """Email the current user a formatted report. Recipient is always the logged-in user."""
    fail = {"sent": False, "to": user_email, "attached_pdf": False}

    if not isinstance(markdown, str) or not markdown.strip():
        return {**fail, "error": "markdown must be a non-empty report body."}
    if len(markdown) > MAX_MARKDOWN_CHARS:
        return {
            **fail,
            "error": (
                f"Report is too long ({len(markdown)} characters; the limit is "
                f"{MAX_MARKDOWN_CHARS}). Shorten it and call the tool again."
            ),
        }
    title = (subject or "").strip()[:MAX_SUBJECT_CHARS] or DEFAULT_SUBJECT

    settings_row = _get_or_create_settings(db, user_id)
    if not settings_row.email_enabled:
        return {**fail, "error": "Email notifications are disabled in settings."}

    from app.config import settings as app_settings

    cfg = mail_service.resolve_smtp_config(settings_row, app_settings)
    if cfg is None:
        return {**fail, "error": "No SMTP configuration available."}

    try:
        body_html = report_rendering.markdown_to_html(markdown)
        text_body = report_rendering.markdown_to_text(markdown)
        html, text = email_templates.render(
            title, body_html, preheader=_preheader(markdown), text_body=text_body
        )
    except Exception:
        logger.exception("Report rendering failed")
        return {**fail, "error": "The report could not be rendered."}

    attachments = None
    if attach_pdf:
        try:
            pdf = report_rendering.markdown_to_pdf(markdown, title)
        except Exception:
            logger.exception("PDF rendering failed")
            return {**fail, "error": "The PDF could not be generated; nothing was sent."}
        attachments = [(_pdf_filename(title), pdf, "application/pdf")]

    ok, err = mail_service.send_email_detailed(
        user_email, title, html, cfg, text=text, attachments=attachments
    )
    result = {"sent": bool(ok), "to": user_email, "attached_pdf": bool(ok and attachments)}
    if not ok:
        result["error"] = err or "The email could not be sent."
    return result


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "send_report_email_tool",
            "description": (
                "Email the user a formatted report (Markdown: headings, lists, tables, bold), "
                "optionally with a PDF copy attached. Only call this when the user explicitly "
                "asked to be emailed. Always sends to the user's own account email; you cannot "
                "choose a recipient. Max 60,000 characters."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {"type": "string", "description": "Email subject and report title."},
                    "markdown": {
                        "type": "string",
                        "description": "The full report in Markdown. Tables use pipe syntax.",
                    },
                    "attach_pdf": {
                        "type": "boolean",
                        "description": "Also attach the report as a PDF. Default false.",
                    },
                },
                "required": ["subject", "markdown"],
            },
        },
    }
]

DISPATCH = {"send_report_email_tool": send_report_email_tool}
NEEDS_USER_EMAIL = {"send_report_email_tool"}
