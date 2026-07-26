"""add invite codes, user tokens, admin/session/verification columns on users

Revision ID: 009
Revises: 008
Create Date: 2026-07-26

"""

import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("used_by_user_id", sa.Integer(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["used_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash"),
    )
    op.create_index("ix_invite_codes_id", "invite_codes", ["id"])
    op.create_index("ix_invite_codes_code_hash", "invite_codes", ["code_hash"])

    op.create_table(
        "user_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_user_tokens_id", "user_tokens", ["id"])
    op.create_index("ix_user_tokens_user_id", "user_tokens", ["user_id"])
    op.create_index("ix_user_tokens_token_hash", "user_tokens", ["token_hash"])

    op.add_column(
        "users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="0")
    )
    # Grandfather every existing user in as verified — the migration must not
    # lock out anyone who signed up before this feature existed.
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default="1"),
    )
    # Backfill existing rows with the epoch, not now(): every already-issued
    # JWT has an `iat` later than this, so nobody is logged out purely by the
    # migration running. New users get `datetime.utcnow` from the model.
    #
    # The default MUST be a constant literal. Older SQLite (e.g. the 3.40 in
    # Debian bookworm, which the python:3.11-slim image is built on) rejects
    # CURRENT_TIMESTAMP or any expression as an ALTER TABLE ADD COLUMN default
    # — newer SQLite accepts it, so this fails only on deployment, after the
    # two columns above have already been added.
    op.add_column(
        "users",
        sa.Column(
            "sessions_valid_from",
            sa.DateTime(),
            nullable=False,
            server_default="1970-01-01 00:00:00",
        ),
    )


def downgrade():
    op.drop_column("users", "sessions_valid_from")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "is_admin")

    op.drop_index("ix_user_tokens_token_hash", table_name="user_tokens")
    op.drop_index("ix_user_tokens_user_id", table_name="user_tokens")
    op.drop_index("ix_user_tokens_id", table_name="user_tokens")
    op.drop_table("user_tokens")

    op.drop_index("ix_invite_codes_code_hash", table_name="invite_codes")
    op.drop_index("ix_invite_codes_id", table_name="invite_codes")
    op.drop_table("invite_codes")
