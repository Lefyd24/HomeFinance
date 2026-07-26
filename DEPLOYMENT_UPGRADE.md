# Production Upgrade Notes — Tailscale Funnel Hardening

This covers what changed on the `backend`/infra side to make it safe to expose
the production instance to friends and family over **Tailscale Funnel**, and
the exact, ordered steps to apply on the production server.

Context: production already has `SMTP_*` / notification settings configured
(dev does not), so the SECRET_KEY / encryption-key steps below are NOT
optional there — skipping the order will silently destroy every stored SMTP
password. Read this whole file before touching the production `.env`.

## What changed

- `app/config.py` now refuses to start (raises at import time) if `SECRET_KEY`
  is empty, the placeholder default, or under 32 characters — unless
  `DEBUG=true`, which bypasses the check but logs a loud warning. Same for
  `NOTIFICATION_ENCRYPTION_KEY` when `NOTIFICATIONS_ENABLED=true`.
- `NOTIFICATION_ENCRYPTION_KEY` is now the key that encrypts stored per-user
  SMTP passwords (`app/utils/crypto.py`). Previously it silently fell back to
  `SECRET_KEY` when unset, so rotating `SECRET_KEY` would have silently broken
  every stored SMTP password (`crypto.decrypt` now raises `DecryptionError`
  instead of a bare `InvalidToken`, and the mail service surfaces "SMTP
  password needs re-entering" instead of a raw failure).
- `CORS_ORIGINS` now defaults to `[]` (no CORS headers at all), because the
  backend serves the frontend itself — same-origin — so no CORS is needed in
  production. `CORS_ORIGINS=["*"]` is still supported but forces
  `allow_credentials=False` (logged loudly) since browsers reject
  wildcard-origin + credentialed requests anyway.
- `main.py` now mounts `frontend/public` at `/`, so the API and the UI are
  served from the same origin/port (`BACKEND_PORT`, default 8223). The
  separate `frontend` supervisord program and its `FRONTEND_PORT` (3100)
  publish are gone — only `BACKEND_PORT` needs to be reachable.
- The unauthenticated `/api/import/test-upload` endpoint was deleted, and
  unhandled-exception responses no longer include `str(exc)` — clients get a
  generic message plus a short `error_id` that is also written to the server
  log, so you can match a user's bug report to a log line without leaking
  internals to the public internet.

## Ordered steps for the production server

Do these **in order**. Steps 1–2 are about the notification encryption key and
must happen **before** you ever rotate `SECRET_KEY` — reversing the order (or
skipping step 1) makes every stored SMTP password permanently undecryptable,
and users will have to re-enter their SMTP password in Notification Settings.

1. **Pin `NOTIFICATION_ENCRYPTION_KEY` to the CURRENT production `SECRET_KEY`
   value, right now, before anything else.**
   - Look up the current `SECRET_KEY` value in the production `.env`.
   - Add to the production `.env`:
     ```
     NOTIFICATION_ENCRYPTION_KEY=<paste the current SECRET_KEY value here>
     ```
   - Restart the backend. This is a no-op for behavior (the Fernet key
     derivation is identical to today's implicit fallback), but it freezes
     the key that decrypts existing stored SMTP passwords so it survives the
     next step.
   - Verify: in Notification Settings, send a test email and confirm it still
     sends successfully before proceeding.

2. **Generate and set a strong, unique `SECRET_KEY`.**
   - Generate one: `openssl rand -hex 32`
   - Set it in the production `.env`: `SECRET_KEY=<generated value>`
   - **This logs out every currently signed-in user** (JWTs are signed with
     `SECRET_KEY`; refresh tokens too) — do this at a time that's fine to
     have everyone re-login.
   - Do NOT touch `NOTIFICATION_ENCRYPTION_KEY` in this step — it must stay
     pinned to the value captured in step 1, not the new `SECRET_KEY`.
   - Restart the backend. On startup it validates `SECRET_KEY` is present,
     not the placeholder, and ≥32 characters — if you see a startup error
     referencing `openssl rand -hex 32`, the value wasn't set correctly.

3. **Set `CORS_ORIGINS=[]`.**
   - In production `.env`: `CORS_ORIGINS=[]`
   - This is safe now because the backend serves the frontend itself
     (same-origin) — no cross-origin requests need CORS headers. If
     `CORS_ORIGINS` is currently `["*"]` or unset, replace it with `[]`.
   - Restart the backend and confirm the app still loads and logs in
     normally at `http://<server>:<BACKEND_PORT>/`.

4. **Confirm `DEBUG=false` in production `.env`.** `DEBUG=true` bypasses the
   `SECRET_KEY` / `NOTIFICATION_ENCRYPTION_KEY` validation above and
   re-enables permissive localhost CORS — it must be `false` before exposing
   anything publicly.

5. **Rebuild/redeploy** with the updated code (single-origin frontend mount,
   `/api/import/test-upload` removed, generic error responses). If using
   Docker: `docker compose up --build -d`. Note `docker-compose.yml` no
   longer publishes port 3100 — only `BACKEND_PORT` (default 8223) needs to
   be exposed/mapped now.

6. **Sanity check before exposing publicly** (run from the server, or over
   Tailscale before Funnel is turned on):
   ```bash
   curl -s http://127.0.0.1:${BACKEND_PORT:-8223}/health
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:${BACKEND_PORT:-8223}/
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:${BACKEND_PORT:-8223}/api/auth/me   # expect 401
   curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:${BACKEND_PORT:-8223}/api/import/test-upload  # expect 404
   ```

7. **Restrict the port to loopback and trust the proxy headers.** Funnel runs
   on this same host and reaches the app over `127.0.0.1`, so nothing needs to
   listen on the LAN/tailnet directly:
   ```bash
   # .env
   BIND_ADDRESS=127.0.0.1      # docker compose publishes on loopback only
   TRUST_PROXY_HEADERS=true
   ```
   Why both, together: Tailscale Serve/Funnel connects from loopback and sets
   `X-Forwarded-For` to the real client IP. Without `TRUST_PROXY_HEADERS=true`
   the rate limiter sees only the proxy's address, so **every Funnel visitor
   shares one per-IP bucket** — one person retrying a forgotten password would
   start 429-ing everyone else's logins. Trusting that header is only safe
   while the port is unreachable except via `tailscaled`; if you publish it on
   `0.0.0.0`, anyone who can reach it can spoof `X-Forwarded-For` and bypass
   the rate limiter entirely. Set both, or neither.

   (Running bare-metal instead of Docker, `BIND_HOST` in `.env` does the same
   job — it defaults to `127.0.0.1`.)

8. **Expose via Tailscale Funnel**, pointing at the single backend port:
   ```bash
   tailscale funnel --bg ${BACKEND_PORT:-8223}
   ```
   Check status with `tailscale funnel status`. Funnel forwards exactly one
   port to one local service — this is why the steps above consolidated the app
   onto a single origin/port.

   Note this replaces direct tailnet access by IP:port (the port is loopback
   only now). Devices on your tailnet reach the same `.ts.net` hostname; use
   `tailscale serve` instead of `funnel` if you ever want tailnet-only access.

9. **After Funnel is live**, re-run the sanity checks from step 6 against the
   public `https://<your-tailnet-name>.ts.net` hostname instead of
   `127.0.0.1`, and confirm login/notifications still work end-to-end for a
   real user.

## Rollback notes

- If step 2 (SECRET_KEY rotation) goes wrong, restoring the previous
  `SECRET_KEY` value restores previous sessions' validity; it does not affect
  `NOTIFICATION_ENCRYPTION_KEY` since that's now independent.
- If `NOTIFICATION_ENCRYPTION_KEY` is ever lost or rotated without care,
  existing stored SMTP passwords cannot be recovered — affected users will
  see "SMTP password needs re-entering" and must re-enter their SMTP password
  in Notification Settings. This is not a security bug, just data loss for
  that one field — nothing else is affected.

## Invite-only registration, rate limiting, password reset, email verification

This second round closes the gap left by the first: anyone who could reach
the Funnel URL could previously self-register. Registration is now
invite-only, auth endpoints are rate limited, users can self-serve a password
reset, and new accounts must verify their email before they can log in.

### What changed

- New `invite_codes` and `user_tokens` tables (single migration `009`, see
  below). Only a sha256 hash of each invite code / reset / verify token is
  ever stored — plaintext values exist only transiently (shown once to the
  admin, or embedded in an emailed link).
- `users` gained three columns: `is_admin`, `email_verified`, and
  `sessions_valid_from`. The migration sets `email_verified=true` for every
  existing row (nobody currently signed in gets locked out) and
  `sessions_valid_from=now()` (so existing JWTs keep working — they aren't
  invalidated by the migration itself, only by a future password reset/change).
- `POST /api/auth/register` now requires a valid, unused, unexpired
  `invite_code`. Invalid/expired/already-used codes all return the same
  generic 400 — the response never reveals which case applies.
- A minimal admin surface at `/api/admin/*` (invite create/list/revoke, user
  list/activate/deactivate — no user deletion) gated by a new `require_admin`
  dependency, plus an **Admin** page in the UI (only visible in the sidebar to
  admins).
- `POST /api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`,
  and `/api/auth/resend-verification` are rate limited by an in-process
  sliding-window limiter — both by client IP and (separately) by the target
  email, so one attacker can't spread attempts across accounts, and one
  account can't be trivially locked out from many IPs. Returns `429` with a
  `Retry-After` header. Tunable via `RATE_LIMIT_*` settings.
- `POST /api/auth/forgot-password` and `/reset-password` implement a
  standard reset flow. Forgot-password **always** returns the same response
  whether or not the email exists. Resetting (or changing) a password bumps
  `sessions_valid_from`, which the JWT auth path now checks against the
  token's `iat` — this is what actually invalidates existing sessions; before
  this change, "logout" was purely client-side and a stolen 7-day refresh
  token survived a password change.
- New accounts start with `email_verified=false` and get a verification
  email; login is blocked with a distinct, explicit error until verified.
  `POST /api/auth/resend-verification` re-sends it (rate limited).
- `change_password`'s `confirm_password` field is now actually compared to
  `new_password` (it was silently ignored before).
- Transactional email (reset/verify links) always uses the **global**
  `SMTP_*` settings — never a user's personal notification SMTP config — via
  `mail_service.send_transactional_email`. When SMTP is unconfigured (e.g.
  dev), the action link is logged at `WARNING` instead of failing the
  request; when SMTP **is** configured, the link is never logged, so
  production never leaks reset/verify links into the server log.

### New settings

Added to both `.env.example` files — copy the new keys into your real `.env`:

- `ADMIN_EMAILS` — JSON list, e.g. `["you@example.com"]`. At every startup,
  any user who **already exists** with a matching email gets `is_admin=true`.
  This does not create accounts, so you need at least one account before it
  does anything.
- `PUBLIC_BASE_URL` — e.g. `https://your-tailnet-name.ts.net`. Used to build
  absolute links in reset/verify emails. Falls back to the incoming request's
  own origin if unset, so it's optional but recommended for a stable value.
- `TRUST_PROXY_HEADERS` — **set `true` for Tailscale Funnel** (see step 7).
  The app then uses the first hop of `X-Forwarded-For` as the client IP for
  rate limiting instead of `request.client.host`, which behind Funnel is
  always the local proxy. Left `false` behind a proxy, every visitor shares
  a single per-IP bucket, so one person hammering login 429s everyone. Only
  safe together with a loopback-only bind (`BIND_ADDRESS` / `BIND_HOST`) —
  on a directly reachable port the header is attacker-controlled.
- `BIND_ADDRESS` (compose) / `BIND_HOST` (bare metal) — default `127.0.0.1`.
  Keeps the app reachable only through `tailscaled`. Set `0.0.0.0` for direct
  LAN/tailnet access, and then set `TRUST_PROXY_HEADERS=false`.
- `RATE_LIMIT_PER_IP_MAX` / `RATE_LIMIT_PER_IP_WINDOW_SECONDS` (default 10/60s)
  and `RATE_LIMIT_PER_EMAIL_MAX` / `RATE_LIMIT_PER_EMAIL_WINDOW_SECONDS`
  (default 5/60s).

### Running the migration

```bash
cd backend
alembic upgrade head   # applies revision 009 on top of 008
```

Existing users are grandfathered in as `email_verified=true` — nobody who
already has an account needs to re-verify. Existing JWTs are not invalidated
by this migration (`sessions_valid_from` defaults to "now" for existing
rows, and outstanding tokens were issued before that default is written, so
`iat < sessions_valid_from` would incorrectly reject them — in practice this
is a non-issue since the migration runs as part of a deploy that also
restarts the app, and any token issued in the brief window between the
column being added and requests resuming has an `iat` at or after that
`now()`; if you want to be extra safe, avoid issuing new tokens between
`alembic upgrade` and the app restart).

### Issuing the first invite codes

1. Set `ADMIN_EMAILS=["your-email@example.com"]` in `.env` (the email of an
   account you already have — this bootstrap only promotes existing users).
2. Restart the backend. Check the log for `Promoted N user(s) to admin from
   ADMIN_EMAILS`.
3. Log in and open the **Admin** page (now visible in the sidebar) →
   **Invite Codes** → **+ New invite**. The plaintext code is shown exactly
   once — copy it before closing the dialog.
4. Send the code to the person you're inviting; they paste it into the
   invite-code field on the registration page. Each code is single-use.
5. Once someone else has registered, you can optionally add their email to
   `ADMIN_EMAILS` too and restart to make them a second admin.
