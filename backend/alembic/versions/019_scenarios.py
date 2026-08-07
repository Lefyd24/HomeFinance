"""backtesting/forward scenario sandbox

Revision ID: 019
Revises: 018
Create Date: 2026-08-07

"""

import sqlalchemy as sa
from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scenarios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("initial_amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("contribution_amount", sa.Float(), nullable=True),
        sa.Column("contribution_freq", sa.String(length=12), nullable=True),
        sa.Column("benchmark", sa.String(length=50), nullable=True),
        sa.Column("cost_bps", sa.Float(), nullable=True),
        sa.Column("cost_flat", sa.Float(), nullable=True),
        sa.Column("dividend_treatment", sa.String(length=12), nullable=True),
        sa.Column("dividend_withholding_pct", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("consecutive_error_days", sa.Integer(), nullable=True),
        sa.Column("last_valued_on", sa.Date(), nullable=True),
        sa.Column("last_value", sa.Float(), nullable=True),
        sa.Column("last_return_pct", sa.Float(), nullable=True),
        sa.Column("last_benchmark_return_pct", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scenarios_id"), "scenarios", ["id"], unique=False)
    op.create_index(op.f("ix_scenarios_user_id"), "scenarios", ["user_id"], unique=False)

    op.create_table(
        "scenario_valuations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scenario_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("invested", sa.Float(), nullable=False),
        sa.Column("benchmark_value", sa.Float(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scenario_id", "date", name="uq_scenario_valuation"),
    )
    op.create_index(
        op.f("ix_scenario_valuations_id"), "scenario_valuations", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_scenario_valuations_scenario_id"),
        "scenario_valuations",
        ["scenario_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(
        op.f("ix_scenario_valuations_scenario_id"), table_name="scenario_valuations"
    )
    op.drop_index(op.f("ix_scenario_valuations_id"), table_name="scenario_valuations")
    op.drop_table("scenario_valuations")
    op.drop_index(op.f("ix_scenarios_user_id"), table_name="scenarios")
    op.drop_index(op.f("ix_scenarios_id"), table_name="scenarios")
    op.drop_table("scenarios")
