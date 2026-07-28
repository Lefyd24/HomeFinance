# Multi-stage Dockerfile for Personal Finance App
# BACKEND_PORT / FRONTEND_PORT default here; override via .env / docker compose at runtime

# Stage 1a: Build the React SPA (frontend/app) — this is the frontend served by
# default. `npm run build` is `tsc -b && vite build`, so a type error fails the
# image build rather than shipping a broken bundle.
#
# Node 22, not 20: vite 8 / rolldown declare engines "^20.19.0 || >=22.12.0",
# which the node:20 tag only barely satisfies at its newest patch. 22 also
# matches the Node the app is developed against.
FROM node:22-alpine AS react-builder

WORKDIR /app/frontend/app

COPY frontend/app/package*.json ./

RUN npm ci

COPY frontend/app ./

RUN npm run build

# Stage 1b: Build the legacy vanilla frontend's CSS. Kept only so the image can
# roll back to the old UI without a rebuild — see FRONTEND_DIR below. Delete this
# stage once the React cutover has soaked and frontend/public is removed.
FROM node:20-alpine AS legacy-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/build ./build

# Copy frontend public files (needed for CSS build reference)
COPY frontend/public ./public

# Build CSS
RUN npm run build:css

# Stage 2: Install Python dependencies with uv
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS python-builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    UV_PYTHON_DOWNLOADS=0

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project

# Stage 3: Python application with both frontend and backend
FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies including supervisord
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtualenv from uv builder
COPY --from=python-builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copy backend code
COPY backend/ ./backend/

# Copy both frontends. /app/frontend/public is the React build (served by
# default); /app/frontend/legacy is the old vanilla app, kept as a no-rebuild
# rollback target — set FRONTEND_DIR=/app/frontend/legacy in .env and
# `docker compose up -d` to switch back.
COPY --from=react-builder /app/frontend/app/dist ./frontend/public
COPY --from=legacy-builder /app/frontend/public ./frontend/legacy

# Create data + logs directories for bind mounts
RUN mkdir -p /app/data /app/logs

# Copy supervisord configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy entrypoint script (strip CR so Windows CRLF never breaks execve)
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Set environment variables
# SECRET_KEY and CORS_ORIGINS are intentionally NOT defaulted here — app/config.py
# refuses to start without a real SECRET_KEY (unless DEBUG=true), and same-origin
# deployments need no CORS_ORIGINS at all. Set both explicitly via .env / compose.
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV DATABASE_URL=sqlite:////app/data/finance.db
ENV DEBUG=false
ENV BACKEND_PORT=8223
ENV FRONTEND_PORT=3100
# Explicit rather than relying on config.py's directory probing. Override with
# /app/frontend/legacy to serve the old vanilla UI instead.
ENV FRONTEND_DIR=/app/frontend/public

# Frontend is served by the backend at BACKEND_PORT — only that port needs exposing.
EXPOSE 8223

# Start entrypoint script (runs migrations then supervisord)
CMD ["/app/docker-entrypoint.sh"]
