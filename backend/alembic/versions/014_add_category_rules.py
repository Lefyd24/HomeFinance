"""add category_rules and category_rule_conditions

Revision ID: 014
Revises: 013
Create Date: 2026-08-02

"""

import sqlalchemy as sa
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "category_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("match_type", sa.String(length=10), nullable=False, server_default="all"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("stop_on_match", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("times_applied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_applied_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_category_rules_id", "category_rules", ["id"])
    op.create_index("ix_category_rules_user_id", "category_rules", ["user_id"])

    op.create_table(
        "category_rule_conditions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("field", sa.String(length=40), nullable=False),
        sa.Column("operator", sa.String(length=40), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("value_to", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["rule_id"], ["category_rules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_category_rule_conditions_id", "category_rule_conditions", ["id"])
    op.create_index("ix_category_rule_conditions_rule_id", "category_rule_conditions", ["rule_id"])


def downgrade():
    op.drop_index("ix_category_rule_conditions_rule_id", table_name="category_rule_conditions")
    op.drop_index("ix_category_rule_conditions_id", table_name="category_rule_conditions")
    op.drop_table("category_rule_conditions")
    op.drop_index("ix_category_rules_user_id", table_name="category_rules")
    op.drop_index("ix_category_rules_id", table_name="category_rules")
    op.drop_table("category_rules")
