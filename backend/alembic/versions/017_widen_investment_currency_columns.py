"""widen investment currency columns for crypto quote assets (e.g. USDT)

Revision ID: 017
Revises: 016
Create Date: 2026-08-06

"""

import sqlalchemy as sa
from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("portfolio_positions") as batch_op:
        batch_op.alter_column(
            "currency", existing_type=sa.String(length=3), type_=sa.String(length=10)
        )
    with op.batch_alter_table("portfolio_snapshots") as batch_op:
        batch_op.alter_column(
            "currency", existing_type=sa.String(length=3), type_=sa.String(length=10)
        )
    with op.batch_alter_table("investment_transactions") as batch_op:
        batch_op.alter_column(
            "currency", existing_type=sa.String(length=3), type_=sa.String(length=10)
        )


def downgrade():
    with op.batch_alter_table("portfolio_positions") as batch_op:
        batch_op.alter_column(
            "currency", existing_type=sa.String(length=10), type_=sa.String(length=3)
        )
    with op.batch_alter_table("portfolio_snapshots") as batch_op:
        batch_op.alter_column(
            "currency", existing_type=sa.String(length=10), type_=sa.String(length=3)
        )
    with op.batch_alter_table("investment_transactions") as batch_op:
        batch_op.alter_column(
            "currency", existing_type=sa.String(length=10), type_=sa.String(length=3)
        )
