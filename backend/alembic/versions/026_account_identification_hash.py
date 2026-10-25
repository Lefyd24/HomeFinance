"""accounts.identification_hash for matching bank accounts across reconnects

Revision ID: 026
Revises: 025
Create Date: 2026-10-21

Enable Banking's account uid is only valid within one authorised session, so a
reconnect issues a new one. identification_hash is the key that stays stable.
"""

import sqlalchemy as sa
from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "accounts",
        sa.Column("identification_hash", sa.String(length=255), nullable=True),
    )


def downgrade():
    with op.batch_alter_table("accounts") as batch_op:
        batch_op.drop_column("identification_hash")
