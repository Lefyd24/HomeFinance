# Personal Finance Management System

A full-stack personal finance application with a FastAPI backend and a vanilla JavaScript frontend. Track accounts, transactions, budgets, debts, goals, and reports — with bank import, JWT auth, and PWA support.

## Features

- **Dashboard** — cashflow + net-worth combo chart, spending breakdown, goals overview
- **Transactions** — income, expenses, transfers; inline editing and filtering
- **Accounts & categories** — multi-account tracking with color-coded categories
- **Budgets** — limit tracking with progress indicators
- **Reports** — tabbed reports (Overview, Cashflow, Spending, Budget & Savings, Debt) with global filters, saved views, and CSV export
- **Debts & goals** — payoff tracking and savings goals
- **Bank import** — CSV/Excel import wizard
- **Advisor** — spending forecasts and financial insights
- **Documents** — attach receipts and statements
- **Recurring expenses** — scheduled payment tracking
- **PWA** — installable progressive web app
- **Auth** — JWT login with refresh tokens; optional API keys

## Architecture

| Layer | Stack |
|-------|-------|
| Frontend | Static HTML, Tailwind CSS v4, daisyUI, vanilla JS, Apache ECharts |
| Backend | FastAPI, SQLAlchemy, SQLite, Alembic |
| Auth | JWT (access + refresh tokens) |
| Packaging | Docker Compose (optional) or local two-process dev |

## Ports (default)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3100 |
| Backend API | http://localhost:8223/api |
| Swagger docs | http://localhost:8223/docs |
| Health check | http://localhost:8223/health |

Ports are configured via `BACKEND_PORT` and `FRONTEND_PORT` in `.env`.

---

## Development setup (without Docker)

Use two terminals — one for the API, one for the static frontend.

### Prerequisites

- **Python 3.11+**
- **[uv](https://docs.astral.sh/uv/)** (recommended) or `pip` + `venv`
- **Node.js 18+** and **npm** (Tailwind CSS build only; no frontend bundler)
- **Git**

Install uv (if needed):

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 1. Clone and configure environment

```bash
git clone <repository-url>
cd PersonalFinance

cp .env.example .env   # Windows: copy .env.example .env
```

Edit `.env` for local development. At minimum, set a secret key and enable debug reload:

```env
SECRET_KEY=change-me-to-a-random-string
DEBUG=true

# Docker value works locally too — the backend remaps /app/data/ → ./data/finance.db
DATABASE_URL=sqlite:////app/data/finance.db

BACKEND_PORT=8223
FRONTEND_PORT=3100
CORS_ORIGINS=["*"]
```

Create the data directory (the SQLite file is created on first run):

```bash
mkdir -p data
```

> **Note:** You can keep the Docker `DATABASE_URL` from `.env.example` unchanged for local dev. The backend detects `/app/data/` and writes to `<repo>/data/finance.db` instead.

### 2. Install backend dependencies

From the **repository root**:

```bash
uv sync
```

This reads `pyproject.toml` and creates/updates `.venv`. To include test dependencies:

```bash
uv sync --group dev
```

> **Alternative (pip):** `cd backend && python -m venv .venv`, activate it, then `pip install -r requirements.txt`.

### 3. Apply database migrations (recommended)

```bash
cd backend
uv run alembic upgrade head
cd ..
```

On first startup the app also calls `create_all`, but Alembic is the source of truth for schema changes. See [`backend/ALEMBIC_GUIDE.md`](backend/ALEMBIC_GUIDE.md) for migration workflows.

### 4. Start the backend (terminal 1)

```bash
cd backend
uv run python main.py
```

With `DEBUG=true`, uvicorn reloads on code changes. The API listens on `http://localhost:8223`.

Verify: open http://localhost:8223/health — you should see `{"status":"healthy",...}`.

**Windows PowerShell** (if you need to override the port for one session):

```powershell
cd backend
$env:BACKEND_PORT = "8223"
uv run python main.py
```

### 5. Build and serve the frontend (terminal 2)

```bash
cd frontend
npm install
npm run build:css          # compile Tailwind → public/assets/css/app.css
npm run sync:runtime-config # write BACKEND_PORT into js/runtime-config.js
```

Serve the static site from `frontend/public`:

```bash
cd public
python -m http.server 3100
```

Open http://localhost:3100 — register a user, then sign in.

**CSS watch mode** (optional, while editing styles):

```bash
cd frontend
npm run watch:css
```

Re-run `npm run sync:runtime-config` whenever you change `BACKEND_PORT` in `.env`.

### How the frontend finds the API

The API client in `frontend/public/js/api.js` resolves the backend URL in this order:

1. `window.API_BASE_URL` (manual override)
2. `localStorage.backendUrl`
3. Same hostname as the page + port from `js/runtime-config.js` (`BACKEND_PORT` from `.env`)

For local dev, `npm run sync:runtime-config` keeps the port in sync. You only need a manual override when the API runs on a different host:

```html
<script>window.API_BASE_URL = 'http://localhost:8223/api';</script>
```

### Run backend tests

From the repository root (requires `uv sync --group dev`):

```bash
uv run pytest backend/tests -v
```

### Local dev checklist

| Step | Command | Expected result |
|------|---------|-----------------|
| Health | `curl http://localhost:8223/health` | `"status":"healthy"` |
| Frontend | http://localhost:3100 | Login / register page |
| API docs | http://localhost:8223/docs | Interactive Swagger UI |
| Reports | http://localhost:3100/pages/reports.html | Tabbed reports with charts |

### Troubleshooting (local dev)

| Problem | Fix |
|---------|-----|
| `unable to open database file` on startup | Ensure `./data` exists (`mkdir data`). The backend auto-remaps Docker's `/app/data/` path to `./data/finance.db` locally. |
| Frontend can't reach API | Run `npm run sync:runtime-config`; confirm `BACKEND_PORT` in `.env` matches the running backend |
| CORS errors | Set `CORS_ORIGINS=["*"]` in `.env` or include `http://localhost:3100` |
| Database locked | Only run one backend process; SQLite uses WAL mode but concurrent writers still conflict |
| Stale CSS | Re-run `npm run build:css` after editing `frontend/build/css/input.css` |
| Charts look broken after pull | Hard-refresh the browser (Ctrl+Shift+R) to bust cached `echarts-theme.js` |

---

## Quick start with Docker

### Prerequisites

- Docker
- Docker Compose

### Running

```bash
cp .env.example .env
# Edit SECRET_KEY and other values as needed

docker compose up --build
```

| URL | |
|-----|---|
| Frontend | http://localhost:3100 |
| API | http://localhost:8223 |
| Docs | http://localhost:8223/docs |

### Docker commands

```bash
docker compose up --build      # build and start
docker compose up -d           # detached
docker compose logs -f         # follow logs
docker compose down            # stop
docker compose down -v         # stop and remove volumes (deletes DB)
```

### Data persistence (Docker)

The SQLite database and uploaded documents live in the bind-mounted `./data` folder:

```
data/
├── finance.db
└── documents/
```

Logs are written to `./logs/`.

---

## Configuration

Environment variables (set in repo-root `.env`):

| Variable | Description | Default (local) |
|----------|-------------|-----------------|
| `SECRET_KEY` | JWT signing key | *(must change in production)* |
| `DATABASE_URL` | SQLAlchemy database URL | `sqlite:///./finance.db` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `1440` (1 day) |
| `DEBUG` | Enable uvicorn auto-reload | `false` |
| `CORS_ORIGINS` | Allowed origins (JSON array) | `["*"]` |
| `BACKEND_PORT` | API listen port | `8223` |
| `FRONTEND_PORT` | Used for CORS + runtime config | `3100` |
| `LOG_DIR` | Application log directory | `./logs` |

---

## API overview

All routes are prefixed with `/api`. Full interactive documentation: http://localhost:8223/docs

| Area | Examples |
|------|----------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` |
| Core | `/api/accounts`, `/api/transactions`, `/api/categories`, `/api/budgets` |
| Reports | `/api/reports/cashflow`, `/api/reports/net-worth`, `/api/reports/export` |
| Import | `POST /api/import-wizard/upload` |
| Debts & goals | `/api/debts`, `/api/goals` |
| Advisor | `/api/advisor/*` |

Report JSON contracts:

- Series reports: `{ "labels": string[], "series": [{ "name", "data" }] }`
- Single-value reports: `{ "labels": string[], "data": number[] }`

---

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy models
│   │   ├── routers/         # FastAPI route modules
│   │   ├── schemas/         # Pydantic request/response models
│   │   └── services/        # Business logic
│   ├── alembic/             # Database migrations
│   ├── tests/               # pytest suite
│   └── main.py              # ASGI entry point
├── frontend/
│   ├── build/css/           # Tailwind input
│   ├── public/              # Static site root (serve this in dev)
│   │   ├── index.html       # Login
│   │   ├── pages/           # App pages
│   │   └── js/              # Vanilla JS modules + ECharts theme
│   └── package.json         # CSS build scripts only
├── data/                    # SQLite DB + documents (gitignored)
├── logs/                    # Application logs (gitignored)
├── docs/                    # Design docs and implementation plans
├── pyproject.toml           # Python deps (uv / pip)
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## Related docs

- [`backend/ALEMBIC_GUIDE.md`](backend/ALEMBIC_GUIDE.md) — database migrations
- [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) — historical schema/data migration notes
- [`docs/superpowers/`](docs/superpowers/) — feature design and implementation plans

## License

ISC
