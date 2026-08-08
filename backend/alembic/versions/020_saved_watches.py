"""add saved_watches table

Revision ID: 020
Revises: 019
Create Date: 2026-08-08

"""

import sqlalchemy as sa
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "saved_watches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("last_price", sa.Float(), nullable=True),
        sa.Column("day_change_pct", sa.Float(), nullable=True),
        sa.Column("last_updated", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "symbol", name="uq_saved_watch_user_symbol"),
    )
    op.create_index(op.f("ix_saved_watches_id"), "saved_watches", ["id"], unique=False)
    op.create_index(op.f("ix_saved_watches_user_id"), "saved_watches", ["user_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_saved_watches_user_id"), table_name="saved_watches")
    op.drop_index(op.f("ix_saved_watches_id"), table_name="saved_watches")
    op.drop_table("saved_watches")
