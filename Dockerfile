# Multi-stage Dockerfile for Personal Finance App
# BACKEND_PORT / FRONTEND_PORT default here; override via .env / docker compose at runtime

# Stage 1: Build the React SPA (frontend/app) — the only frontend.
# `npm run build` is `tsc -b && vite build`, so a type error fails the
# image build rather than shipping a broken bundle.
#
# Node 22, not 20: vite 8 / rolldown declare engines "^20.19.0 || >=22.12.0",
# which the node:20 tag only barely satisfies at its newest patch. 22 also
# matches the Node the app is developed against.
#
# --platform=$BUILDPLATFORM: the bundle is static JS and identical on every CPU, so
# build it natively on the CI runner. Under multi-arch builds the arm64 image would
# otherwise run npm ci + tsc + vite under QEMU emulation, which takes 30+ minutes.
FROM --platform=$BUILDPLATFORM node:26-alpine AS react-builder

WORKDIR /app/frontend/app

COPY frontend/app/package*.json ./

RUN npm ci

COPY frontend/app ./

RUN npm run build

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

# Runtime packages only: supervisord runs the app, curl backs the compose
# healthcheck. Python deps arrive prebuilt in the venv from python-builder, so
# no compiler or DB client headers belong in this image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtualenv from uv builder
COPY --from=python-builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copy backend code
COPY backend/ ./backend/

# Copy the built SPA. /app/frontend/public is what FRONTEND_DIR points at and
# what main.py serves statically at "/".
COPY --from=react-builder /app/frontend/app/dist ./frontend/public

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
# Explicit rather than relying on config.py's directory probing.
ENV FRONTEND_DIR=/app/frontend/public

# Frontend is served by the backend at BACKEND_PORT — only that port needs exposing.
EXPOSE 8223

# Start entrypoint script (runs migrations then supervisord)
CMD ["/app/docker-entrypoint.sh"]
