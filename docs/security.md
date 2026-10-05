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
- **JWT access and refresh tokens.** Users may also create up to 10 named API keys for scripts, sent in the `X-API-Key` header. Each is **read-only** (GET only) or **full access**, only a hash is stored, and the key is shown once. Keys cannot create or revoke other keys.
- **Rate limiting** on login, registration, forgot-password and resend-verification: 10 requests per minute per IP and 5 per minute per email by default, with `Retry-After`. See [Deployment](deployment.md#trusting-proxy-headers) for getting client IPs right behind a proxy.
- **Per-user data isolation.** Every query is scoped to the signed-in user. AI tools never accept a user id.
- Admins can activate or deactivate users but can't read other users' data through the UI.

## Secrets handling

- The app **refuses to start in production** without a strong `SECRET_KEY` (32+ characters) and, when notifications are on, a `NOTIFICATION_ENCRYPTION_KEY`.
- Per-user SMTP passwords, broker API keys and bank session ids are **encrypted at rest**. Broker keys are never returned by the API.
- The Enable Banking private key is mounted read-only and never baked into the image. `.gitignore` excludes `.env`, `*.pem`, `*.key`, `secrets/` and database files.
- Passwords are hashed. See `backend/app/utils/security.py`.
- Errors returned to clients are generic plus a correlation id. Tracebacks stay in server logs.

## Network posture

- By default the port binds to **127.0.0.1** only. Exposure happens through your own proxy or Tailscale. See [Deployment](deployment.md).
- No CORS middleware is installed for the default same-origin setup (`CORS_ORIGINS=[]`).
- The container has no TLS of its own. Always put HTTPS in front of anything reachable from outside your home network.

## Hardening checklist

- [ ] `DEBUG=false`
- [ ] Unique `SECRET_KEY` and `NOTIFICATION_ENCRYPTION_KEY`, backed up securely
- [ ] HTTPS in front of the app
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
