# 💶 Personal Finance

Your own money, on your own server. Personal Finance is a **self-hosted** app for tracking accounts, spending, budgets, debts, and goals — built for one household to run for itself, not for a company to run for millions.

It's a normal web app you sign into from your phone or laptop (it also installs as a PWA), but the data lives in a plain SQLite file on a machine you control — there's no third party reading your bank statements by default. A few *optional* features (AI chat, live bank sync, brokerage sync) do talk to outside services, and each one is called out below so you know exactly what leaves your server and only if you choose to turn it on.

This README is written for the person actually using the app day to day. Every feature section below has a short **⚙ Setup** note for whoever installs/configures it — that might be you too, or a more technical friend/family member who set the server up.

---

## 🧭 What you can do with it

### Track your money

**Accounts, transactions & categories** — Add your bank accounts, cash, or credit cards, and log income, expenses, and transfers between them. Every transaction gets a category (groceries, rent, salary, …) so your spending naturally sorts itself into a picture you can read. Categories are color-coded and fully yours to rename or add to.

**Dashboard** — The first thing you see when you log in: a combined cashflow + net-worth chart, a breakdown of where your money went, and a quick look at your goals — the "how am I doing" screen.

**Reports** — A deeper, tabbed view (Overview, Cashflow, Spending, Budget & Savings, Debt) with a shared filter bar (pick accounts/categories once, it applies everywhere), saved views so you don't have to rebuild your favorite filter every time, and CSV export if you want to pull numbers into a spreadsheet.

> ⚙ **Setup** — No configuration needed; this is core functionality that works out of the box.

### Bring your data in without typing it all by hand

**Import wizard** — Upload a CSV or Excel export from your bank and step through mapping its columns to accounts, dates, and amounts, instead of entering months of history one row at a time.

**Categorization rules** — Write simple "if the description contains X, put it in category Y" rules once, and every future import or bank-synced transaction that matches gets categorized automatically. Rules are listed with how many times each has fired, so you can see which ones are actually doing work.

> ⚙ **Setup** — Both work out of the box, no configuration needed.

**Automatic bank sync** — For banks that support it (via the Enable Banking PSD2 service, mainly EU institutions), you can link an account once and have new transactions pull in automatically instead of importing manually. You'll be sent to your bank to approve the connection (this is the same "strong customer authentication" step you'd do in your bank's own app), then it just stays in sync — the app warns you a week before that consent expires so your sync doesn't quietly go dark.

> ⚙ **Setup** — Off by default. Requires registering an application with [Enable Banking](https://enablebanking.com) and setting these in `.env`:
> `BANK_SYNC_ENABLED=true`, `EB_APPLICATION_ID`, `EB_PRIVATE_KEY_PATH` (the `.pem` key downloaded at registration — mount it as a Docker volume, never bake it into the image), and `EB_REDIRECT_URL` (must exactly match a redirect URL registered with Enable Banking, and be reachable from your browser). Optional tuning: `EB_CONSENT_DAYS` (default 90, banks may grant less), `EB_INITIAL_HISTORY_DAYS` (default 365), `EB_INCLUDE_PENDING` (also import not-yet-booked card charges — off by default since they can vanish/change), `EB_SYNC_OVERLAP_DAYS`, `EB_MANUAL_SYNC_COOLDOWN_MINUTES`, `EB_CONSENT_WARN_DAYS`. The app refuses to start with `BANK_SYNC_ENABLED=true` and missing settings (unless `DEBUG=true`).

### Plan ahead

**Budgets** — Set a spending limit per category (or overall) for a period, and watch a progress bar fill up as you spend, instead of finding out you're over budget at the end of the month.

**Recurring expenses** — Track subscriptions and regular bills (rent, streaming, insurance) with their schedule, so you always know what's coming and when. If a bill stops but you want to keep its payment history, you can disable it instead of deleting it, and re-enable it later.

**Goals** — Set a savings target (emergency fund, vacation, a big purchase) with an amount and, optionally, a date. The app tracks your progress, tells you how much to save per month to hit your target date, and estimates when you'll actually get there based on how you've been saving recently.

**Debts** — Track loans and credit cards with their balance and interest rate, log payments against them, and see payoff progress over time.

> ⚙ **Setup** — All work out of the box, no configuration needed.

### Get help making sense of it

**Advisor** — A set of financial calculators (compound interest / investment growth, loan and mortgage amortization, an emergency-fund size recommendation based on your real spending, and net worth over time) that run entirely on your own numbers — no external service involved, deterministic math, always available.

**AI Advisor (chat)** — A conversational assistant you can ask things like *"how much did I spend on groceries last month?"*, *"am I too concentrated in one holding?"*, or *"should I pay off the car loan or invest that money?"*. It looks up your real transactions, accounts, budgets, debts, goals **and investment portfolio** via tool calls before answering (never guesses), can research any ticker's fundamentals, news and risk-adjusted performance, and can email you a written summary on request.

Unlike the calculators above, it will give you a direct recommendation — but it never does the arithmetic itself. Every figure it quotes comes from a deterministic calculation on the server, and it's required to state the main risk and what would make its advice wrong. It also never predicts a price.

**Investor profile** — Under your user menu. Your risk tolerance, horizon, target allocation, maximum single-position size and any sectors or tickers you won't touch. The advisor reads it before every answer and flags suggestions that would breach your limits. It can also update the profile itself when you tell it something relevant in conversation — every such change appears in the chat with its reasoning and a one-click undo, and the full history lives on the profile page.

> ⚙ **Setup** — Off unless configured. Uses [OpenRouter](https://openrouter.ai) as the AI gateway — get an API key at [openrouter.ai/keys](https://openrouter.ai/keys) and set `OPENROUTER_API_KEY` in `.env`. Your questions and the data the assistant looks up to answer them (including the tool results the model sees) are sent to OpenRouter and to the provider of the model you chose, for that one request; nothing is sent otherwise. A **model picker** in the chat lets each user choose any tool-capable model from the OpenRouter catalogue, and every answer shows its **cost** (tokens and USD). A **per-turn cost cap** stops a runaway answer, and an optional **household monthly cap** blocks new chats once reached; `GET /api/ai/usage` reports the current month's spend per model. Optional: `OPENROUTER_BASE_URL`, `AI_DEFAULT_MODEL` (default `deepseek/deepseek-chat-v3.1`, used when no model is picked), `AI_MAX_OUTPUT_TOKENS` (default 4096), `AI_TURN_COST_CAP_USD` (default 0.25, max spend for one answer), `AI_MONTHLY_CAP_USD` (unset = no cap; household-wide USD limit per calendar month — leave it out of `.env` rather than setting it empty), `AI_FALLBACK_PRICE_IN_PER_M` / `AI_FALLBACK_PRICE_OUT_PER_M` (defaults 1.0 / 4.0 USD per 1M tokens, used only when no price is reported; the cost is then shown as an estimate), `AI_CHAT_MAX_TOOL_ROUNDS` (default 10, caps how many data look-ups the assistant can chain per question), `AI_CHAT_PER_HOUR` (default 60, per-user message cap), `AI_TOOL_RESULT_MAX_CHARS` (default 20000, above which a look-up's result is trimmed), `AI_CHAT_TIMEOUT_SECONDS` (default 90), `AI_INVESTMENT_TOOLS_ENABLED` (default true — set false to keep the assistant to transactions, budgets and debts only).

### Keep receipts and grow your portfolio

**Documents** — Attach receipts, statements, or any file to a transaction (or just file it away), organized into folders, with previews. Handy for tax time or warranty claims.

> ⚙ **Setup** — No configuration needed. Files are stored under `data/documents/` on the server (`DOCUMENTS_DIR`, `DOCUMENTS_MAX_FILE_SIZE` — default 50MB — are configurable but rarely need changing).

**Investments** — Link a brokerage account (currently Freedom24) with API keys you generate on the broker's side, and the app pulls in your balance, positions, and transaction history on a schedule, plus lets you research companies and tickers and check market news. A manual "sync now" button is rate-limited so it doesn't hammer the broker's API.

> ⚙ **Setup** — Enabled by default (`INVESTMENT_SYNC_ENABLED=true`, syncs every `INVESTMENT_SYNC_INTERVAL_HOURS` hours, default 4). No server-wide API key needed — each user adds their own broker API key/secret when linking an account from the Investments page. `INVESTMENT_MANUAL_SYNC_COOLDOWN_SECONDS` (default 60) throttles the manual refresh button.

### Stay in the loop

**Notifications** — Email and desktop (Web Push) alerts for bills coming due, low account balances, and budget thresholds you're approaching, with quiet hours so you're not pinged at 2am, per-channel test-send buttons to confirm it's working, and dedupe so you don't get the same alert twice.

> ⚙ **Setup** — On by default (`NOTIFICATIONS_ENABLED=true`), but degrades gracefully with nothing configured (email silently no-ops, push shows a clear "not configured" message). To actually receive alerts:
> - **Email**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS` in `.env` (each user can also override these from the Notifications page in the UI).
> - **Desktop push**: generate a VAPID keypair once with `uv run python scripts/generate_vapid_keys.py` and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, then click "Enable desktop notifications" in the app.
> - Whenever notifications are on, set `NOTIFICATION_ENCRYPTION_KEY` (`openssl rand -hex 32`) — it encrypts any per-user SMTP password saved through the UI. **Set this before you ever rotate `SECRET_KEY`**, and never change it afterward without re-saving those passwords, or they become permanently unreadable.

---

## 👪 Multiple people, one server

The app supports more than one person (e.g. you and a partner) with separate logins and separate data.

- **Registration is invite-only.** New accounts need a one-time invite code — nobody can just sign themselves up on your server.
- Whoever is promoted to **admin** (see setup below) gets an **Admin** page to create and revoke invite codes and manage user accounts (activate/deactivate — no deletion from the UI).
- Accounts go through **email verification** before they can log in, and there's a self-service **forgot-password** flow.
- Login, registration, and password-reset attempts are **rate-limited** per IP and per email address, so a forgotten password doesn't turn into a lockout tool against someone else.

> ⚙ **Setup** — Set `ADMIN_EMAILS=["you@example.com"]` in `.env` (a JSON list) and restart; any user who **already registered** with a matching email becomes admin (this doesn't create the account itself — register normally first). From the Admin page, issue invite codes for everyone else. `PUBLIC_BASE_URL` (e.g. your Tailscale hostname) makes links in verification/reset emails stable; it otherwise falls back to whatever origin the request came in on. Rate limits are tunable via `RATE_LIMIT_PER_IP_MAX` / `RATE_LIMIT_PER_IP_WINDOW_SECONDS` and `RATE_LIMIT_PER_EMAIL_MAX` / `RATE_LIMIT_PER_EMAIL_WINDOW_SECONDS`.

## 🌍 Language

The interface is available in **English** and **Greek**, and picks up your browser's language automatically.

---

## 🔒 Your data, your server

This app is self-hosted: the API, the web app, and your SQLite database all run from one Docker container on a machine you control (your own server, a Raspberry Pi, a home NAS, etc.) — there's no vendor with a copy of your finances by default. The database file and any uploaded documents live in a plain `./data` folder on disk, so backing up your data is just backing up that folder.

The exceptions are the integrations you explicitly turn on: the **AI Advisor** sends your question and the data needed to answer it (including the tool results the model sees) to OpenRouter and to the provider of the model you pick; **bank sync** and **investment sync** talk to your bank/broker's own API to pull transactions and balances (that's the whole point of those features). Nothing else phones home. Everything else — accounts, transactions, budgets, debts, goals, reports, rules, notifications, documents — is computed and stored locally.

For exposing your instance to yourself (or family) outside your home network, the project is built around [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) — see [`DEPLOYMENT_UPGRADE.md`](DEPLOYMENT_UPGRADE.md) for the exact hardening steps (this is also where the invite-only registration and rate-limiting behavior above comes from).

---

## 🚀 Getting started (self-hosting)

This section is for whoever is setting the server up. The app ships as a single Docker image — one container serves both the web app and the API from one port.

### Prerequisites

- Docker and Docker Compose
- (Optional, for bare-metal/dev setups without Docker) Python 3.11+, [uv](https://docs.astral.sh/uv/), Node.js 22+

### Run it with Docker

```bash
git clone <repository-url>
cd PersonalFinance

cp .env.example .env
# Edit .env: at minimum set SECRET_KEY (openssl rand -hex 32)

docker compose up --build
```

Open **http://localhost:8223** — register the first account, then set `ADMIN_EMAILS` in `.env` to that address, restart, and use the Admin page to invite everyone else.

| Command | Effect |
|---|---|
| `docker compose up --build` | Build and start |
| `docker compose up -d` | Start in the background |
| `docker compose logs -f` | Follow logs |
| `docker compose down` | Stop |
| `docker compose down -v` | Stop and remove volumes (⚠ deletes the database) |

Your database and any uploaded documents persist in `./data` on the host; logs go to `./logs`. Database migrations run automatically on container startup.

### Key settings to review before going live

| Variable | Why it matters |
|---|---|
| `SECRET_KEY` | Signs login tokens. The app **refuses to start** without a real, ≥32-character value (unless `DEBUG=true`). Generate with `openssl rand -hex 32`. |
| `NOTIFICATION_ENCRYPTION_KEY` | Required once `NOTIFICATIONS_ENABLED=true`. Pin it to a fresh random value *before* anyone saves a personal SMTP password — rotating it afterward makes those passwords unreadable. |
| `DEBUG` | Must be `false` in production — `true` bypasses the key checks above and loosens CORS. |
| `BACKEND_PORT` | The single port the whole app is served on (default `8223`). |
| `CORS_ORIGINS` | Leave as `[]` for a normal same-origin deployment (the backend serves the frontend itself). |
| `ADMIN_EMAILS` | JSON list of emails to promote to admin on next startup (account must already exist). |

Running it long-term on a home server with systemd instead of managing `docker compose` by hand? See [`SETUP_SERVICE.md`](SETUP_SERVICE.md). Upgrading an existing production instance, or exposing it over Tailscale Funnel? See [`DEPLOYMENT_UPGRADE.md`](DEPLOYMENT_UPGRADE.md).

### Running it for development (without Docker)

<details>
<summary>Expand for local dev setup</summary>

The frontend is a Vite + React + TypeScript app (`frontend/app`); the backend is FastAPI. In production they're built into one image and served from one port, but for day-to-day frontend development you'll normally run Vite's own dev server against a locally running backend.

```bash
# 1. Backend deps
uv sync --group dev

# 2. Apply migrations
cd backend && uv run alembic upgrade head && cd ..

# 3. Start the backend
cd backend && uv run python main.py   # http://localhost:8223

# 4. In a second terminal, start the frontend dev server
cd frontend/app
npm install
npm run dev                            # Vite dev server, proxies API calls to the backend
```

Run backend tests with `uv run pytest backend/tests -v` from the repo root. Run frontend tests with `npm run test` inside `frontend/app`.

</details>

---

## 🛠 Under the hood (for the curious)

| Layer | Stack |
|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS, Radix UI/shadcn components, TanStack Query & Table, Apache ECharts, i18next |
| Backend | FastAPI, SQLAlchemy, SQLite, Alembic migrations, APScheduler for background jobs |
| Auth | JWT (access + refresh tokens), invite-only registration, email verification, rate-limited login |
| AI | OpenRouter (chat, user-selectable model), scikit-learn (spending clustering / category prediction), statsmodels ARIMA (spending forecasts) |
| Packaging | Single Docker image (multi-stage build), Docker Compose |

Full interactive API documentation is available at `/docs` on your running instance (e.g. `http://localhost:8223/docs`) once it's up.

Related docs in this repo:

- [`backend/ALEMBIC_GUIDE.md`](backend/ALEMBIC_GUIDE.md) — database migration workflow
- [`DEPLOYMENT_UPGRADE.md`](DEPLOYMENT_UPGRADE.md) — production hardening, invite-only auth, Tailscale Funnel
- [`SETUP_SERVICE.md`](SETUP_SERVICE.md) — running as a systemd service
- [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) — historical schema/data migration notes
- [`docs/superpowers/`](docs/superpowers/) — feature design and implementation plans

## License

ISC
