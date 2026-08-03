# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal Finance — a self-hosted personal finance app (accounts, transactions, budgets, debts, goals, reports, bank sync, investments, an AI advisor chat). See `README.md` for the full feature list and env var reference. One household's data, single Docker image, SQLite on disk.

## Architecture

- **Backend**: FastAPI + SQLAlchemy + SQLite, in `backend/app/`. Layered as `routers/` (HTTP endpoints, prefixed `/api` in `main.py`) → `services/` (business logic, e.g. `bank_sync_service.py`, `transaction_service.py`, `notification_service.py`) → `models/` (SQLAlchemy ORM). `schemas/` holds Pydantic request/response models, one file per domain, mirroring `models/`.
- **Frontend**: React 19 + TypeScript + Vite in `frontend/app/`, one folder per feature domain under `src/` (e.g. `src/transactions/`, `src/budgets/`, `src/reports/`), each typically with a `*Page.tsx`, a `use*.ts` hook (TanStack Query), and a `*Api.ts` (fetch wrapper via `src/lib/apiClient.ts`). Shared UI in `src/ui/` and `src/components/ui/` (shadcn/Radix). i18n via `src/locales/{en,el}`.
- **Legacy frontend**: `frontend/` (not `frontend/app`) is an old vanilla JS + DaisyUI/Tailwind frontend, kept only as a no-rebuild rollback (`FRONTEND_DIR=/app/frontend/legacy`). Don't add features here — it's being phased out.
- **Single-origin serving**: in production the backend serves the built React SPA itself (`main.py`'s `_SpaStaticFiles`/`_FrontendMount`) from the same port as the API, so it works behind Tailscale Funnel (one port in, one service). `/api/*` is always matched before the SPA catch-all.
- **Background jobs**: APScheduler (`app/services/scheduler.py`) drives bank sync, investment sync, recurring-expense processing, and notification checks — started in `main.py`'s lifespan.
- **Migrations**: Alembic, configured in `backend/alembic/` (`backend/ALEMBIC_GUIDE.md` has the full workflow). Migrations run automatically on container startup via `docker-entrypoint.sh`.
- **Auth**: JWT access+refresh tokens, invite-only registration, email verification, per-IP/per-email rate limiting (`app/utils/rate_limit.py`).
- **External integrations** (all optional, feature-flagged in `app/config.py`): Enable Banking (EU bank sync), DeepSeek (AI chat), Freedom24/TraderNet + yfinance (investments), SMTP + Web Push/VAPID (notifications).

## Commands

### Backend (from repo root, uses `uv`)
```bash
uv sync --group dev                              # install deps
cd backend && uv run alembic upgrade head         # apply migrations
cd backend && uv run python main.py               # run backend (http://localhost:8223)
uv run pytest backend/tests -v                    # run all backend tests
uv run pytest backend/tests/test_rule_service.py -v          # single test file
uv run pytest backend/tests/test_rule_service.py::test_name -v  # single test
```

### Frontend (from `frontend/app/`)
```bash
npm install
npm run dev        # Vite dev server, proxies /api and /health to the backend (BACKEND_PORT, default 8224 in dev config)
npm run build       # tsc -b && vite build — type errors fail the build
npm run lint         # eslint
npm run format       # prettier --write
npm run test          # vitest run
```

### Docker (full stack)
```bash
docker compose up --build     # build and start
docker compose logs -f
docker compose down
```

## Testing conventions

- Backend tests live in `backend/tests/`, using `pytest` with a FastAPI `TestClient` and an in-memory SQLite `db` fixture per test (see `backend/tests/conftest.py`). `backend/tests/factories.py` has model factories.
- `conftest.py` forces `DATABASE_URL=sqlite://` and `INVESTMENT_SYNC_ENABLED=false` before any app import — the module-level `engine`/scheduler otherwise try to hit the real configured DB/network on TestClient startup. Keep this ordering in mind if you touch fixtures.
- Frontend tests are colocated with components (`*.test.tsx` next to the component), run via Vitest with jsdom; `frontend/app/src/test-setup.ts` and `src/test/dom.ts` hold shared setup. Vitest config forces `pool: 'forks'`, single worker, no file parallelism (see `vite.config.ts`) — don't "fix" perceived slowness by changing that without checking why it was set that way first.

## Notable conventions

- Cross-platform care: this repo is developed on Windows but deploys on Linux (Docker) — code that touches file paths must not assume POSIX separators (see the `Path(path).parts` comment in `main.py`'s static file handler).
- Settings are centralized in `backend/app/config.py` (pydantic-settings); the app refuses to start in production (`DEBUG=false`) without a real `SECRET_KEY`, and similarly guards `NOTIFICATION_ENCRYPTION_KEY` and bank-sync settings. Don't loosen these checks — read the comments in `config.py`/`main.py` before touching startup validation.
- Global exception handler in `main.py` returns only a generic message + correlation id to clients, logging the real traceback server-side — don't leak exception text into API responses when adding new error handling.
