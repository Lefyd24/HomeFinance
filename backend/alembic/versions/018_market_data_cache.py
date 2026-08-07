"""market data cache and saved ticker comparisons

Revision ID: 018
Revises: 017
Create Date: 2026-08-07

"""

import sqlalchemy as sa
from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "market_price_bars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("open", sa.Float(), nullable=False),
        sa.Column("high", sa.Float(), nullable=False),
        sa.Column("low", sa.Float(), nullable=False),
        sa.Column("close", sa.Float(), nullable=False),
        sa.Column("volume", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol", "date", name="uq_market_bar_symbol_date"),
    )
    op.create_index(
        "ix_market_bar_symbol_date", "market_price_bars", ["symbol", "date"], unique=False
    )

    op.create_table(
        "market_symbol_meta",
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("quote_type", sa.String(length=20), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("exchange", sa.String(length=30), nullable=True),
        sa.Column("periods_per_year", sa.Integer(), nullable=True),
        sa.Column("first_bar_date", sa.Date(), nullable=True),
        sa.Column("last_bar_date", sa.Date(), nullable=True),
        sa.Column("refreshed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("symbol"),
    )

    op.create_table(
        "saved_comparisons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("symbols", sa.Text(), nullable=False),
        sa.Column("benchmark", sa.String(length=50), nullable=True),
        sa.Column("period", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_saved_comparisons_id"), "saved_comparisons", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_saved_comparisons_user_id"), "saved_comparisons", ["user_id"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_saved_comparisons_user_id"), table_name="saved_comparisons")
    op.drop_index(op.f("ix_saved_comparisons_id"), table_name="saved_comparisons")
    op.drop_table("saved_comparisons")
    op.drop_table("market_symbol_meta")
    op.drop_index("ix_market_bar_symbol_date", table_name="market_price_bars")
    op.drop_table("market_price_bars")
