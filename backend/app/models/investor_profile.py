"""The subject of investment advice: who this investor is and what constrains them.

Without a risk tolerance, a horizon and a set of constraints, "should I buy more
of X" has no correct answer — so the AI advisor reads this profile into its
system prompt on every turn and checks position-level suggestions against it.

The advisor can also *write* here (`ai_tools.update_investor_profile_tool`) when
the user states something in conversation that belongs in the profile. That is
why `InvestorProfileRevision` exists: the thing that governs all future advice
must not be mutable without a visible, reversible trail.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base

RISK_TOLERANCES = ("conservative", "moderate", "balanced", "growth", "aggressive")
PRIMARY_OBJECTIVES = ("preservation", "income", "balanced", "growth")
INCOME_STABILITIES = ("stable", "variable", "uncertain")
EXPERIENCE_LEVELS = ("beginner", "intermediate", "experienced")

#: Asset-class keys used by `target_allocation`. Percentages, expected to sum to ~100.
ALLOCATION_CLASSES = ("equity", "bond", "cash", "crypto", "other")


class InvestorProfile(Base):
    """One row per user. Absent means "not set" — the advisor must ask before
    giving allocation advice rather than assuming a default risk tolerance."""

    __tablename__ = "investor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)

    risk_tolerance = Column(String(20), nullable=True)      # RISK_TOLERANCES
    primary_objective = Column(String(20), nullable=True)   # PRIMARY_OBJECTIVES
    horizon_years = Column(Integer, nullable=True)
    liquidity_needs_months = Column(Integer, nullable=True)  # months of expenses to keep liquid

    # JSON text (SQLite): {"equity": 70, "bond": 20, "cash": 10, ...}
    target_allocation = Column(Text, nullable=True)
    max_single_position_pct = Column(Float, nullable=True)
    excluded_sectors = Column(Text, nullable=True)  # JSON list
    excluded_symbols = Column(Text, nullable=True)  # JSON list

    income_stability = Column(String(20), nullable=True)   # INCOME_STABILITIES
    experience_level = Column(String(20), nullable=True)   # EXPERIENCE_LEVELS
    base_currency = Column(String(10), nullable=True)
    tax_residency = Column(String(2), nullable=True, default="GR")
    notes = Column(Text, nullable=True)

    # "user" or "agent" — who last touched the profile, shown in the settings UI.
    updated_by = Column(String(10), nullable=False, default="user")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    revisions = relationship(
        "InvestorProfileRevision",
        back_populates="profile",
        cascade="all, delete-orphan",
        order_by="InvestorProfileRevision.created_at.desc()",
    )


class InvestorProfileRevision(Base):
    """Append-only field-level history of profile changes.

    One row per changed field per edit. `reason` carries the advisor's stated
    justification when `source == "agent"`, which is what makes an agent-made
    change reviewable — and, via the undo endpoint, reversible.
    """

    __tablename__ = "investor_profile_revisions"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(
        Integer, ForeignKey("investor_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field = Column(String(50), nullable=False)
    # Values are stored as text (JSON-encoded for the list/dict fields) so one
    # column can hold every field's type and an undo can restore it verbatim.
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    source = Column(String(10), nullable=False, default="user")  # user | agent
    reason = Column(Text, nullable=True)
    # Set when this revision has been undone, so an undo can't be replayed twice.
    undone_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    profile = relationship("InvestorProfile", back_populates="revisions")
