"""api_keys table, users.last_login_at

Revision ID: 024
Revises: 023
Create Date: 2026-10-05

Multiple named, hashed API keys per user (read/full scope), and a last-login
timestamp for the admin page. Existing plaintext users.api_key values are
hashed into a "Default key" row (full access, so current integrations keep
working) and then cleared.
"""

import hashlib
from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("key_prefix", sa.String(length=12), nullable=False),
        sa.Column("last_four", sa.String(length=4), nullable=False),
        sa.Column("scope", sa.String(length=10), nullable=False, server_default="read"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_api_keys_id", "api_keys", ["id"])
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)

    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("last_login_at", sa.DateTime(), nullable=True))

    # Backfill: hash each legacy plaintext key into the new table, then clear it.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, api_key FROM users WHERE api_key IS NOT NULL")
    ).fetchall()
    now = datetime.utcnow()
    for user_id, key in rows:
        conn.execute(
            sa.text(
                "INSERT INTO api_keys (user_id, name, key_hash, key_prefix, "
                "last_four, scope, created_at) VALUES (:u, 'Default key', :h, "
                ":p, :l, 'full', :c)"
            ),
            {
                "u": user_id,
                "h": hashlib.sha256(key.encode("utf-8")).hexdigest(),
                "p": key[:8],
                "l": key[-4:],
                "c": now,
            },
        )
    conn.execute(sa.text("UPDATE users SET api_key = NULL"))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_login_at")
    op.drop_index("ix_api_keys_key_hash", table_name="api_keys")
    op.drop_index("ix_api_keys_user_id", table_name="api_keys")
    op.drop_index("ix_api_keys_id", table_name="api_keys")
    op.drop_table("api_keys")
