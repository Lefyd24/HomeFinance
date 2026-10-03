# Database migrations

Home Finance uses [Alembic](https://alembic.sqlalchemy.org) to version the SQLite schema. Migrations live in `backend/alembic/versions/` and run **automatically** when the container starts, so most users never touch them.

## How it works at startup

`docker-entrypoint.sh` runs from `/app/backend` and decides based on the database:

| Database state | What happens |
|---|---|
| No `alembic_version` table (a brand-new database) | Creates all tables from the models, then runs `alembic stamp head` |
| Has `alembic_version` | Runs `alembic upgrade head` |

Then `supervisord` starts the app. If a migration fails, the container exits and restarts, so check `docker compose logs app`.

**Always back up before updating.** See [Operations](operations.md#backups).

## Everyday commands

Run from `backend/` on a bare-metal install (`uv run alembic ...`), or inside the container:

```bash
docker compose exec app sh -c 'cd /app/backend && alembic current'
```

| Command | Purpose |
|---|---|
| `alembic current` | Show the revision the database is at |
| `alembic history` | List all revisions |
| `alembic upgrade head` | Apply all pending migrations |
| `alembic upgrade <rev>` | Migrate up to a specific revision |
| `alembic downgrade -1` | Undo the most recent migration |
| `alembic downgrade <rev>` | Roll back to a specific revision |
| `alembic stamp <rev>` | Record a revision **without** running anything |

The database URL comes from `DATABASE_URL`, falling back to the application settings. The value in `alembic.ini` is overridden.

## Rolling back an update

1. Stop the app: `docker compose down`.
2. Restore the pre-update backup over `data/finance.db` (see [Restoring](operations.md#restoring)).
3. Go back to the previous version. With the published image, set `PF_IMAGE_TAG=<previous version>` in `.env` and run `docker compose pull`. When building from source, check out the previous tag with `git checkout <tag>` instead.
4. `docker compose up -d` (add `--build` when building from source).

Restoring a backup is safer than `alembic downgrade`, because downgrades can drop data that the newer schema stored.

## Creating a migration (developers)

1. Change the SQLAlchemy models in `backend/app/models/`, and import any new model in `backend/app/models/__init__.py` so Alembic sees it.
2. Generate a revision:

   ```bash
   cd backend
   uv run alembic revision --autogenerate -m "describe the change"
   ```

3. **Read the generated file.** Autogenerate misses some changes (renames appear as drop plus add) and SQLite has limited `ALTER TABLE` support. Use `op.batch_alter_table(...)` for column changes on existing tables.
4. Test on a copy of real data:

   ```bash
   cp ../data/finance.db /tmp/test.db
   DATABASE_URL=sqlite:////tmp/test.db uv run alembic upgrade head
   DATABASE_URL=sqlite:////tmp/test.db uv run alembic downgrade -1
   DATABASE_URL=sqlite:////tmp/test.db uv run alembic upgrade head
   ```

5. Run the test suite: `uv run pytest backend/tests -v`.

Rules:

- **Never edit a migration that has already been applied** anywhere. Add a new one.
- Keep each migration small and reversible when feasible.
- Give new non-null columns a server default so existing rows stay valid.

## Recovering a database

### "no such column" or "no such table" after an update

The schema is behind the code. Check the revision, then upgrade:

```bash
docker compose exec app sh -c 'cd /app/backend && alembic current && alembic upgrade head'
```

### A database created before Alembic was introduced

The entrypoint would treat a database without `alembic_version` as new and stamp it as current, which can leave missing columns. For such a database, stamp it to the revision that matches its actual schema **before** starting the container, then upgrade:

```bash
cd backend
uv run alembic stamp <revision-matching-your-schema>
uv run alembic upgrade head
```

Pick the revision by comparing your tables and columns with the files in `backend/alembic/versions/`. When in doubt, open an issue and include the output of `sqlite3 data/finance.db .schema`.

### "table already exists" restart loop

This happens if tables were created without a version record. Stamp the database to the matching revision as above, or restore from a backup.

## Revision history

Revisions are numbered `001` onward, with one hash-named revision (`e7a884b96b62`, custom debt types). Run `alembic history` for the authoritative list.
