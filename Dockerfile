# Multi-stage Dockerfile for Personal Finance App
# Runs backend on port 8223 and frontend on port 3100

# Stage 1: Build frontend CSS
FROM node:20-alpine AS frontend-builder

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

# Stage 2: Python application with both frontend and backend
FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies including supervisord
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY backend/requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy frontend files from builder
COPY --from=frontend-builder /app/frontend/public ./frontend/public

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Copy supervisord configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV DATABASE_URL=sqlite:///data/finance.db
ENV SECRET_KEY=your-secret-key-change-in-production
ENV DEBUG=false
ENV CORS_ORIGINS='["*"]'
ENV BACKEND_PORT=8223
ENV FRONTEND_PORT=3100

# Expose both ports
EXPOSE 8223 3100

# Start supervisord to manage both processes
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
