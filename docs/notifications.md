# Notifications

Home Finance can alert you by **email** and by **desktop push** (Web Push). Both are optional, and the app degrades gracefully when nothing is configured: email silently no-ops and push shows a clear "not configured" message.

## What you can be alerted about

| Alert | Configured in |
|---|---|
| Bills due | Each [recurring expense](user-guide.md#recurring-expenses) (notify N days before) |
| Debt payments due | Evaluated automatically |
| Low account balance | A `balance_below` rule on a chosen account |
| Budget threshold reached | A `budget_percent` rule (for example 80 percent) |
| Scheduled reports | A `scheduled_report` rule: every N days, weekly or monthly |
| Investment return thresholds | Investment notification rules |
| Bank connection expiring or expired | Automatic when bank sync is on, **email only**. See [Bank connection](bank-sync.md#consent-expiry-and-renewing) |

Features in the Notifications page:

- A channel choice (email, push, or both) per rule
- **Quiet hours**, so you're not pinged at 2am
- **De-duplication**, so you never get the same alert twice
- **Send test** buttons per channel and a notification log
- **Run now** to evaluate rules immediately

Checks run hourly on the server.

## Email (SMTP)

Set the global mail server in `.env`:

```dotenv
NOTIFICATIONS_ENABLED=true
NOTIFICATION_ENCRYPTION_KEY=<openssl rand -hex 32>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASSWORD=app-password
SMTP_FROM=Home Finance <you@example.com>
SMTP_USE_TLS=true
```

These settings are also used for **verification** and **password reset** emails, so set them before inviting anyone.

Each user can override them from the Notifications page with their own SMTP server. Those passwords are stored encrypted with `NOTIFICATION_ENCRYPTION_KEY`.

> **Set `NOTIFICATION_ENCRYPTION_KEY` once and never change it** without asking users to re-save their SMTP passwords, or they become unreadable. If you rotate `SECRET_KEY`, pin this key to the old `SECRET_KEY` value first. See [rotating secrets](operations.md#rotating-secrets).

For Gmail and similar services, use an app password rather than your account password.

If SMTP isn't configured, links for verification and reset are written to the server log at WARNING level.

## Desktop push (Web Push)

Push needs a **secure origin (HTTPS)**, so use [Tailscale](deployment.md#option-a-tailscale-funnel-recommended) or a TLS proxy.

1. Generate a VAPID key pair once. This appends the keys to your `.env`:

   ```bash
   uv run python scripts/generate_vapid_keys.py
   ```

2. Review the subject in `.env`, ideally a real contact:

   ```dotenv
   VAPID_SUBJECT=mailto:you@example.com
   ```

3. Restart the container.
4. In the app, open **Notifications** and click **Enable desktop notifications** in each browser you want alerts in. Allow the browser prompt.

Keep the key pair. If you regenerate it, every browser subscription must be re-enabled.

The app is installable as a PWA. The service worker handles push messages but doesn't cache for offline use.

## Troubleshooting

| Symptom | Fix |
|---|---|
| App refuses to start | Notifications are on without `NOTIFICATION_ENCRYPTION_KEY`. Set it, or `NOTIFICATIONS_ENABLED=false`. |
| No email arrives | Use **Send test**, check `SMTP_*`, spam folders and `logs/app.log`. |
| "SMTP password needs re-entering" | The encryption key changed. Re-save the password. |
| Push says "not configured" | VAPID keys are missing. Generate them and restart. |
| Push button does nothing | The page isn't on HTTPS, or the browser blocked notifications for the site. |
| Alerts arrive late or not at night | Quiet hours are set, and checks run hourly. |
