"""HTML email layout for notifications.

Table-based layout with inline CSS (email clients strip <style> and ignore
flexbox/grid), hardcoded hex colors (clients can't resolve oklch()/CSS vars),
and escaped user-controlled text. Returns (html, plain_text) so callers can
send a genuine multipart alternative instead of a placeholder string.
"""

import html as _html

APP_NAME = "Personal Finance"

_BG = "#f3f4f6"
_CARD_BG = "#ffffff"
_TEXT = "#1f2937"
_MUTED = "#6b7280"
_PRIMARY = "#2563eb"
_BORDER = "#e5e7eb"


def _wrap(title: str, body_html: str, preheader: str = "") -> str:
    safe_title = _html.escape(title)
    return f"""<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:{_BG}; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">{_html.escape(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG}; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:92%; background:{_CARD_BG}; border-radius:12px; overflow:hidden; border:1px solid {_BORDER};">
          <tr>
            <td style="background:{_PRIMARY}; padding:20px 28px;">
              <span style="color:#ffffff; font-size:16px; font-weight:600;">{APP_NAME}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px; font-size:20px; line-height:1.3; color:{_TEXT};">{safe_title}</h1>
              {body_html}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px; border-top:1px solid {_BORDER};">
              <p style="margin:0; font-size:12px; color:{_MUTED};">
                You're receiving this because you have notifications enabled in {APP_NAME}.
                Manage your alerts in Settings &rarr; Notifications.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _p(text: str) -> str:
    return f'<p style="margin:0 0 12px; font-size:14px; line-height:1.6; color:{_TEXT};">{_html.escape(text)}</p>'


def _stat_row(label: str, value: str) -> str:
    return f"""
    <tr>
      <td style="padding:6px 0; font-size:13px; color:{_MUTED};">{_html.escape(label)}</td>
      <td style="padding:6px 0; font-size:13px; color:{_TEXT}; text-align:right; font-weight:600;">{_html.escape(value)}</td>
    </tr>"""


def _stats_table(rows: list[tuple[str, str]]) -> str:
    body = "".join(_stat_row(k, v) for k, v in rows)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">{body}</table>'


def _progress_bar(pct: float) -> str:
    pct = max(0.0, min(100.0, pct))
    fill_color = "#dc2626" if pct >= 100 else ("#f59e0b" if pct >= 80 else "#10b981")
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">
      <tr>
        <td style="background:{_BORDER}; border-radius:6px; height:10px;">
          <table role="presentation" width="{pct:.0f}%" cellpadding="0" cellspacing="0"><tr>
            <td style="background:{fill_color}; border-radius:6px; height:10px; font-size:1px; line-height:1px;">&nbsp;</td>
          </tr></table>
        </td>
      </tr>
    </table>"""


def render(title: str, body_html: str, *, preheader: str = "") -> tuple[str, str]:
    """Generic renderer: wraps arbitrary already-safe body_html."""
    html_out = _wrap(title, body_html, preheader or title)
    text_out = (
        f"{title}\n\n(View this email in an HTML-capable client for full formatting.)"
    )
    return html_out, text_out


def recurring_due(
    name: str, amount: float, due_date: str, days_until_due: int
) -> tuple[str, str]:
    title = f"{name} due soon"
    when = (
        "today"
        if days_until_due == 0
        else (
            f"in {days_until_due} day{'s' if days_until_due != 1 else ''}"
            if days_until_due > 0
            else f"{abs(days_until_due)} day(s) overdue"
        )
    )
    body = _p(f'Your recurring expense "{name}" is due {when}.') + _stats_table(
        [
            ("Amount", f"€{amount:,.2f}"),
            ("Due date", due_date),
        ]
    )
    html_out = _wrap(title, body, f"€{amount:,.2f} due {when}")
    text_out = f"{title}\n\nAmount: €{amount:,.2f}\nDue date: {due_date}"
    return html_out, text_out


def debt_due(
    name: str, amount: float, due_date: str, days_until_due: int
) -> tuple[str, str]:
    title = f"{name} payment due soon"
    when = (
        "today"
        if days_until_due == 0
        else (
            f"in {days_until_due} day{'s' if days_until_due != 1 else ''}"
            if days_until_due > 0
            else f"{abs(days_until_due)} day(s) overdue"
        )
    )
    body = _p(f'Your debt payment for "{name}" is due {when}.') + _stats_table(
        [
            ("Minimum payment", f"€{amount:,.2f}"),
            ("Due date", due_date),
        ]
    )
    html_out = _wrap(title, body, f"€{amount:,.2f} due {when}")
    text_out = f"{title}\n\nMinimum payment: €{amount:,.2f}\nDue date: {due_date}"
    return html_out, text_out


def balance_below(
    account_name: str, balance: float, threshold: float
) -> tuple[str, str]:
    title = f"Low balance: {account_name}"
    body = _p(
        f'"{account_name}" has dropped below your alert threshold.'
    ) + _stats_table(
        [
            ("Current balance", f"€{balance:,.2f}"),
            ("Alert threshold", f"€{threshold:,.2f}"),
        ]
    )
    html_out = _wrap(title, body, f"{account_name} is €{balance:,.2f}")
    text_out = f"{title}\n\nCurrent balance: €{balance:,.2f}\nAlert threshold: €{threshold:,.2f}"
    return html_out, text_out


def budget_percent(
    budget_name: str, pct: float, spent: float, limit: float
) -> tuple[str, str]:
    title = f"Budget alert: {budget_name}"
    body = (
        _p(f'You\'ve used {pct:.0f}% of your "{budget_name}" budget.')
        + _stats_table(
            [("Spent", f"€{spent:,.2f}"), ("Budget limit", f"€{limit:,.2f}")]
        )
        + _progress_bar(pct)
    )
    html_out = _wrap(title, body, f"{pct:.0f}% of {budget_name} used")
    text_out = f"{title}\n\nSpent: €{spent:,.2f}\nBudget limit: €{limit:,.2f}\nUsed: {pct:.0f}%"
    return html_out, text_out


def scheduled_report(rule_name: str, report_type: str) -> tuple[str, str]:
    title = f"Your {report_type or 'finance'} report"
    body = _p(
        f'Here\'s your scheduled "{rule_name}" summary. Open {APP_NAME} to view the full report.'
    )
    html_out = _wrap(title, body, title)
    text_out = f"{title}\n\nOpen {APP_NAME} to view the full report."
    return html_out, text_out


def _button(label: str, url: str) -> str:
    safe_url = _html.escape(url, quote=True)
    return f"""
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:{_PRIMARY}; border-radius:8px;">
          <a href="{safe_url}" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">{_html.escape(label)}</a>
        </td>
      </tr>
    </table>"""


def _link_line(url: str) -> str:
    safe_url = _html.escape(url)
    return f'<p style="margin:0 0 4px; font-size:12px; color:{_MUTED}; word-break:break-all;">Or copy this link: {safe_url}</p>'


def password_reset(reset_url: str, expires_minutes: int = 30) -> tuple[str, str]:
    title = "Reset your password"
    body = (
        _p(
            "We received a request to reset your password. Click the button below to choose a new one."
        )
        + _button("Reset password", reset_url)
        + _link_line(reset_url)
        + _p(
            f"This link expires in {expires_minutes} minutes. If you didn't request this, you can safely ignore this email."
        )
    )
    html_out = _wrap(title, body, "Reset your password")
    text_out = f"{title}\n\n{reset_url}\n\nThis link expires in {expires_minutes} minutes. If you didn't request this, ignore this email."
    return html_out, text_out


def verify_email(verify_url: str) -> tuple[str, str]:
    title = "Verify your email"
    body = (
        _p(
            f"Welcome to {APP_NAME}! Please confirm your email address to activate your account."
        )
        + _button("Verify email", verify_url)
        + _link_line(verify_url)
    )
    html_out = _wrap(title, body, "Verify your email address")
    text_out = f"{title}\n\n{verify_url}"
    return html_out, text_out


def test_notification(title: str, body: str) -> tuple[str, str]:
    html_body = _p(body) + _p(
        "This is a test email to confirm your SMTP settings and email layout are working correctly."
    )
    html_out = _wrap(title, html_body, body)
    text_out = f"{title}\n\n{body}\n\nThis is a test email to confirm your SMTP settings and email layout are working correctly."
    return html_out, text_out
