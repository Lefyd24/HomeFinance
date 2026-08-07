from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class BenchmarkOption(BaseModel):
    symbol: str
    label: str


class SharpeSchema(BaseModel):
    value: float
    ci_low: float
    ci_high: float
    n: int


class DrawdownSchema(BaseModel):
    depth: float
    peak_date: Optional[date] = None
    trough_date: Optional[date] = None
    recovery_date: Optional[date] = None
    days_under_water: Optional[int] = None


class PerformanceBlock(BaseModel):
    cumulative_return: Optional[float] = None
    cagr: Optional[float] = None
    best_month: Optional[float] = None
    worst_month: Optional[float] = None
    rolling_1y_win_rate_vs_benchmark: Optional[float] = None
    worst_rolling_1y: Optional[float] = None


class RiskBlock(BaseModel):
    volatility: Optional[float] = None
    max_drawdown: Optional[DrawdownSchema] = None
    ulcer_index: Optional[float] = None
    var95: Optional[float] = None
    cvar95: Optional[float] = None
    mvar95: Optional[float] = None
    skew: Optional[float] = None
    excess_kurtosis: Optional[float] = None
    jarque_bera_p: Optional[float] = None


class RiskAdjustedBlock(BaseModel):
    sharpe: Optional[SharpeSchema] = None
    sortino: Optional[float] = None
    calmar: Optional[float] = None
    martin: Optional[float] = None
    omega_curve: Optional[list[list[float]]] = None
    psr_vs_zero: Optional[float] = None


class VsBenchmarkBlock(BaseModel):
    beta: Optional[float] = None
    beta_ci: Optional[list[float]] = None
    r_squared: Optional[float] = None
    downside_beta: Optional[float] = None
    alpha_annual: Optional[float] = None
    alpha_tstat: Optional[float] = None
    alpha_pvalue: Optional[float] = None
    tracking_error: Optional[float] = None
    information_ratio: Optional[float] = None
    up_capture: Optional[float] = None
    down_capture: Optional[float] = None
    downside_correlation: Optional[float] = None


class ValuationBlock(BaseModel):
    kind: str  # "stock" | "fund" | "crypto" | "index"
    fields: dict[str, Optional[float | str]] = Field(default_factory=dict)
    sources: dict[str, str] = Field(default_factory=dict)


class StressEpisode(BaseModel):
    label: str
    start: date
    end: date
    return_: Optional[float] = Field(None, alias="return")
    max_drawdown: Optional[float] = None

    class Config:
        populate_by_name = True


class InstrumentComparison(BaseModel):
    symbol: str
    name: Optional[str] = None
    quote_type: Optional[str] = None
    currency: Optional[str] = None
    fx_applied: bool = False
    total_return: bool = True
    is_benchmark: bool = False
    # Latest adjusted close in `currency`, as of `meta.end` — the "what does it cost
    # right now" fact next to the return figures, not itself a return.
    last_price: Optional[float] = None
    warnings: list[str] = Field(default_factory=list)
    performance: PerformanceBlock
    risk: RiskBlock
    risk_adjusted: RiskAdjustedBlock
    vs_benchmark: VsBenchmarkBlock
    valuation: ValuationBlock
    stress: list[StressEpisode] = Field(default_factory=list)


class PairwiseBlock(BaseModel):
    correlation: dict[str, float] = Field(default_factory=dict)
    rolling_correlation: dict[str, list[dict[str, float | str]]] = Field(default_factory=dict)
    diversification_ratio: Optional[float] = None
    overlap: Optional[dict[str, float]] = None


class HeadToHead(BaseModel):
    leader: str
    runner_up: str
    psr_leader_vs_runner_up: Optional[float] = None
    verdict_key: str


class ComparisonMeta(BaseModel):
    period: str
    start: date
    end: date
    aligned_days: int
    currency: str
    series_frequency: str
    risk_free_annual: float
    risk_free_source: str
    benchmark_symbol: Optional[str] = None
    alignment_note: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    generated_at: datetime


class SeriesBlock(BaseModel):
    normalized: list[dict] = Field(default_factory=list)
    drawdown: list[dict] = Field(default_factory=list)


class ComparisonResponse(BaseModel):
    meta: ComparisonMeta
    instruments: list[InstrumentComparison]
    pairwise: PairwiseBlock
    head_to_head: Optional[HeadToHead] = None
    series: SeriesBlock


class SavedComparisonCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    symbols: list[str] = Field(..., min_length=2, max_length=5)
    benchmark: Optional[str] = None
    period: str = "3y"


class SavedComparisonResponse(BaseModel):
    id: int
    name: str
    symbols: list[str]
    benchmark: Optional[str] = None
    period: str
    created_at: datetime

    class Config:
        from_attributes = True
