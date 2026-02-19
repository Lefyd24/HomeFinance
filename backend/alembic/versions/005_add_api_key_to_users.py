"""add api_key to users

Revision ID: 005
Create Date: 2026-02-19

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    # Add api_key column to users table (without unique constraint for SQLite compatibility)
    op.add_column("users", sa.Column("api_key", sa.String(255), nullable=True))

    # Create unique index on api_key
    op.create_index("ix_users_api_key", "users", ["api_key"], unique=True)


def downgrade():
    # Drop the index
    op.drop_index("ix_users_api_key", table_name="users")

    # Drop the column
    op.drop_column("users", "api_key")
