"""flag bank transactions the bank has not yet booked

Pending entries are ephemeral — see app/services/bank_sync_service.py, which
replaces the whole pending set for an account on every sync because their
identifiers are not stable across the pending -> booked transition.

Revision ID: 013
Revises: 012
Create Date: 2026-08-02

"""

import sqlalchemy as sa
from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    # server_default must be a constant literal — older SQLite (the 3.40 in the
    # python:3.11-slim base image) rejects expressions as an ALTER TABLE ADD
    # COLUMN default, and that only surfaces on deployment. See migration 009.
    op.add_column(
        "transactions",
        sa.Column("is_pending", sa.Boolean(), nullable=False, server_default="0"),
    )
    # Every existing row is booked or manual, which the "0" default already
    # covers — no backfill needed.


def downgrade():
    op.drop_column("transactions", "is_pending")
