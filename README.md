# Personal Finance Management System

A full-stack personal finance application with a FastAPI backend and vanilla JavaScript frontend.

## Features

- 📊 Dashboard with financial overview
- 💰 Transaction management
- 📁 Bank import wizard (CSV/Excel)
- 🎯 Budget tracking
- 🏦 Account management
- 📑 Category management
- 📈 Reports and analytics
- 🔐 JWT authentication
- 📱 PWA support

## Architecture

- **Frontend**: Static HTML5 + Tailwind CSS + DaisyUI + Vanilla JavaScript
- **Backend**: FastAPI (Python) with SQLite database
- **Authentication**: JWT tokens
- **Build**: Single container running both services on different ports

## Ports

- **Frontend**: http://localhost:3100
- **Backend API**: http://localhost:8223
- **API Documentation**: http://localhost:8223/docs

## Quick Start with Docker

### Prerequisites

- Docker
- Docker Compose

### Running the Application

1. **Clone the repository** (if not already done)

2. **Set up environment variables** (optional but recommended):
   ```bash
   cp .env.example .env
   # Edit .env and update SECRET_KEY to a secure value
   ```

3. **Build and run**:
   ```bash
   docker compose up --build
   ```

4. **Access the application**:
   - Frontend: http://localhost:3100
   - API: http://localhost:8223
   - API documentation: http://localhost:8223/docs
   - Health check: http://localhost:8223/health

### Docker Commands

```bash
# Build and start
docker compose up --build

# Run in detached mode
docker compose up -d

# View logs
docker compose logs -f

# Stop the application
docker compose down

# Stop and remove volumes (WARNING: deletes database)
docker compose down -v
```

### Data Persistence

The SQLite database is stored in a Docker volume mounted at `./data`. This ensures your data persists between container restarts.

```
./data/
└── finance.db
```

## Development Setup (without Docker)

### Backend

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server on port 8223
export BACKEND_PORT=8223
python main.py
```

The API will be available at http://localhost:8223

### Frontend

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Build CSS
npm run build:css

# Watch CSS for changes (development)
npm run watch:css
```

Serve the `frontend/public` directory with any static file server:

```bash
cd frontend/public
python -m http.server 3100
```

Then open http://localhost:3100

**Important**: When running locally, make sure the frontend knows where the backend is. The API client checks for `window.API_BASE_URL` or defaults to `http://localhost:8223/api`. You can set this in your HTML:

```javascript
<script>window.API_BASE_URL = 'http://localhost:8223/api';</script>
```

## API Endpoints

All API endpoints are prefixed with `/api`:

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/accounts` - List accounts
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- `GET /api/categories` - List categories
- `GET /api/budgets` - List budgets
- `GET /api/reports` - Generate reports
- `POST /api/import-wizard/upload` - Upload bank files

Full API documentation available at http://localhost:8223/docs when running the application.

## Configuration

Environment variables (can be set in `.env` file):

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | `your-secret-key-change-in-production` |
| `DATABASE_URL` | SQLite database path | `sqlite:////app/data/finance.db` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT token expiry | `30` |
| `DEBUG` | Debug mode | `false` |
| `CORS_ORIGINS` | Allowed CORS origins | `["*"]` |
| `BACKEND_PORT` | Backend server port | `8223` |
| `FRONTEND_PORT` | Frontend server port | `3100` |

## Project Structure

```
.
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── models/         # SQLAlchemy models
│   │   ├── routers/        # API endpoints
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/       # Business logic
│   ├── main.py             # Application entry point
│   └── requirements.txt    # Python dependencies
├── frontend/               # Static frontend
│   ├── build/              # Build configuration
│   └── public/             # Static files (entry point)
│       ├── index.html      # Login page
│       ├── pages/          # HTML pages
│       ├── js/             # JavaScript modules
│       └── assets/         # CSS and icons
├── data/                   # SQLite database (Docker volume)
├── Dockerfile              # Multi-stage build
├── docker-compose.yml      # Docker orchestration
├── supervisord.conf        # Process manager config
└── .env.example            # Environment template
```

## License

ISC
