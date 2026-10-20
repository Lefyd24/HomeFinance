"""transaction_reimbursements table

Revision ID: 025
Revises: 024
Create Date: 2026-10-19

Links an expense the user paid in full to the incoming transactions in which
others paid them back, so linked amounts can be left out of income/expense
totals.
"""

import sqlalchemy as sa
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "transaction_reimbursements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expense_id", sa.Integer(), nullable=False),
        sa.Column("income_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["expense_id"], ["transactions.id"]),
        sa.ForeignKeyConstraint(["income_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transaction_reimbursements_user_id", "transaction_reimbursements", ["user_id"])
    op.create_index("ix_transaction_reimbursements_expense_id", "transaction_reimbursements", ["expense_id"])
    op.create_index("ix_transaction_reimbursements_income_id", "transaction_reimbursements", ["income_id"])


def downgrade():
    op.drop_table("transaction_reimbursements")
