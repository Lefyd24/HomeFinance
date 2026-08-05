"""add trackers and tracker-transaction links

Revision ID: 016
Revises: 015
Create Date: 2026-08-05

"""

import sqlalchemy as sa
from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trackers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("target_amount", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("icon", sa.String(length=50), nullable=True),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trackers_id"), "trackers", ["id"], unique=False)

    op.create_table(
        "tracker_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tracker_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["tracker_id"], ["trackers.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tracker_id", "transaction_id", name="uq_tracker_transactions_pair"
        ),
    )
    op.create_index(
        op.f("ix_tracker_transactions_id"), "tracker_transactions", ["id"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_tracker_transactions_id"), table_name="tracker_transactions")
    op.drop_table("tracker_transactions")
    op.drop_index(op.f("ix_trackers_id"), table_name="trackers")
    op.drop_table("trackers")
