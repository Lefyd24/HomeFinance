"""investment_provider_settings: per-user broker fee schedules

Revision ID: 027
Revises: 026
Create Date: 2026-10-30

Commission and deposit/withdrawal fees applied to the performance breakdown
when the broker data does not report them. Null means "not configured".
"""

import sqlalchemy as sa
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "investment_provider_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("commission_fixed", sa.Float(), nullable=True),
        sa.Column("commission_pct", sa.Float(), nullable=True),
        sa.Column("deposit_fee_fixed", sa.Float(), nullable=True),
        sa.Column("deposit_fee_pct", sa.Float(), nullable=True),
        sa.Column("withdrawal_fee_fixed", sa.Float(), nullable=True),
        sa.Column("withdrawal_fee_pct", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("user_id", "provider", name="uq_investment_provider_settings_user_provider"),
    )
    op.create_index(
        "ix_investment_provider_settings_id", "investment_provider_settings", ["id"]
    )


def downgrade():
    op.drop_index("ix_investment_provider_settings_id", table_name="investment_provider_settings")
    op.drop_table("investment_provider_settings")
