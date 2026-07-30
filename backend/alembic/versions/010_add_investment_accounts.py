"""add investment account support (Freedom24 and future brokers)

Revision ID: 010
Create Date: 2026-07-30

"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("accounts", sa.Column("provider", sa.String(50), nullable=True))
    op.add_column("accounts", sa.Column("last_synced_at", sa.DateTime(), nullable=True))

    op.create_table(
        "investment_credentials",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False, unique=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("encrypted_public_key", sa.Text(), nullable=False),
        sa.Column("encrypted_private_key", sa.Text(), nullable=False),
        sa.Column("sync_status", sa.String(20), server_default="pending"),
        sa.Column("sync_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "portfolio_positions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("symbol", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("avg_price", sa.Float(), nullable=True),
        sa.Column("current_price", sa.Float(), nullable=True),
        sa.Column("market_value", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD"),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "portfolio_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("total_value", sa.Float(), nullable=False),
        sa.Column("cash_balance", sa.Float(), server_default="0"),
        sa.Column("currency", sa.String(3), server_default="USD"),
        sa.UniqueConstraint("account_id", "date", name="uq_portfolio_snapshot_account_date"),
    )

    op.create_table(
        "investment_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("symbol", sa.String(50), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD"),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("raw_payload", sa.Text(), nullable=True),
        sa.UniqueConstraint("account_id", "external_id", name="uq_investment_txn_account_external"),
    )


def downgrade():
    op.drop_table("investment_transactions")
    op.drop_table("portfolio_snapshots")
    op.drop_table("portfolio_positions")
    op.drop_table("investment_credentials")
    op.drop_column("accounts", "last_synced_at")
    op.drop_column("accounts", "provider")
