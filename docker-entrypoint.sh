#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/backend
alembic upgrade head

echo "Starting application..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
