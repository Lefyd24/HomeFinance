# Configuration reference

All settings are environment variables, read from the repository-root `.env` file. In Docker, Compose forwards the whole file into the container (`env_file: .env`), so every variable below works without editing `docker-compose.yml`.

- Names are case-sensitive and unknown names are ignored.
- List values must be valid JSON: `CORS_ORIGINS=[]`, `ADMIN_EMAILS=["you@example.com"]`.
- After editing `.env`, run `docker compose restart app`.
- `.env.example` is the starting template. A few variables below (marked †) are not in the template but are supported.

## Startup validation

With `DEBUG=false` (production), the app **refuses to start** and the container restarts in a loop (check `docker compose logs app`) when:

1. `SECRET_KEY` is empty, is the placeholder, or is under 32 characters.
2. `NOTIFICATIONS_ENABLED=true` and `NOTIFICATION_ENCRYPTION_KEY` is empty.
3. `BANK_SYNC_ENABLED=true` and any of `EB_APPLICATION_ID`, `EB_PRIVATE_KEY_PATH`, `EB_REDIRECT_URL` is missing, or the key file doesn't exist.

With `DEBUG=true` these checks only log warnings. Never use `DEBUG=true` in production.

## Core and security

| Variable | Default | Notes |
|---|---|---|
| `SECRET_KEY` | none | **Required.** Signs login tokens. Generate with `openssl rand -hex 32`. |
| `DEBUG` | `false` | `true` bypasses the startup checks and adds permissive localhost CORS. |
| `APP_NAME` | `Personal Finance API` | Display name in API docs. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` (template: `30`) | Access-token lifetime. |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | `10080` | Refresh-token lifetime (7 days). |
| `BACKEND_PORT` | `8223` | The single port serving both UI and API. |
| `BIND_ADDRESS` | `127.0.0.1` | Compose only. Host interface the port is published on. |
| `BIND_HOST` | `127.0.0.1` | Interface for `python main.py` outside Docker. |
| `PF_IMAGE_TAG` | `latest` | Compose only. Which published image to run, for example `1.0.0` to pin a release. See [Operations](operations.md#updating). |
| `CORS_ORIGINS` | `[]` | Leave empty for same-origin deployment, which is the default. `["*"]` disables credentials. |
| `TRUST_PROXY_HEADERS` | `false` (template: `true`) | Trust `X-Forwarded-For` for the client IP. Only safe when the port is reachable solely through your local proxy. See [Deployment](deployment.md#trusting-proxy-headers). |
| `PUBLIC_BASE_URL` | unset | Public origin used in verification and reset emails, for example `https://finance.your-tailnet.ts.net`. Falls back to the request origin. |
| `FRONTEND_BASE_URL` | unset | Where the browser lands after a bank callback. Falls back to `PUBLIC_BASE_URL`. Set to `http://localhost:5173` only in Vite dev. |
| `ADMIN_EMAILS` | `[]` | JSON list. Existing users with these emails are promoted to admin at startup. Never creates accounts. |

## Legal pages

The public Privacy Policy (`/privacy`) and Terms (`/terms`) pages show who operates the instance. Enable Banking requires these pages when you register a production application, and the people you invite read them. The values are served from `GET /api/legal` (no login needed), so they are **not** compiled into the image. Set your own.

| Variable | Default | Notes |
|---|---|---|
| `LEGAL_OPERATOR_NAME` | unset | Who runs this instance. A personal name is fine for a household. |
| `LEGAL_CONTACT_EMAIL` | unset | Data-protection contact. Use a mailbox you read, because Enable Banking asks for it and users write to it. |
| `LEGAL_JURISDICTION` | unset | Country whose law governs the Terms, usually where you live. |

Until the name and email are set, both pages show a "not configured" notice. A restart applies changes.

## Rate limiting

In-process sliding windows, reset on restart. Applied to login, register, forgot-password and resend-verification. Exceeding a limit returns `429` with `Retry-After`.

| Variable | Default |
|---|---|
| `RATE_LIMIT_PER_IP_MAX` / `RATE_LIMIT_PER_IP_WINDOW_SECONDS` | `10` / `60` |
| `RATE_LIMIT_PER_EMAIL_MAX` / `RATE_LIMIT_PER_EMAIL_WINDOW_SECONDS` | `5` / `60` |

## Storage and logging

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./finance.db` (Docker/template: `sqlite:////app/data/finance.db`) | Three slashes is relative to `backend/`, four is absolute. Outside Docker, any URL under `/app/data/` is remapped to `<repo>/data/finance.db`. |
| `DOCUMENTS_DIR` | `<repo>/data/documents` | Files are stored per user. |
| `DOCUMENTS_MAX_FILE_SIZE` | `50` MB | Per-file upload limit for the Documents page. |
| `LOG_DIR` | `<repo>/logs` | Falls back to `~/.local/state/personalfinance/logs` if not writable. |
| `LOG_LEVEL` | `INFO` | |

## Notifications

See [Notifications](notifications.md) for setup.

| Variable | Default | Notes |
|---|---|---|
| `NOTIFICATIONS_ENABLED` | `true` | Master switch. |
| `NOTIFICATION_ENCRYPTION_KEY` | unset | **Required when notifications are enabled.** Encrypts per-user SMTP passwords. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS` | unset, `587`, unset, unset, unset, `true` | Global mail settings. Also used for verification and reset emails. Users can override them in the UI. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | unset, unset, `mailto:admin@example.com` | Web Push. Generate with `scripts/generate_vapid_keys.py`. |

## Bank sync (Enable Banking)

See the [Bank connection guide](bank-sync.md) for the full walkthrough.

| Variable | Default | Notes |
|---|---|---|
| `BANK_SYNC_ENABLED` | `false` | Master switch. When off, bank routes return `503` and no job runs. |
| `EB_APPLICATION_ID` | none | Required when enabled. Used as the JWT `kid`. |
| `EB_PRIVATE_KEY_PATH` | none | Required when enabled. In Docker use `/app/secrets/enablebanking.pem`. |
| `EB_REDIRECT_URL` | none | Required when enabled. Must exactly match the URL registered with Enable Banking. |
| `EB_API_BASE` | `https://api.enablebanking.com` | |
| `EB_CONSENT_DAYS` | `90` | Requested consent length. Banks may grant less, and the granted value is what is stored. |
| `EB_INITIAL_HISTORY_DAYS` | `365` | History requested on an account's first sync. |
| `EB_INCLUDE_PENDING` | `false` | Also import not-yet-booked transactions. |
| `EB_SYNC_OVERLAP_DAYS` | `3` | Days re-fetched on each sync, because banks backdate bookings. |
| `EB_MANUAL_SYNC_COOLDOWN_MINUTES` | `60` | Minimum gap between manual syncs of one connection. |
| `EB_CONSENT_WARN_DAYS` | `7` | Days of warning before consent expiry. |

## AI advisor (OpenRouter)

See the [AI advisor guide](ai-advisor.md).

| Variable | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | unset | Unset disables the feature. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `AI_DEFAULT_MODEL` | `deepseek/deepseek-chat-v3.1` | Used when a user hasn't picked a model. |
| `AI_MAX_OUTPUT_TOKENS` | `4096` | |
| `AI_TURN_COST_CAP_USD` | `0.25` | Max spend for one answer. |
| `AI_MONTHLY_CAP_USD` | unset | Household-wide monthly cap. **Leave the line out** rather than setting it empty, because an empty value fails to parse. |
| `AI_FALLBACK_PRICE_IN_PER_M` / `AI_FALLBACK_PRICE_OUT_PER_M` | `1.0` / `4.0` | USD per million tokens, used only when no price is reported. |
| `AI_CHAT_MAX_TOOL_ROUNDS` | `10` | Data look-ups the assistant can chain per question. |
| `AI_CHAT_TIMEOUT_SECONDS` † | `90` | |
| `AI_CHAT_PER_HOUR` † | `60` | Per-user message cap. |
| `AI_TOOL_RESULT_MAX_CHARS` † | `20000` | Longer tool results are trimmed. |
| `AI_INVESTMENT_TOOLS_ENABLED` † | `true` | `false` limits the assistant to transactions, budgets and debts. |
| `AI_SKILL_MAX_ROUNDS` † | `25` | Upper bound on tool rounds for skills. |
| `AI_WEB_SEARCH_ENABLED` † | `false` | Enables the `/web` skill. Searches are billed extra. |
| `AI_WEB_SEARCH_MAX_RESULTS` † | `5` | |
| `AI_WEB_SEARCH_MODEL` † | unset | Falls back to the default model. |

## Investments and analytics †

None of these are validated at startup. Defaults are sensible for most households.

| Variable | Default | Notes |
|---|---|---|
| `INVESTMENT_SYNC_ENABLED` | `true` | Scheduled broker sync. |
| `INVESTMENT_SYNC_INTERVAL_HOURS` | `4` | |
| `INVESTMENT_MANUAL_SYNC_COOLDOWN_SECONDS` | `60` | |
| `ANALYTICS_ENABLED` | `true` | |
| `ANALYTICS_RISK_FREE_ANNUAL` | `0.02` | Used for Sharpe and Sortino ratios. |
| `ANALYTICS_DEFAULT_BENCHMARK` | `^GSPC` | |
| `ANALYTICS_MAX_COMPARE_SYMBOLS` | `5` | |
| `MARKET_DATA_CACHE_TTL_HOURS` | `12` | |
| `MARKET_DATA_MAX_HISTORY_YEARS` | `15` | |
| `TECHNICAL_ANALYSIS_ENABLED` | `true` | |
| `SIMULATION_DEFAULT_PATHS` / `SIMULATION_MAX_PATHS` | `10000` / `20000` | Monte Carlo paths. |
| `SIMULATION_MAX_HORIZON_DAYS` | `504` | |
| `SIMULATION_DEFAULT_LOOKBACK_DAYS` | `756` | |
| `SCENARIO_TRACKING_ENABLED` | `true` | Nightly valuation of saved scenarios. |
| `SCENARIO_VALUATION_HOUR_UTC` | `22` | Job runs at `:30` past this hour. |
| `SCENARIO_MAX_PER_USER` | `200` | |
| `SCENARIO_DEFAULT_COST_BPS` | `10` | |
| `SCENARIO_MAX_CONTRIBUTIONS` | `600` | |

## Background jobs

Jobs run in-process (APScheduler). The scheduler starts only if at least one job type is enabled.

| Job | Schedule | Enabled by |
|---|---|---|
| Notification checks | hourly, and once at startup | `NOTIFICATIONS_ENABLED` |
| Investment sync | every `INVESTMENT_SYNC_INTERVAL_HOURS`, and once at startup | `INVESTMENT_SYNC_ENABLED` |
| Bank sync | every 24 hours, **not** at startup (protects bank API quotas) | `BANK_SYNC_ENABLED` |
| Scenario valuation | daily at `SCENARIO_VALUATION_HOUR_UTC`:30 | `SCENARIO_TRACKING_ENABLED` |

Recurring expenses are not auto-posted. They appear in upcoming lists and notifications, and you mark them paid.
