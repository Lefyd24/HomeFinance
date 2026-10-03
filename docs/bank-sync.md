# Bank connection (Enable Banking)

Home Finance can pull transactions and balances straight from your bank using [Enable Banking](https://enablebanking.com), a PSD2 open-banking aggregator covering many European banks. Access is **read-only** (balances and transactions only). The feature is **off by default**.

> Enable Banking's portal and policies change over time. This guide covers what the app needs and does. For anything about the portal itself, trust Enable Banking's own documentation.

## How it works

1. You register your own application with Enable Banking and download its private key.
2. You tell Home Finance the application id, the key path and the redirect URL.
3. In the app you pick your bank. You're sent to the bank to approve access (strong customer authentication, same as in your banking app).
4. The bank sends you back to Home Finance, which creates local accounts and imports your history.
5. A nightly job keeps the accounts in sync until the consent expires (typically after 90 days), at which point you reconnect.

Your credentials never touch Home Finance. The app only holds an encrypted session id from the bank.

## Prerequisites

- A deployment reachable from your browser at a stable HTTPS URL, such as [Tailscale Funnel](deployment.md#option-a-tailscale-funnel-recommended). The bank redirects your browser back to your instance, so `localhost` is generally not usable.
- A set of working [SMTP settings](notifications.md#email-smtp) if you want expiry reminder emails.

## Step 1: Register an application

1. Create an account at [enablebanking.com](https://enablebanking.com) and open the **Control Panel**.
2. Register a new **production** application.
3. **Download the private key** (`.pem`). It is only shown once, so keep it safe and never commit it. The repository's `.gitignore` already excludes `*.pem` and `secrets/`.
4. Note the **Application ID**.
5. Register the **redirect URL**:

   ```
   https://<your-public-origin>/api/bank-sync/callback
   ```

   For example `https://finance.your-tailnet.ts.net/api/bank-sync/callback`. It must match **exactly**, including scheme, host and path, what you put in `EB_REDIRECT_URL`.

## Step 2: Link your accounts (restricted mode)

For personal use you can activate your application in **restricted mode** through "Activate by linking accounts" in the Control Panel. Enable Banking then only serves accounts you've explicitly linked to the application.

**Every person who connects a bank must link their own accounts in the Control Panel first.** If they don't, the bank login succeeds but the app receives no accounts. This is the most common setup problem.

## Step 3: Put the key where the container can read it

```bash
mkdir -p secrets
cp ~/Downloads/<your-key>.pem secrets/enablebanking.pem
chmod 600 secrets/enablebanking.pem
```

`docker-compose.yml` mounts `./secrets` read-only at `/app/secrets`. The key is never baked into the image.

## Step 4: Configure `.env`

```dotenv
BANK_SYNC_ENABLED=true
EB_APPLICATION_ID=<your application id>
EB_PRIVATE_KEY_PATH=/app/secrets/enablebanking.pem
EB_REDIRECT_URL=https://<your-public-origin>/api/bank-sync/callback
PUBLIC_BASE_URL=https://<your-public-origin>
```

`EB_PRIVATE_KEY_PATH` must be the **in-container** path (`/app/secrets/...`), not the host path. `.env.example` shows `./secrets/enablebanking.pem`, which only applies outside Docker.

Restart: `docker compose restart app`. With `BANK_SYNC_ENABLED=true` and a missing variable or key file, the app refuses to start and the log names the problem. That check covers existence only, so a wrong key surfaces later as an authorization error.

Optional tuning is in the [configuration reference](configuration.md#bank-sync-enable-banking).

## Step 5: Connect a bank

1. Open **Connections** in the app and click **Connect a bank**.
2. Search for your bank. The list defaults to Greek institutions (`country=GR`). The API accepts any two-letter country code, but the dialog has no country picker yet.
3. You're redirected to your bank. Approve access.
4. You land back on **Connections** with a confirmation. Local accounts have been created, and the initial sync runs in the background.

What happens to accounts:

- There is **no manual mapping step**. Each account the bank exposes becomes a local account (type `checking`, named after the bank's product or `<Bank> <last 4 of IBAN>`).
- If you reconnect, existing accounts are matched by the bank's account id and re-attached, so history, budgets and rules are kept.
- Bank-linked accounts are **read-only for balances and manual entries**. The bank balance is the source of truth, and manual transactions and file imports are rejected on them.

Tip: if you already track an account manually, remove the overlap with `backend/scripts/delete_transactions_range.py --dry-run` after the first sync, so you don't have duplicates.

## How syncing works

| Aspect | Behaviour |
|---|---|
| Schedule | Every 24 hours for all active connections. It deliberately does **not** run at startup, to protect bank API quotas (some banks allow as few as 4 calls per account per day). |
| Manual sync | The **Sync now** button, limited to one per `EB_MANUAL_SYNC_COOLDOWN_MINUTES` (60) per connection. |
| First sync | Requests `EB_INITIAL_HISTORY_DAYS` (365) of history. Full history is only available for about an hour after you authorize, and many banks cap it (often 90 days). If the bank rejects the window, the app retries with progressively shorter ones. |
| Later syncs | Re-fetches from the last sync minus `EB_SYNC_OVERLAP_DAYS` (3), because banks backdate bookings. |
| Pending items | Booked transactions are always imported. Pending ones only when `EB_INCLUDE_PENDING=true`, in which case they're replaced on every sync and may vanish. |
| De-duplication | Booked rows are keyed on the bank's entry reference. If a bank doesn't send one, a content hash is used, and two identical same-day transactions would collapse into one. |
| Categorization | [Rules](user-guide.md#categorization-rules) run on every imported row. Rows matching no rule stay uncategorized. |
| Balance | Taken from the bank (booked balance, or available balance when pending is enabled). |

## Consent expiry and renewing

A bank consent lasts at most `EB_CONSENT_DAYS` (default 90), often less. Nothing renews automatically, because a renewal needs a fresh authentication at your bank.

- The Connections page shows a notice when a consent is expiring, expired, revoked or in error.
- With [notifications](notifications.md) enabled, you get an **email** `EB_CONSENT_WARN_DAYS` (7) before expiry and again on expiry, once per consent.
- Banks sometimes drop a session early. The page labels this "premature" and it's normal.

To renew, click **Reconnect** on the bank's card and approve again. Accounts, history, budgets and rules are kept, and full history is requested again.

## Disconnecting

- **Whole bank**: Disconnect on its card.
- **One account**: unlink it from the connection.

You choose whether to **keep** the account (it becomes an ordinary manual account with its history, pending rows removed) or **delete** it. The remote session is revoked on a best-effort basis.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Connections page says bank sync isn't configured (`503`) | `BANK_SYNC_ENABLED` is false or a required variable is missing. |
| App won't start after enabling | A variable is missing, or the key file isn't at `EB_PRIVATE_KEY_PATH`. In Docker the path must be `/app/secrets/...`. Check `docker compose logs app`. |
| "Could not reach the bank directory" (`502`) | Unreadable key, wrong application id and key pair, or no network. The server log has the real error. |
| "Could not start the bank authorisation" (`502`) | Enable Banking rejected the request. The usual cause is a redirect URL that isn't registered or doesn't match exactly. |
| The bank redirects to an error page, or never returns to the app | The redirect URL isn't reachable from your browser (for example `localhost`). Use your public HTTPS origin. |
| `no_accounts` after logging in at the bank | Restricted-mode whitelist: link the accounts in the Enable Banking Control Panel, then connect again. |
| `invalid_state` / `missing_state` | Unknown or missing state. Start the connection again. |
| `state_already_used` | The callback was replayed (for example by refreshing). Start again. |
| `state_expired` | More than 15 minutes between starting and finishing. Start again. |
| `bank_declined` | You cancelled, or the bank refused. |
| `session_failed` | Exchanging the code for a session failed. Try again. |
| Only about 90 days of history | A bank limit. Reconnect to request history again. |
| An account shows `rate_limited` | The bank's daily call quota. The nightly sync retries. |
| "Your bank rejected the request" (`502`) | A temporary bank-side error. Retry later. |
| Connection shows `expired` | Click **Reconnect**. |
| Connection shows `error` after a key change | Stored sessions couldn't be decrypted because `SECRET_KEY` or `NOTIFICATION_ENCRYPTION_KEY` changed. Reconnect. See [rotating secrets](operations.md#rotating-secrets). |
| Many uncategorized transactions | Banks' terse descriptions often match no rule. Add rules. |
| Pending transactions appear and disappear | Expected when `EB_INCLUDE_PENDING=true`. |

## Privacy

Home Finance talks to Enable Banking and, through it, to your bank, to fetch your own transactions and balances. Nothing else about your finances is sent. See [Security and privacy](security.md).

Banks, their logos and names used in the UI belong to their respective owners. Their use here only identifies the institution.
