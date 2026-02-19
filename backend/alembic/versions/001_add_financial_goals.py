"""add financial goals tables

Revision ID: 001
Create Date: 2026-02-19

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "financial_goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("target_amount", sa.Float(), nullable=False),
        sa.Column("current_amount", sa.Float(), server_default="0"),
        sa.Column("currency", sa.String(3), server_default="EUR"),
        sa.Column("category", sa.String(50)),
        sa.Column("icon", sa.String(50)),
        sa.Column("color", sa.String(7)),
        sa.Column("target_date", sa.Date()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime()),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("is_primary", sa.Boolean(), server_default="0"),
        sa.Column("linked_budget_id", sa.Integer()),
        sa.Column("linked_account_id", sa.Integer()),
        sa.Column("auto_track_from_account", sa.Boolean(), server_default="0"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["linked_budget_id"], ["budgets.id"]),
        sa.ForeignKeyConstraint(["linked_account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "goal_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("goal_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer()),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["goal_id"], ["financial_goals.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_financial_goals_user_id", "financial_goals", ["user_id"])
    op.create_index("ix_goal_transactions_goal_id", "goal_transactions", ["goal_id"])


def downgrade():
    op.drop_index("ix_goal_transactions_goal_id", table_name="goal_transactions")
    op.drop_index("ix_financial_goals_user_id", table_name="financial_goals")
    op.drop_table("goal_transactions")
    op.drop_table("financial_goals")
