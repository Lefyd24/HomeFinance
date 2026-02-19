# Database Migration Guide - v2.0

This guide explains how to handle database migrations when deploying this version to production.

## Summary of Changes

This version removes the **Spending Predictions** feature, which includes:
- `spending_predictions` table (removed from migrations)
- `SpendingPrediction` model (removed from code)
- Related API endpoints and frontend components

## Migration Scenarios

### Scenario 1: Fresh Installation (New Production Server)

If this is a **new deployment** with no existing database:

```bash
# Navigate to backend directory
cd backend

# Run migrations
alembic upgrade head

# The database will be created WITHOUT the spending_predictions table
```

### Scenario 2: Existing Installation (Upgrading Production)

If you have an **existing production database** that was created with a previous version:

#### Step 1: Check if spending_predictions table exists

```bash
# For SQLite
sqlite3 your_database.db ".tables" | grep spending_predictions

# For PostgreSQL
psql -U your_user -d your_database -c "\dt spending_predictions"
```

#### Step 2: Drop the spending_predictions table (if it exists)

**For SQLite:**
```sql
-- Connect to your database
sqlite3 your_database.db

-- Drop the table
DROP TABLE IF EXISTS spending_predictions;

-- Exit
.exit
```

**For PostgreSQL:**
```sql
-- Connect to your database
psql -U your_user -d your_database

-- Drop the indexes first (if they exist)
DROP INDEX IF EXISTS ix_spending_predictions_prediction_for_month;
DROP INDEX IF EXISTS ix_spending_predictions_user_id;

-- Drop the table
DROP TABLE IF EXISTS spending_predictions;

-- Exit
\q
```

#### Step 3: Verify migration status

```bash
cd backend

# Check current migration version
alembic current

# If needed, stamp the current version
alembic stamp head
```

### Scenario 3: Using Alembic Downgrade/Upgrade (Recommended)

If you want to use Alembic to handle the migration automatically:

#### Create a new migration to drop the table:

```bash
cd backend

# Create a new migration
alembic revision -m "remove_spending_predictions"
```

#### Edit the generated file (in `alembic/versions/`):

```python
"""remove spending predictions

Revision ID: 003
Revises: 002
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # Drop indexes
    op.drop_index('ix_spending_predictions_prediction_for_month', table_name='spending_predictions')
    op.drop_index('ix_spending_predictions_user_id', table_name='spending_predictions')
    
    # Drop table
    op.drop_table('spending_predictions')


def downgrade():
    # This would recreate the table if needed
    # Not necessary unless you plan to rollback
    pass
```

#### Run the migration:

```bash
alembic upgrade head
```

## Quick Reference Commands

```bash
# Check current migration status
alembic current

# View migration history
alembic history

# Apply all pending migrations
alembic upgrade head

# Rollback one migration (use with caution)
alembic downgrade -1

# Stamp database to specific version (without running migrations)
alembic stamp head
```

## Post-Migration Verification

After running migrations, verify everything is working:

1. **Check tables exist:**
   ```bash
   # SQLite
   sqlite3 your_database.db ".tables"
   
   # Should show: users, accounts, categories, transactions, budgets, 
   # budget_categories, user_insights, spending_patterns, etc.
   # Should NOT show: spending_predictions
   ```

2. **Test the API:**
   ```bash
   # Start the server
   cd backend
   uvicorn app.main:app --reload
   
   # Test endpoints
   curl http://localhost:8000/api/insights/summary
   curl http://localhost:8000/api/insights/trends/analysis
   curl http://localhost:8000/api/insights/statistics
   ```

3. **Check the frontend:**
   - Navigate to the Insights page
   - Verify Trend Analysis & Statistics card loads correctly
   - Ensure no errors in browser console

## Rollback Plan

If something goes wrong, you can restore the `spending_predictions` table:

```sql
-- For SQLite
CREATE TABLE spending_predictions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    prediction_type VARCHAR(50) NOT NULL,
    category_id INTEGER,
    predicted_amount FLOAT NOT NULL,
    confidence_lower FLOAT,
    confidence_upper FLOAT,
    confidence_level FLOAT,
    prediction_for_month DATE NOT NULL,
    prediction_for_period VARCHAR(20),
    actual_amount FLOAT,
    accuracy_percentage FLOAT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE INDEX ix_spending_predictions_user_id ON spending_predictions(user_id);
CREATE INDEX ix_spending_predictions_prediction_for_month ON spending_predictions(prediction_for_month);
```

## Notes

- **Backup your database** before running any migrations
- The `spending_predictions` table was used for forecasting future spending
- No user data is lost by removing this table (predictions were generated, not user-inputted)
- All other functionality (insights, patterns, trends, statistics) remains intact
