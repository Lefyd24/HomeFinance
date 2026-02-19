**Production Migration & Deployment Guide**

This document describes a safe, repeatable process to migrate the database and deploy the app to production when your production database is currently at migration
[backend/alembic/versions/001_add_financial_goals.py](backend/alembic/versions/001_add_financial_goals.py). Follow these steps carefully and test in staging first.

**Prerequisites:**
- SSH or console access to production host
- DB admin credentials (or ability to take backups)
- Application repo at the commit to deploy
- `alembic` configured and migration scripts present in `backend/alembic/versions`
- A tested rollback plan and DB backups

**1. Plan & Inventory**
- Identify current production Alembic revision: run `alembic current` from the backend repo or inside the prod container.
- Confirm production is at revision `001` (or the revision id matching [backend/alembic/versions/001_add_financial_goals.py](backend/alembic/versions/001_add_financial_goals.py)).
- List pending migrations in your dev branch: `alembic history --verbose` and inspect new files under `backend/alembic/versions`.

**2. Backup production database (MANDATORY)**
- Postgres example:

    pg_dump -h <host> -U <user> -Fc -f prod-backup-$(date +%F).dump <dbname>

- SQLite example: copy the file:

    cp /path/to/production.db /path/to/backup/production-$(date +%F).db

- Verify backups are restorable and store them off-host if possible.

**3. Review migration scripts for destructive changes**
- Inspect each migration file that will run (those after `001`) for operations like `DROP COLUMN`, `ALTER TYPE`, or long-running `ALTER TABLE` on large tables.
- If a migration is destructive, create a plan: convert to non-blocking steps (add new column, backfill, switch reads/writes, then drop old column in a later migration).

**4. Stage / Local dry-run**
- Pull production schema into a staging DB (or replicate prod to staging). Restore the backup into staging and run the migrations there.
- From the backend folder, run:

    source .venv/bin/activate  # or appropriate venv activation on prod/staging
    alembic upgrade head

- Run the app and smoke tests against staging. Run `pytest` or basic API checks.

**5. Deployment strategy (zero/low downtime)**
- Preferred: run migrations in an isolated step before switching traffic to the new code.
- If using containers (docker-compose):
  1. Build images locally: `docker build -t myapp/backend:release-<tag> -f backend/Dockerfile backend`
  2. Push images to registry.
  3. On prod host: `docker pull myapp/backend:release-<tag>` then `docker-compose up -d` to update containers.
  4. Run migrations in the updated container (see next step).
- If using systemd or a process manager: deploy code, keep old app running, and run migrations while traffic is still served (if safe). Prefer maintenance mode for risky migrations.

**6. Run migrations in production**
- Enter maintenance/read-only mode if required (block background jobs, API writes).
- From the backend code directory on prod (or inside the backend container) run:

    source .venv/bin/activate
    alembic upgrade head

- If using Docker Compose:

    docker-compose run --rm backend alembic upgrade head

- Watch output for errors. If a migration fails, stop and follow the rollback plan (see below).

**7. Post-migration deployment & service restart**
- If you applied migrations before swapping code, now deploy the new application code and restart services:

    # systemd example
    sudo systemctl restart myapp-backend

    # docker-compose example
    docker-compose up -d --no-deps --build backend

- Restart background workers (Celery, schedulers) after the database is migrated.

**8. Verify**
- Run quick smoke tests: authenticate requests, create a small transaction, and exercise features that depend on new schema.
- Check that Alembic reports the new head: `alembic current`.
- Inspect the DB schema (describe tables) and any new columns/indexes.

**9. Monitoring & Rollback**
- Monitor logs and error rates for 10–30 minutes after deploy.
- If a migration caused issues and you need to rollback:
  - Restore DB from the backup taken in step 2.
  - Redeploy the previous application code that matches the restored schema.
  - Note: `alembic downgrade <rev>` is possible for reversible migrations, but restoring from backup is safest when data-loss or complex changes occurred.

**10. Tips & recommendations**
- Always test migrations on a staging copy of production first.
- Keep migrations small and incremental; avoid big, destructive changes in a single revision.
- Add non-blocking strategies for large tables (add column + backfill + switch).
- Ensure your `alembic.ini` uses the same DB URL on production, or run with `-x` overrides if needed.
- If using CI/CD, gate the deploy on successful migration run in a staging environment.

**Quick checklist (copyable)**

1. Take DB backup
2. Pull branch and build artifacts
3. Run migrations on staging (verify)
4. Put prod into maintenance (if necessary)
5. Run `alembic upgrade head` on prod
6. Deploy app and restart services
7. Run smoke tests and monitor

If you want, I can also:
- produce a one-liner to run migrations inside your Docker setup,
- or generate a small systemd service example for `uvicorn`+`gunicorn` deployments.

---
File: [backend/alembic/versions/001_add_financial_goals.py](backend/alembic/versions/001_add_financial_goals.py)
