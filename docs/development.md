# Development

How the project is organized and how to run it locally. Contributions are welcome. Open an issue first for anything large.

## Architecture

```
frontend/app/   React 19 + TypeScript + Vite, one folder per feature under src/
backend/app/    FastAPI + SQLAlchemy + SQLite
  routers/      HTTP endpoints (mounted under /api)
  services/     business logic
  models/       SQLAlchemy ORM models
  schemas/      Pydantic request/response models, mirroring models/
  ai_skills/    AI chat skills (SKILL.md + tools.py)
  llm/          OpenRouter client
backend/alembic/  database migrations
scripts/          admin, VAPID and backup helpers
docs/             this documentation
promo/            marketing video and poster
```

Key ideas:

- **Layering**: `routers → services → models`. Keep business logic in services.
- **Single-origin serving**: in production the backend serves the built SPA itself from the same port as the API. `/api/*` is always matched before the SPA catch-all, which is what lets Tailscale Funnel or any single-port proxy work.
- **Background jobs**: APScheduler (`app/services/scheduler.py`) starts in the app lifespan. See [Configuration](configuration.md#background-jobs).
- **Feature flags**: every external integration is optional and gated in `app/config.py`.
- **Frontend features** typically contain a `*Page.tsx`, a `use*.ts` TanStack Query hook and a `*Api.ts` wrapper over `src/lib/apiClient.ts`. Shared UI is in `src/ui/` and `src/components/ui/` (shadcn and Radix). Translations are in `src/locales/{en,el}`.

### Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Radix and shadcn components, TanStack Query and Table, Apache ECharts and Recharts, i18next |
| Backend | FastAPI, SQLAlchemy, SQLite, Alembic, APScheduler |
| Auth | JWT access and refresh tokens, invite-only registration, email verification |
| AI and data | OpenRouter, yfinance, scikit-learn and statsmodels in the analytics layer |
| Packaging | Multi-stage Docker image, Docker Compose |

## Prerequisites

- Python 3.11 and [uv](https://docs.astral.sh/uv/)
- Node.js 22 (Vite 8 needs 20.19+ or 22.12+)

## Run locally

```bash
# 1. Settings
cp .env.example .env
# set SECRET_KEY, and DEBUG=true is fine for local work

# 2. Backend
uv sync --group dev
cd backend && uv run alembic upgrade head
BACKEND_PORT=8223 uv run python main.py      # http://localhost:8223

# 3. Frontend (second terminal)
cd frontend/app
npm install
BACKEND_PORT=8223 npm run dev                # Vite dev server, proxies /api and /health
```

Notes:

- Vite's dev proxy defaults to backend port **8224** when `BACKEND_PORT` is unset, while the backend defaults to **8223**. Set `BACKEND_PORT=8223` for both as above, or run the backend on 8224.
- For bank-callback redirects in dev, set `FRONTEND_BASE_URL=http://localhost:5173`.
- Create a first user with `uv run python scripts/create_admin.py you@example.com 'password' "Name"` from the repo root.
- To test against the production bundle, run `npm run build` in `frontend/app`. The backend then serves `frontend/app/dist` itself.

## Tests

```bash
uv run pytest backend/tests -v                         # all backend tests
uv run pytest backend/tests/test_rule_service.py -v    # one file
cd frontend/app && npm run test                        # Vitest (jsdom)
cd frontend/app && npm run lint && npm run build       # lint, then typecheck + build
```

- Backend tests use an in-memory SQLite database per test (`backend/tests/conftest.py`) and model factories in `backend/tests/factories.py`. `conftest.py` forces `DATABASE_URL=sqlite://` and `INVESTMENT_SYNC_ENABLED=false` before any app import. Keep that ordering if you touch fixtures.
- Frontend tests sit next to the code (`*.test.tsx`). Vitest is configured with `pool: 'forks'`, a single worker and no file parallelism in `vite.config.ts`. Check why before changing that.
- CI (`.github/workflows/ci.yml`) runs the backend tests, the frontend tests, the typecheck and build, and a Docker build on every push and pull request. Please run the suites locally first. Lint is currently non-blocking in CI while a few long-standing React-compiler rule errors in older components are cleaned up.
- Backend tests need `DEBUG=true` in the environment when there is no `.env`: `DEBUG=true uv run pytest backend/tests -q`.
- On Node 25 or newer, jsdom's `localStorage` is shadowed by Node's own and many frontend tests fail. Run them with `NODE_OPTIONS=--no-webstorage npm run test`, or use Node 22 as CI does.

## Conventions

- **Cross-platform paths**: the project is developed on several operating systems and deployed on Linux. Don't assume POSIX separators in code that touches paths.
- **Settings** are centralized in `backend/app/config.py` (pydantic-settings). Don't loosen the production startup checks, and read the comments there before touching them.
- **Error handling**: the global handler returns a generic message and a correlation id. Don't leak exception text into API responses.
- **Migrations**: any model change needs an Alembic revision. See [Migrations](migrations.md#creating-a-migration-developers).
- **Translations**: add keys to both `src/locales/en` and `src/locales/el`.
- **Design**: calm, precise and unshowy. Tabular numerals for money, thin rules, restrained colour. Avoid generic chatbot styling.

## Releases

Maintainers publish versions by tagging. See [Releasing](releasing.md).

## Building the image

```bash
docker compose build
docker compose up -d
```

The build runs `npm ci` and `npm run build` (`tsc -b && vite build`), so a TypeScript error fails it.

## Adding an AI skill

A skill is a directory under `backend/app/ai_skills/<name>/` with a `SKILL.md` (frontmatter with name and description, plus the method) and an optional `tools.py`. Skills are validated when the app imports, so a malformed skill fails startup. Register a slash command in `frontend/app/src/ai-advisor/useAiChat.ts`.

## Adding a broker

Implement a provider in `backend/app/services/investment_providers/` and register it in `PROVIDERS`. Then add it to the connect dialog in the frontend.
