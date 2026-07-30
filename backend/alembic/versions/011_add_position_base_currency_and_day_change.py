"""add base-currency, cost-basis and day-change columns to synced positions

A portfolio can hold instruments priced in several currencies at once. Before
this, positions were stored only in the instrument's own currency, so any
account-level total added unlike currencies together. The `*_base` columns hold
each figure restated in the account's own currency (converted during the sync
from the broker's own rates), and `fx_rate` records the rate used so a total can
be explained after the fact.

`cost_basis` is stored rather than derived from quantity * avg_price because for
bonds the broker quotes price as a percentage of face value — the broker's own
book value for the position is the correct figure.

`day_change`/`day_change_pct` come from the broker's quote feed, and
`positions_value` splits a snapshot into invested vs. cash.

Revision ID: 011
Create Date: 2026-07-30

"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


# (name, column) pairs, so upgrade and downgrade can't drift apart.
POSITION_COLUMNS = [
    ("cost_basis", sa.Column("cost_basis", sa.Float(), nullable=True)),
    ("fx_rate", sa.Column("fx_rate", sa.Float(), server_default="1")),
    ("market_value_base", sa.Column("market_value_base", sa.Float(), nullable=True)),
    ("cost_basis_base", sa.Column("cost_basis_base", sa.Float(), nullable=True)),
    ("day_change", sa.Column("day_change", sa.Float(), nullable=True)),
    ("day_change_pct", sa.Column("day_change_pct", sa.Float(), nullable=True)),
    ("exchange", sa.Column("exchange", sa.String(20), nullable=True)),
]

SNAPSHOT_COLUMNS = [
    ("positions_value", sa.Column("positions_value", sa.Float(), server_default="0")),
]


def upgrade():
    for _, column in POSITION_COLUMNS:
        op.add_column("portfolio_positions", column)
    for _, column in SNAPSHOT_COLUMNS:
        op.add_column("portfolio_snapshots", column)

    # Existing rows have no stored cost basis. Backfill it from what is already
    # there so returns are right on the first page load, before the next sync —
    # single-currency accounts are the common case, so base == native here.
    op.execute(
        """
        UPDATE portfolio_positions
           SET cost_basis = avg_price * quantity,
               cost_basis_base = avg_price * quantity,
               market_value_base = market_value,
               fx_rate = 1
         WHERE avg_price IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE portfolio_positions
           SET market_value_base = market_value,
               fx_rate = 1
         WHERE avg_price IS NULL
        """
    )
    op.execute("UPDATE portfolio_snapshots SET positions_value = 0 WHERE positions_value IS NULL")


def downgrade():
    for name, _ in SNAPSHOT_COLUMNS:
        op.drop_column("portfolio_snapshots", name)
    for name, _ in POSITION_COLUMNS:
        op.drop_column("portfolio_positions", name)
