#!/bin/sh
set -e

cd /app/backend

echo "Creating all database tables from models..."
python -c "
import sys
sys.path.insert(0, '/app/backend')
from app.database import init_db
init_db()
print('Database tables created successfully!')
"

echo "Stamping database with latest Alembic revision..."
alembic stamp head

echo "Starting application..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
