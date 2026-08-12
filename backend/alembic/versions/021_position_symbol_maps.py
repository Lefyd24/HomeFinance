"""add position_symbol_maps table

Revision ID: 021
Revises: 020
Create Date: 2026-08-12

A user-chosen Yahoo ticker for a broker symbol, so a wrong heuristic match can
be corrected from the holding page. Its own table rather than a column on
portfolio_positions, whose rows are replaced wholesale on every sync.
"""

import sqlalchemy as sa
from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "position_symbol_maps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("broker_symbol", sa.String(length=50), nullable=False),
        sa.Column("yahoo_symbol", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account_id", "broker_symbol", name="uq_position_symbol_map_account_symbol"
        ),
    )
    op.create_index(
        op.f("ix_position_symbol_maps_id"), "position_symbol_maps", ["id"], unique=False
    )
    op.create_index(
        "ix_position_symbol_maps_account_id",
        "position_symbol_maps",
        ["account_id"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_position_symbol_maps_account_id", table_name="position_symbol_maps")
    op.drop_index(op.f("ix_position_symbol_maps_id"), table_name="position_symbol_maps")
    op.drop_table("position_symbol_maps")
