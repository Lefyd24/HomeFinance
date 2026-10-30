from datetime import date
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PerformancePoint(BaseModel):
    date: date
    value: float
    cash: float
    flow: float
    net_invested: float
    daily_return: Optional[float] = None
    twr: float
    benchmark: Optional[float] = None
    drawdown: float


class DayReturn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date: date
    return_: float = Field(alias="return")


class PerformanceSummary(BaseModel):
    start_value: float = 0.0
    end_value: float = 0.0
    net_flows: float = 0.0
    gain: float = 0.0
    twr: Optional[float] = None
    twr_annualized: Optional[float] = None
    mwr: Optional[float] = None
    volatility: Optional[float] = None
    max_drawdown: Optional[float] = None
    sharpe: Optional[float] = None
    best_day: Optional[DayReturn] = None
    worst_day: Optional[DayReturn] = None


class PerformanceBreakdown(BaseModel):
    unrealized: float = 0.0
    realized: float = 0.0
    dividends: float = 0.0
    taxes: float = 0.0
    fees: float = 0.0
    fees_estimated: float = 0.0
    fx_and_other: float = 0.0
    total_gain: float = 0.0
    net_invested: float = 0.0
    partial_history: bool = False


class PerformanceBenchmark(BaseModel):
    symbol: str
    twr: Optional[float] = None


class PerformanceResponse(BaseModel):
    currency: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    flows_source: str = "inferred"
    series: List[PerformancePoint] = []
    summary: PerformanceSummary = PerformanceSummary()
    breakdown: PerformanceBreakdown = PerformanceBreakdown()
    benchmark: Optional[PerformanceBenchmark] = None


class ProviderSettingsUpdate(BaseModel):
    commission_fixed: Optional[float] = Field(None, ge=0, le=1_000_000, allow_inf_nan=False)
    commission_pct: Optional[float] = Field(None, ge=0, le=100, allow_inf_nan=False)
    deposit_fee_fixed: Optional[float] = Field(None, ge=0, le=1_000_000, allow_inf_nan=False)
    deposit_fee_pct: Optional[float] = Field(None, ge=0, le=100, allow_inf_nan=False)
    withdrawal_fee_fixed: Optional[float] = Field(None, ge=0, le=1_000_000, allow_inf_nan=False)
    withdrawal_fee_pct: Optional[float] = Field(None, ge=0, le=100, allow_inf_nan=False)


class ProviderSettingsResponse(ProviderSettingsUpdate):
    model_config = ConfigDict(from_attributes=True)

    provider: str
