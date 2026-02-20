# Alembic Migration Guide for Personal Finance App

## Overview

This guide explains how to use Alembic for database migrations in your Personal Finance application. Alembic is a database migration tool for SQLAlchemy that helps you version and manage database schema changes.

## Project Structure

Your alembic setup is located in `backend/alembic/`:
```
backend/
├── alembic/
│   ├── env.py              # Migration environment configuration
│   ├── script.py.mako      # Migration template
│   └── versions/           # Migration files
│       ├── 001_add_financial_goals.py
│       ├── 002_add_insights.py
│       ├── 003_add_debt_tracking.py
│       ├── 004_add_debt_recurrence_fields.py
│       └── 005_add_api_key_to_users.py
└── alembic.ini             # Alembic configuration
```

## Configuration

### alembic.ini
Your configuration file (`backend/alembic.ini`) specifies:
- **Database URL**: `sqlite:///./finance.db` (SQLite database in the backend directory)
- **Script location**: `%(here)s/alembic` (relative to the ini file)
- **Version locations**: `%(here)s/alembic/versions`

### env.py
The environment file (`backend/alembic/env.py`) imports your SQLAlchemy models and configures:
- Database connection (supports `DATABASE_URL` environment variable override)
- Target metadata from your `Base` class
- All your model classes for autogeneration

## Basic Commands

### Check Current Status
```bash
cd backend
alembic current
```
Shows the current revision applied to your database.

### View Migration History
```bash
cd backend
alembic history
```
Shows all available migrations and their status.

### Create a New Migration
```bash
cd backend
alembic revision -m "description of changes"
```

This creates a new migration file with empty `upgrade()` and `downgrade()` functions.

### Auto-generate Migration
```bash
cd backend
alembic revision --autogenerate -m "description of changes"
```

This analyzes your SQLAlchemy models and automatically generates migration code for schema changes. **Note**: Always review auto-generated migrations before applying them.

### Apply Migrations
```bash
cd backend
alembic upgrade head
```

Upgrades your database to the latest migration (head).

### Upgrade to Specific Revision
```bash
cd backend
alembic upgrade <revision_id>
```

Upgrades to a specific revision (e.g., `alembic upgrade 003`).

### Rollback Migrations
```bash
cd backend
alembic downgrade -1
```

Rolls back one migration. Use specific revision IDs for more control:
```bash
cd backend
alembic downgrade <revision_id>
```

## Migration Workflow

### 1. Make Model Changes
Modify your SQLAlchemy models in `backend/app/models/`.

### 2. Generate Migration
```bash
cd backend
alembic revision --autogenerate -m "add new feature"
```

### 3. Review Migration
Always check the generated migration file in `backend/alembic/versions/`:
- Verify the upgrade() function contains the correct changes
- Ensure the downgrade() function properly reverses changes
- Test the migration on a copy of your database first

### 4. Apply Migration
```bash
cd backend
alembic upgrade head
```

### 5. Commit Changes
Commit both the model changes and the migration file to version control.

## Manual Migration Example

If you need to write a migration manually (when autogeneration isn't sufficient):

```python
"""add example column

Revision ID: 006
Create Date: 2026-02-20

"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("users", sa.Column("example_column", sa.String(100), nullable=True))

def downgrade():
    op.drop_column("users", "example_column")
```

## Best Practices

### 1. Always Test Migrations
- Test upgrades and downgrades on a copy of production data
- Use a separate test database for migration testing

### 2. Review Auto-generated Migrations
- Autogeneration is helpful but not perfect
- Always review and potentially modify the generated code

### 3. Use Descriptive Messages
```bash
alembic revision --autogenerate -m "add user preferences table"
```

### 4. Keep Migrations Small
- Each migration should represent one logical change
- Avoid large migrations that do many things at once

### 5. Don't Modify Existing Migrations
- Once a migration is applied in production, don't modify it
- Create a new migration to fix issues

### 6. Version Control
- Commit migration files along with model changes
- Never commit migration files without testing them

## Common Issues and Solutions

### SQLite Limitations
- SQLite doesn't support some operations like `ALTER TABLE` with constraints
- Use workarounds like creating new tables and migrating data

### Foreign Key Constraints
- Ensure proper order when adding/dropping tables with relationships
- Add foreign keys after creating referenced tables

### Data Migrations
For migrations that need to modify data:
```python
def upgrade():
    # Schema changes first
    op.add_column("users", sa.Column("new_field", sa.String(50)))

    # Then data updates
    op.execute("UPDATE users SET new_field = 'default_value' WHERE new_field IS NULL")
```

## Environment Variables

You can override the database URL using the `DATABASE_URL` environment variable:
```bash
export DATABASE_URL="postgresql://user:pass@localhost/finance"
cd backend
alembic upgrade head
```

## Troubleshooting

### Migration Fails
1. Check the database connection
2. Verify the migration syntax
3. Ensure the database isn't locked (SQLite)
4. Check for foreign key violations

### Inconsistent State
If your database gets out of sync:
```bash
cd backend
alembic stamp head  # Mark current state as head (dangerous!)
```

**Warning**: Only use `stamp` as a last resort on development databases.

## Integration with Application

Your migrations are integrated with your FastAPI application through:
- Shared models in `app/models/`
- Database connection in `app/database.py`
- Environment configuration in `env.py`

Make sure your application uses the same database URL as configured in `alembic.ini` or set via `DATABASE_URL`.

## Recent Migration Applied

The migration `005_add_api_key_to_users.py` has been successfully applied, which:
- Added an `api_key` column to the `users` table
- Created a unique index on the `api_key` column
- Supports nullable values for backward compatibility