"""add investor_profiles and investor_profile_revisions tables

Revision ID: 022
Revises: 021
Create Date: 2026-08-17

The subject of AI investment advice — risk tolerance, horizon, constraints —
plus a field-level revision log, because the advisor itself can write to the
profile and such a change has to stay visible and reversible.
"""

import sqlalchemy as sa
from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "investor_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("risk_tolerance", sa.String(length=20), nullable=True),
        sa.Column("primary_objective", sa.String(length=20), nullable=True),
        sa.Column("horizon_years", sa.Integer(), nullable=True),
        sa.Column("liquidity_needs_months", sa.Integer(), nullable=True),
        sa.Column("target_allocation", sa.Text(), nullable=True),
        sa.Column("max_single_position_pct", sa.Float(), nullable=True),
        sa.Column("excluded_sectors", sa.Text(), nullable=True),
        sa.Column("excluded_symbols", sa.Text(), nullable=True),
        sa.Column("income_stability", sa.String(length=20), nullable=True),
        sa.Column("experience_level", sa.String(length=20), nullable=True),
        sa.Column("base_currency", sa.String(length=10), nullable=True),
        sa.Column("tax_residency", sa.String(length=2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.String(length=10), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_investor_profile_user"),
    )
    op.create_index(op.f("ix_investor_profiles_id"), "investor_profiles", ["id"], unique=False)
    op.create_index(
        "ix_investor_profiles_user_id", "investor_profiles", ["user_id"], unique=False
    )

    op.create_table(
        "investor_profile_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=False),
        sa.Column("field", sa.String(length=50), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=10), nullable=False, server_default="user"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("undone_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["profile_id"], ["investor_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_investor_profile_revisions_id"), "investor_profile_revisions", ["id"], unique=False
    )
    op.create_index(
        "ix_investor_profile_revisions_profile_id",
        "investor_profile_revisions",
        ["profile_id"],
        unique=False,
    )
    op.create_index(
        "ix_investor_profile_revisions_created_at",
        "investor_profile_revisions",
        ["created_at"],
        unique=False,
    )


def downgrade():
    op.drop_index(
        "ix_investor_profile_revisions_created_at", table_name="investor_profile_revisions"
    )
    op.drop_index(
        "ix_investor_profile_revisions_profile_id", table_name="investor_profile_revisions"
    )
    op.drop_index(
        op.f("ix_investor_profile_revisions_id"), table_name="investor_profile_revisions"
    )
    op.drop_table("investor_profile_revisions")

    op.drop_index("ix_investor_profiles_user_id", table_name="investor_profiles")
    op.drop_index(op.f("ix_investor_profiles_id"), table_name="investor_profiles")
    op.drop_table("investor_profiles")
