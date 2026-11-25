"""investment_credentials.history_version: rebuild reconstructed history

Revision ID: 028
Revises: 027
Create Date: 2026-11-25

Records which version of the portfolio-history reconstruction an account's
snapshots were built with. When the reconstruction is fixed, the sync bumps
past it once and rebuilds the account's history instead of keeping a curve
built by the broken one.
"""

import sqlalchemy as sa
from alembic import op

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("investment_credentials") as batch:
        batch.add_column(
            sa.Column("history_version", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade():
    with op.batch_alter_table("investment_credentials") as batch:
        batch.drop_column("history_version")
