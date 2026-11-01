# Security and privacy

Home Finance is built for one household running its own server. This page explains the security model and, just as important, exactly what leaves your machine.

## Your data stays with you by default

The API, the web app and the SQLite database run in one container on hardware you control. Accounts, transactions, budgets, debts, goals, reports, rules, notifications and documents are computed and stored locally. There is no analytics, telemetry or vendor account.

### What leaves the server, and only if you enable it

| Feature | Sent to | What is sent |
|---|---|---|
| [AI chat](ai-advisor.md) | OpenRouter and the provider of the model you pick | Your messages, a system prompt (date, account summary, investor profile) and the tool results the model reads, which can include transactions, balances, budgets, debts, goals and holdings. Only when you send a message. |
| AI web search (`/web`) | OpenRouter | The search query |
| [Bank sync](bank-sync.md) | Enable Banking and your bank | Authorization requests. Your own transactions and balances come back. |
| [Brokerage sync](investments.md) | Freedom24 or Binance | API requests with your read-only keys |
| Market data and research | Yahoo Finance (via `yfinance`) | Ticker symbols you look up or hold |
| [Email](notifications.md) | Your SMTP server | The alert, report or verification email |
| [Push](notifications.md) | Your browser vendor's push service | An encrypted push message |

Everything else is local. If you don't enable a feature, nothing is sent.

## Authentication and access

- **Invite-only registration.** Nobody can sign themselves up. Admins create single-use invite codes. Only a hash of each code is stored, and the code is shown once.
- **Email verification** before login, and a self-service **forgot-password** flow. Responses never reveal whether an email has an account. Verification links last 24 hours and reset links 30 minutes. Only token hashes are stored.
- **Sessions.**
  - The access token (1 day) is kept in memory only.
  - The refresh token (7 days) is an `HttpOnly; Secure; SameSite=Strict` cookie, limited to `/api/auth`.
  - Page scripts can't read either token, and neither is stored in `localStorage` or put in a URL.
  - **Logging out ends every session** of that account, on all devices.
  - Over plain HTTP on anything other than `localhost`, browsers won't store the `Secure` cookie, so a reload signs you out. Use HTTPS (see [Deployment](deployment.md#exposing-on-the-lan-instead)).
- **API keys.** Users may create up to 10 named API keys for scripts, sent in the `X-API-Key` header.
  - Each key is **read-only** (GET only) or **full access**.
  - Only a hash is stored, and the key is shown once.
  - Keys cannot create or revoke other keys.
- **Rate limiting.**
  - Covered endpoints: login, registration, forgot-password, resend-verification, token refresh, logout, reset-password, verify-email and change-password.
  - Default limits: 10 requests per minute per IP and 5 per minute per email, answered with `Retry-After`.
  - A successful login clears only that email's counter, not the IP's.
  - See [Deployment](deployment.md#trusting-proxy-headers) for getting client IPs right behind a proxy.
- **Per-user data isolation.**
  - Every query is scoped to the signed-in user.
  - Any account, category, transaction or budget id in a request must belong to that user, or the request gets a 404.
  - `backend/tests/test_cross_user_routes.py` checks every `/api` route that takes an id against another user's data.
  - AI tools never accept a user id.
- Admins can activate or deactivate users but can't read other users' data through the UI.

## Secrets handling

- The app **refuses to start in production** without a strong `SECRET_KEY` (32+ characters) and, when notifications are on, a `NOTIFICATION_ENCRYPTION_KEY`.
- Per-user SMTP passwords, broker API keys and bank session ids are **encrypted at rest** with a key derived from `NOTIFICATION_ENCRYPTION_KEY`, which falls back to `SECRET_KEY`. Startup warns in production when the two are the same. Broker keys are never returned by the API.
- The key can be rotated without losing stored secrets. See [Rotating secrets](operations.md#rotating-secrets).
- The database and uploaded documents themselves are **not** encrypted by the app. Use full-disk encryption on the host, and encrypt backups (see [Backups](operations.md#backups)).
- The Enable Banking private key is mounted read-only and never baked into the image. `.gitignore` excludes `.env`, `*.pem`, `*.key`, `secrets/` and database files.
- Passwords are hashed. See `backend/app/utils/security.py`.
- Errors returned to clients are generic plus a correlation id. Tracebacks stay in server logs.

## Network posture

- By default the port binds to **127.0.0.1** only. Exposure happens through your own proxy or Tailscale. See [Deployment](deployment.md).
- No CORS middleware is installed for the default same-origin setup (`CORS_ORIGINS=[]`).
- **Security headers** on every response:
  - a Content-Security-Policy (scripts only from the app itself, no framing);
  - `X-Frame-Options: DENY`;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: same-origin`;
  - HSTS.
- The interactive API docs (`/docs`, `/redoc`, `/openapi.json`) are only served when `DEBUG=true`.
- Outbound requests a user can configure are restricted:
  - A personal SMTP server must be on a public host, and it never inherits the global SMTP credentials.
  - Web Push endpoints must be `https` on a public host.
- The container has no TLS of its own. Always put HTTPS in front of anything reachable from outside your home network.

## Hardening checklist

- [ ] `DEBUG=false`
- [ ] Unique `SECRET_KEY` and a **different** `NOTIFICATION_ENCRYPTION_KEY`, backed up securely
- [ ] `PUBLIC_BASE_URL` set, so reset and verification links don't depend on the request's `Host` header
- [ ] HTTPS in front of the app
- [ ] Full-disk encryption for `data/`; `chmod 700 data secrets` and `chmod 600 .env`
- [ ] Encrypted backups (`BACKUP_AGE_RECIPIENT`), with the age identity kept off the server
- [ ] `BIND_ADDRESS=127.0.0.1` with `TRUST_PROXY_HEADERS=true` (or LAN bind with trust off)
- [ ] Strong, unique passwords for every user
- [ ] Regular, tested backups of `data/`, `.env` and `secrets/`
- [ ] Keep the image updated: `docker compose pull && docker compose up -d` (see [Operations](operations.md#updating))
- [ ] Use read-only API keys at your broker
- [ ] Set `AI_MONTHLY_CAP_USD` if you enable the AI chat

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's **private vulnerability reporting** on the repository's Security tab, or contact the maintainer directly through the address on their GitHub profile. Include steps to reproduce and the version or commit.

## Disclaimers

Home Finance is a personal tool. Nothing it shows, including the AI advisor, calculators and investment analytics, is financial, tax or legal advice. Bank and broker names and logos shown in the interface belong to their owners and are used only to identify the institution.
