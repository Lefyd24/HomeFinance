from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ScenarioSpecIn(BaseModel):
    symbol: str
    start_date: date
    end_date: Optional[date] = None
    initial_amount: float = Field(ge=0.0)
    currency: str = "EUR"
    contribution_amount: float = Field(default=0.0, ge=0.0)
    contribution_freq: str = "none"  # none|weekly|monthly|quarterly
    benchmark: Optional[str] = "^GSPC"
    cost_bps: float = Field(default=10.0, ge=0.0)
    cost_flat: float = Field(default=0.0, ge=0.0)
    dividend_treatment: str = "reinvest"  # reinvest|cash|ignore
    dividend_withholding_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    kind: str = "backtest"  # backtest|forward


class ScenarioCreate(ScenarioSpecIn):
    name: str = Field(..., min_length=1, max_length=120)
    note: Optional[str] = None


class ScenarioPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    note: Optional[str] = None
    status: Optional[str] = None  # active | closed


# --- Result blocks (mirror backend/app/services/backtest_service.py dataclasses) ---


class SpecResolvedSchema(BaseModel):
    resolved_start: date
    resolved_end: date
    start_note: Optional[str] = None
    end_note: Optional[str] = None
    trading_days: int
    fx_applied: bool
    data_gaps: list[dict] = Field(default_factory=list)
    stale_data: bool
    period_too_short: bool


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


class LegResultSchema(BaseModel):
    final_value: float
    total_invested: float
    profit: float
    total_return_pct: Optional[float] = None
    twr_cagr: Optional[float] = None
    mwr_irr: Optional[float] = None
    annualized_vol: Optional[float] = None
    sharpe: Optional[SharpeSchema] = None
    sortino: Optional[float] = None
    calmar: Optional[float] = None
    max_drawdown: Optional[DrawdownSchema] = None
    best_month: Optional[float] = None
    worst_month: Optional[float] = None
    cumulative_costs: float
    dividends_received: float
    hypothetical_exit_cost: float


class ComparisonSchema(BaseModel):
    excess_return_pct: Optional[float] = None
    excess_cagr: Optional[float] = None
    beat_benchmark: Optional[bool] = None
    rolling_1y_win_rate: Optional[float] = None
    worst_rolling_1y: Optional[float] = None
    alpha_annual: Optional[float] = None
    beta: Optional[float] = None
    r_squared: Optional[float] = None


class SensitivityEntry(BaseModel):
    date: date
    final_value: float
    return_pct: Optional[float] = None


class SensitivitySchema(BaseModel):
    entry_dates: list[SensitivityEntry]
    min: float
    p25: float
    median: float
    p75: float
    max: float
    chosen_percentile: float


class DeflatedSchema(BaseModel):
    n_trials: int
    expected_max_sharpe: Optional[float] = None
    sharpe: Optional[float] = None
    dsr: Optional[float] = None


class CostsSchema(BaseModel):
    cumulative: float
    pct_of_final_value: Optional[float] = None
    series: list[dict] = Field(default_factory=list)


class SeriesPoint(BaseModel):
    date: date
    value: float
    invested: float
    benchmark_value: Optional[float] = None
    drawdown: Optional[float] = None


class BacktestResultSchema(BaseModel):
    spec_resolved: SpecResolvedSchema
    scenario: LegResultSchema
    benchmark: Optional[LegResultSchema] = None
    comparison: Optional[ComparisonSchema] = None
    sensitivity: Optional[SensitivitySchema] = None
    deflated: Optional[DeflatedSchema] = None
    costs: CostsSchema
    series: list[SeriesPoint] = Field(default_factory=list)


class ScenarioSummary(BaseModel):
    id: int
    name: str
    kind: str
    symbol: str
    benchmark: Optional[str] = None
    currency: str
    start_date: date
    end_date: Optional[date] = None
    status: str
    last_error: Optional[str] = None
    last_valued_on: Optional[date] = None
    last_value: Optional[float] = None
    last_return_pct: Optional[float] = None
    last_benchmark_return_pct: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScenarioResponse(ScenarioSummary):
    note: Optional[str] = None
    initial_amount: float
    contribution_amount: float
    contribution_freq: str
    cost_bps: float
    cost_flat: float
    dividend_treatment: str
    dividend_withholding_pct: float


class ScenarioDetail(ScenarioResponse):
    result: Optional[BacktestResultSchema] = None
    sparkline: list[dict] = Field(default_factory=list)


class TrackRecord(BaseModel):
    count: int
    count_beating_benchmark: int
    hit_rate: Optional[float] = None
    mean_excess_return: Optional[float] = None
    median_excess_return: Optional[float] = None
    best: Optional[dict] = None
    worst: Optional[dict] = None
    hit_rate_p_value: Optional[float] = None
    verdict_key: str  # too_few | no_evidence_of_skill | some_evidence
    scenarios: list[dict] = Field(default_factory=list)
