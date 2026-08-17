from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class InvestorProfileUpdate(BaseModel):
    """Every field optional — the settings form saves partially and the AI
    advisor updates one field at a time. Validation of values themselves lives in
    `services/investor_profile_service._validate`, so the REST path and the agent
    path cannot drift apart."""

    risk_tolerance: Optional[str] = None
    primary_objective: Optional[str] = None
    horizon_years: Optional[int] = None
    liquidity_needs_months: Optional[int] = None
    target_allocation: Optional[Dict[str, float]] = None
    max_single_position_pct: Optional[float] = None
    excluded_sectors: Optional[List[str]] = None
    excluded_symbols: Optional[List[str]] = None
    income_stability: Optional[str] = None
    experience_level: Optional[str] = None
    base_currency: Optional[str] = None
    tax_residency: Optional[str] = None
    notes: Optional[str] = None


class InvestorProfileResponse(BaseModel):
    is_set: bool
    is_stale: bool
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

    risk_tolerance: Optional[str] = None
    primary_objective: Optional[str] = None
    horizon_years: Optional[int] = None
    liquidity_needs_months: Optional[int] = None
    target_allocation: Optional[Dict[str, float]] = None
    max_single_position_pct: Optional[float] = None
    excluded_sectors: Optional[List[str]] = None
    excluded_symbols: Optional[List[str]] = None
    income_stability: Optional[str] = None
    experience_level: Optional[str] = None
    base_currency: Optional[str] = None
    tax_residency: Optional[str] = None
    notes: Optional[str] = None


class InvestorProfileRevisionResponse(BaseModel):
    id: int
    field: str
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    source: str
    reason: Optional[str] = None
    undone_at: Optional[str] = None
    created_at: Optional[str] = None


class InvestorProfileOptions(BaseModel):
    """Allowed enum values, so the settings form and the API cannot disagree."""

    risk_tolerances: List[str]
    primary_objectives: List[str]
    income_stabilities: List[str]
    experience_levels: List[str]
    allocation_classes: List[str]
    editable_fields: List[str]
