import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def test_init_db_creates_tables_when_only_app_database_is_imported(tmp_path):
    """The Docker entrypoint imports nothing but app.database before init_db().

    Regression: with no model imports the metadata was empty, so a fresh
    install got an empty database that was then stamped as migrated. This must
    run in a fresh interpreter because the test process has models imported.
    """
    db_file = tmp_path / "fresh.db"
    script = textwrap.dedent(
        """
        import sys
        sys.path.insert(0, %r)
        from app.database import init_db, engine
        from sqlalchemy import inspect
        init_db()
        tables = set(inspect(engine).get_table_names())
        missing = {"users", "accounts", "transactions"} - tables
        assert not missing, f"init_db created no schema, missing {missing}"
        """
        % str(BACKEND)
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        env={
            "PATH": "/usr/bin:/bin",
            "DEBUG": "true",
            "DATABASE_URL": f"sqlite:///{db_file}",
            "NOTIFICATIONS_ENABLED": "false",
        },
        capture_output=True,
        text=True,
        cwd=str(BACKEND),
    )
    assert result.returncode == 0, result.stderr[-2000:]
