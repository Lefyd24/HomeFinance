from datetime import date, datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Text,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Scenario(Base):
    """A saved hypothetical position — retrospective (backtest) or prospective (forward).

    Forward scenarios are revalued nightly by the scheduler; backtests are recomputed on
    read (cheap, and it keeps them correct when the price cache is corrected).

    The spec (everything but name/note/status) is immutable after creation — see
    docs/investments/02-backtesting-sandbox.md Part 4: a decision journal you can
    retroactively edit records nothing.
    """

    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    note = Column(Text, nullable=True)
    kind = Column(String(10), nullable=False)  # backtest | forward
    symbol = Column(String(50), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    initial_amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="EUR")
    contribution_amount = Column(Float, default=0.0)
    contribution_freq = Column(String(12), default="none")  # none|weekly|monthly|quarterly
    # No column-level default: `None` must stay `None` (SQLAlchemy applies a
    # Python-side default whenever the value is None, even if explicitly passed) —
    # the "^GSPC" default lives in the request schema (ScenarioSpecIn) instead.
    benchmark = Column(String(50), nullable=True)
    cost_bps = Column(Float, default=10.0)
    cost_flat = Column(Float, default=0.0)
    dividend_treatment = Column(String(12), default="reinvest")  # reinvest|cash|ignore
    dividend_withholding_pct = Column(Float, default=0.0)
    status = Column(String(12), default="active")  # active | closed | error
    last_error = Column(Text, nullable=True)
    consecutive_error_days = Column(Integer, default=0)
    # Denormalised for a fast library list — rewritten by the nightly tick.
    last_valued_on = Column(Date, nullable=True)
    last_value = Column(Float, nullable=True)
    last_return_pct = Column(Float, nullable=True)
    last_benchmark_return_pct = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    valuations = relationship(
        "ScenarioValuation",
        back_populates="scenario",
        cascade="all, delete-orphan",
        order_by="ScenarioValuation.date",
    )


class ScenarioValuation(Base):
    """One row per forward scenario per trading day. Backtests do not write here."""

    __tablename__ = "scenario_valuations"
    __table_args__ = (UniqueConstraint("scenario_id", "date", name="uq_scenario_valuation"),)

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(
        Integer, ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date = Column(Date, nullable=False)
    value = Column(Float, nullable=False)
    invested = Column(Float, nullable=False)
    benchmark_value = Column(Float, nullable=True)
    price = Column(Float, nullable=True)

    scenario = relationship("Scenario", back_populates="valuations")
