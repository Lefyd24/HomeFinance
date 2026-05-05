#!/bin/sh
set -e

cd /app/backend

echo "Checking database state..."
DB_STATE=$(python -c "
import sys
sys.path.insert(0, '/app/backend')
from sqlalchemy import create_engine, inspect, text
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
inspector = inspect(engine)
tables = inspector.get_table_names()

if 'alembic_version' not in tables:
    print('new')
else:
    # Detect schema/alembic mismatch: alembic says head but columns are missing
    if 'debts' in tables:
        cols = [c['name'] for c in inspector.get_columns('debts')]
        if 'custom_type' not in cols:
            import sys as _sys
            _sys.stderr.write('Schema mismatch: custom_type missing - resetting alembic version to 005\n')
            with engine.connect() as conn:
                conn.execute(text(\"UPDATE alembic_version SET version_num = '005'\"))
                conn.commit()
    print('existing')
")

if [ "\$DB_STATE" = "new" ]; then
    echo "New database detected - creating all tables from models..."
    python -c "
import sys
sys.path.insert(0, '/app/backend')
from app.database import init_db
init_db()
print('All tables created!')
"
    echo "Stamping alembic at head (no migrations needed for fresh DB)..."
    alembic stamp head
else
    echo "Existing database detected - applying any pending migrations..."
    alembic upgrade head
fi

echo "Starting application..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
