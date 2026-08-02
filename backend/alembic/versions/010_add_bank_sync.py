"""add bank connections, linked-account columns and transaction external_id

Enable Banking (PSD2) account sync. See app/services/bank_sync_service.py.

Revision ID: 010
Revises: 009
Create Date: 2026-08-02

"""

import sqlalchemy as sa
from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "bank_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("aspsp_name", sa.String(100), nullable=False),
        sa.Column("aspsp_country", sa.String(2), nullable=False),
        sa.Column("session_id_encrypted", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("state", sa.String(64), nullable=True),
        sa.Column("state_expires_at", sa.DateTime(), nullable=True),
        sa.Column("state_used_at", sa.DateTime(), nullable=True),
        sa.Column("consent_valid_until", sa.DateTime(), nullable=True),
        sa.Column("expiry_notified_at", sa.DateTime(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column("last_sync_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state"),
    )
    op.create_index("ix_bank_connections_id", "bank_connections", ["id"])
    op.create_index("ix_bank_connections_user_id", "bank_connections", ["user_id"])
    op.create_index("ix_bank_connections_state", "bank_connections", ["state"])

    # Linked-account columns. server_default must be a constant literal: older
    # SQLite (the 3.40 in the python:3.11-slim base image) rejects expressions
    # as an ALTER TABLE ADD COLUMN default, and that failure would only surface
    # on deployment — see the note in 009.
    op.add_column(
        "accounts", sa.Column("bank_connection_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "accounts", sa.Column("external_account_id", sa.String(255), nullable=True)
    )
    op.add_column(
        "accounts",
        sa.Column("is_linked", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column("accounts", sa.Column("last_synced_at", sa.DateTime(), nullable=True))
    op.add_column("accounts", sa.Column("sync_status", sa.String(20), nullable=True))

    # No FK constraint on accounts.bank_connection_id: SQLite cannot add one via
    # ALTER TABLE, so it would need a full batch table rebuild for a nullable
    # pointer the application already guards. The ORM relationship still works.

    op.add_column("transactions", sa.Column("external_id", sa.String(255), nullable=True))
    # Dedup key for synced transactions. Existing rows all have external_id
    # NULL, and SQLite treats NULLs as distinct in a unique index, so this is
    # safe to add to a populated table.
    op.create_index(
        "uq_transactions_user_external",
        "transactions",
        ["user_id", "external_id"],
        unique=True,
    )


def downgrade():
    op.drop_index("uq_transactions_user_external", table_name="transactions")
    op.drop_column("transactions", "external_id")

    op.drop_column("accounts", "sync_status")
    op.drop_column("accounts", "last_synced_at")
    op.drop_column("accounts", "is_linked")
    op.drop_column("accounts", "external_account_id")
    op.drop_column("accounts", "bank_connection_id")

    op.drop_index("ix_bank_connections_state", table_name="bank_connections")
    op.drop_index("ix_bank_connections_user_id", table_name="bank_connections")
    op.drop_index("ix_bank_connections_id", table_name="bank_connections")
    op.drop_table("bank_connections")
