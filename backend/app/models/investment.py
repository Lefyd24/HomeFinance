from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Text,
    DateTime,
    Date,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class InvestmentCredential(Base):
    """API keys for a brokerage-synced Account, one row per account.

    Keys are stored encrypted (app.utils.crypto) and are never returned by any
    API response — only re-entered (PUT .../credentials) or rotated, never read back.
    """
    __tablename__ = "investment_credentials"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), unique=True, nullable=False)
    provider = Column(String(50), nullable=False)
    encrypted_public_key = Column(Text, nullable=False)
    encrypted_private_key = Column(Text, nullable=False)
    sync_status = Column(String(20), default="pending")  # pending, ok, error
    sync_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = relationship("Account", back_populates="investment_credential")


class PortfolioPosition(Base):
    """Current holdings for a brokerage-synced account.

    Replaced wholesale (delete-then-insert) on every sync — always reflects
    the latest known snapshot, no per-position history.

    Prices, `market_value` and `cost_basis` are in the instrument's own
    `currency`; the `*_base` columns restate them in the account's currency so
    account-level totals never sum across currencies. `fx_rate` is the rate
    that was used, kept so a stale total can be explained after the fact.
    """
    __tablename__ = "portfolio_positions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    symbol = Column(String(50), nullable=False)
    name = Column(String(200), nullable=True)
    quantity = Column(Float, nullable=False)
    avg_price = Column(Float, nullable=True)
    current_price = Column(Float, nullable=True)
    market_value = Column(Float, nullable=False)
    currency = Column(String(3), default="USD")
    cost_basis = Column(Float, nullable=True)
    fx_rate = Column(Float, default=1.0)
    market_value_base = Column(Float, nullable=True)
    cost_basis_base = Column(Float, nullable=True)
    day_change = Column(Float, nullable=True)
    day_change_pct = Column(Float, nullable=True)
    exchange = Column(String(20), nullable=True)
    synced_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="portfolio_positions")


class PortfolioSnapshot(Base):
    """One row per account per sync day — powers the value-over-time chart.

    Account.balance itself has no history (mutated in place like every other
    account), so this is the only place portfolio value over time is recorded.
    """
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (UniqueConstraint("account_id", "date", name="uq_portfolio_snapshot_account_date"),)

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    date = Column(Date, nullable=False)
    total_value = Column(Float, nullable=False)
    cash_balance = Column(Float, default=0)
    positions_value = Column(Float, default=0)
    currency = Column(String(3), default="USD")

    account = relationship("Account", back_populates="portfolio_snapshots")


class InvestmentTransaction(Base):
    """Broker-reported activity (trades, dividends, fees, cash movements).

    Kept separate from the app's own `Transaction` table — brokerage activity
    doesn't fit the income/expense/transfer/category model that table uses.
    Unique on (account_id, external_id) so re-syncing is idempotent.
    """
    __tablename__ = "investment_transactions"
    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="uq_investment_txn_account_external"),
    )

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    external_id = Column(String(100), nullable=False)
    # buy, sell, fx, dividend, fee, deposit, withdrawal, tax. `amount` is signed
    # from the account's perspective: negative when cash leaves (buy, fee),
    # positive when it arrives (sell, dividend).
    type = Column(String(20), nullable=False)
    symbol = Column(String(50), nullable=True)
    quantity = Column(Float, nullable=True)
    price = Column(Float, nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(3), default="USD")
    date = Column(DateTime, nullable=False)
    raw_payload = Column(Text, nullable=True)

    account = relationship("Account", back_populates="investment_transactions")
