# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

Releases that add database migrations or new `.env` settings say so, so you know what to check before updating. Migrations always apply automatically on start, so [back up first](docs/operations.md#backups).

## [Unreleased]

## [1.0.1] - 2026-10-03

No new migrations and no new `.env` settings.

### Fixed
- The app could stall for about 30 seconds, mostly while loading the dashboard, and then return a 500. Authentication and file-upload handlers ran blocking database calls on the event loop, so once the connection pool filled up nothing could release a connection. They now run in the thread pool.
- The AI chat no longer holds a database connection for the whole streamed answer; tool calls and usage bookkeeping use short-lived sessions.
- The investments watchlist refreshes stale prices concurrently under a 5 second limit instead of one ticker at a time, and no longer holds a connection while waiting on Yahoo.
- Investment sync fetches chart-history candles before opening its write transaction, so a slow broker no longer blocks other writes.
- Every request was logged twice (once by uvicorn, once by the app logger). Only the app logger remains.
- A brand-new Docker install started with an empty database: the entrypoint created no tables but still stamped Alembic at head, so account creation failed with `no such table: users`. `init_db()` now registers all models itself. If you hit this, delete the empty `data/finance.db*` files and start again.

### Changed
- Investment sync and the notification check now start 2 minutes and 1 minute after boot instead of immediately, so they don't compete with the first page load after a restart.
- The SQLite connection pool is larger (20 + 20 overflow) with a 10 second timeout, so exhaustion fails fast.

## [1.0.0] - 2026-10-03

First public release.

### Added
- Accounts, transactions (income, expense, transfer, split), categories and categorization rules.
- Budgets, recurring expenses, debts (snowball and avalanche comparison) and goals.
- Reports with saved views, scheduled report emails and CSV export, plus a dashboard.
- Bank sync through Enable Banking (PSD2, read-only), with consent-expiry reminders.
- Investments: Freedom24 and Binance sync, portfolio analytics, ticker comparison, backtesting and scenarios, technical analysis, company research.
- AI advisor through OpenRouter with a model picker, cost caps, skills and an investor profile with undo.
- Email and Web Push notifications with quiet hours and de-duplication.
- Documents, trackers, English and Greek interface, light and dark themes, installable PWA.
- Invite-only registration, email verification, password reset and rate limiting.
- Prebuilt multi-arch (amd64 and arm64) Docker image on GitHub Container Registry.
- Full documentation in [`docs/`](docs/README.md), an ISC `LICENSE`, and CI and release workflows.

### Changed
- The Privacy Policy and Terms pages read the operator's name, contact email and jurisdiction from the server instead of compiled-in values. **Action required:** set `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL` and `LEGAL_JURISDICTION` in `.env`. Until you do, those pages show a "not configured" notice. See [Configuration](docs/configuration.md#legal-pages).
- `docker-compose.yml` now names the published image. `docker compose pull && docker compose up -d` updates without building.

[Unreleased]: https://github.com/Lefyd24/HomeFinance/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/Lefyd24/HomeFinance/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Lefyd24/HomeFinance/releases/tag/v1.0.0
