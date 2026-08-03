"""add transaction transfer retag fields

Revision ID: 015
Revises: 014
Create Date: 2026-08-03

"""

import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "transactions",
        sa.Column("paired_transaction_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("transfer_direction", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("original_type", sa.String(length=20), nullable=True),
    )
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.create_foreign_key(
            "fk_transactions_paired_transaction_id",
            "transactions",
            ["paired_transaction_id"],
            ["id"],
        )


def downgrade():
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint(
            "fk_transactions_paired_transaction_id", type_="foreignkey"
        )
    op.drop_column("transactions", "original_type")
    op.drop_column("transactions", "transfer_direction")
    op.drop_column("transactions", "paired_transaction_id")
