"""
Pydantic schemas for Analytics API endpoints
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import date


class ForecastDataPoint(BaseModel):
    date: str
    predicted: float
    lower_bound: float
    upper_bound: float


class ForecastSummary(BaseModel):
    total_predicted: float
    average_daily: float
    forecast_days: int
    confidence_level: float
    model: str
    historical_monthly_avg: float
    predicted_monthly: float
    change_percentage: float


class SpendingForecastResponse(BaseModel):
    forecast: List[ForecastDataPoint]
    summary: ForecastSummary
    model_info: Optional[Dict[str, float]] = None
    fallback_reason: Optional[str] = None
    error: Optional[str] = None


class CategoryForecast(BaseModel):
    category: str
    historical_monthly_avg: float
    forecast_amount: float
    confidence: float


class CategoryForecastResponse(BaseModel):
    category_forecasts: List[CategoryForecast]
    total_forecast: float
    forecast_days: int


class SpendingClusterItem(BaseModel):
    category: str
    amount: float


class SpendingCluster(BaseModel):
    type: str
    categories: List[SpendingClusterItem]
    total: float
    percentage: float


class SpendingClustersResponse(BaseModel):
    clusters: List[SpendingCluster]
    total_spent: Optional[float] = None
    message: Optional[str] = None
    error: Optional[str] = None


class SpendingPersonaResponse(BaseModel):
    persona: str
    description: str
    confidence: float
    characteristics: List[str]
    features: Optional[Dict[str, Any]] = None


class CategoryPrediction(BaseModel):
    category: str
    probability: float


class CategoryPredictionResult(BaseModel):
    category: Optional[str]
    confidence: float
    alternatives: List[CategoryPrediction]
    error: Optional[str] = None


class UncategorizedSuggestion(BaseModel):
    transaction_id: int
    description: str
    amount: float
    date: str
    suggested_category: Optional[str]
    confidence: float
    alternatives: List[CategoryPrediction]


class BudgetBreakdown(BaseModel):
    amount: float
    percentage: float


class BudgetCategory(BaseModel):
    category: str
    amount: float


class BudgetRecommendation(BaseModel):
    type: str
    message: str
    amount: float
    priority: str
    categories: Optional[List[BudgetCategory]] = None


class SuggestedBudget(BaseModel):
    current: float
    suggested: float
    reduction: float


class BudgetOptimizationResponse(BaseModel):
    income_estimate: float
    total_spending: float
    current_savings_rate: float
    target_savings_rate: float
    current_breakdown: Dict[str, BudgetBreakdown]
    ideal_breakdown: Dict[str, BudgetBreakdown]
    recommendations: List[BudgetRecommendation]
    suggested_budgets: Dict[str, SuggestedBudget]
    potential_monthly_savings: float
    error: Optional[str] = None


class CashflowData(BaseModel):
    income: float
    expenses: float
    net: float


class CashflowProjection(BaseModel):
    month: str
    projected_balance: float
    cumulative_income: Optional[float] = None
    cumulative_expenses: Optional[float] = None
    month_number: Optional[int] = None


class CashflowProjectionSummary(BaseModel):
    final_projected_balance: float
    total_change: float
    min_balance: float
    max_balance: float
    trend: str


class CashflowProjectionResponse(BaseModel):
    current_balance: float
    account_breakdown: Dict[str, float]
    monthly_cashflow: CashflowData
    projections: List[CashflowProjection]
    summary: CashflowProjectionSummary
    warning: Optional[str] = None
    months_until_zero: Optional[float] = None


class ScenarioProjections(BaseModel):
    baseline: List[CashflowProjection]
    optimistic: List[CashflowProjection]
    pessimistic: List[CashflowProjection]
    savings_boost: List[CashflowProjection]


class CashflowScenariosResponse(BaseModel):
    current_balance: float
    scenarios: ScenarioProjections
    scenario_descriptions: Dict[str, str]
    final_balances: Dict[str, float]


class DailySpendingData(BaseModel):
    day: str
    day_index: int
    average: float
    total: float
    transaction_count: int
    intensity: float


class SpendingHeatmapResponse(BaseModel):
    daily_data: List[DailySpendingData]
    peak_day: str
    peak_amount: float
    low_day: str
    low_amount: float
    analysis_period_months: int
    error: Optional[str] = None


class CategoryCorrelation(BaseModel):
    category1: str
    category2: str
    correlation: float
    strength: str
    direction: str


class CategoryCorrelationsResponse(BaseModel):
    correlations: List[CategoryCorrelation]
    total_categories: Optional[int] = None
    analysis_weeks: Optional[int] = None
    message: Optional[str] = None
    error: Optional[str] = None


class ComponentScore(BaseModel):
    score: float
    weight: int


class HealthRecommendation(BaseModel):
    area: str
    priority: str
    message: str
    action: str


class FinancialHealthScoreResponse(BaseModel):
    overall_score: float
    grade: str
    status: str
    component_scores: Dict[str, ComponentScore]
    recommendations: List[HealthRecommendation]


class GoalPrediction(BaseModel):
    goal_id: int
    goal_name: str
    status: str
    current_amount: Optional[float] = None
    target_amount: Optional[float] = None
    remaining: Optional[float] = None
    progress_percentage: Optional[float] = None
    daily_savings_rate: Optional[float] = None
    monthly_savings_rate: Optional[float] = None
    predicted_completion_date: Optional[str] = None
    days_to_completion: Optional[int] = None
    on_track: Optional[bool] = None
    target_date: Optional[str] = None
    days_ahead_behind: Optional[int] = None
    ahead_or_behind: Optional[str] = None
    required_daily_savings: Optional[float] = None
    required_monthly_savings: Optional[float] = None
    prediction_method: Optional[str] = None
    prediction: Optional[str] = None
    completion_date: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class SavingsPlan(BaseModel):
    name: str
    daily_amount: float
    weekly_amount: float
    monthly_amount: float
    completion_date: str
    feasibility: str


class GoalSavingsPlanResponse(BaseModel):
    goal_id: int
    goal_name: str
    current_amount: Optional[float] = None
    target_amount: Optional[float] = None
    remaining: Optional[float] = None
    current_daily_rate: Optional[float] = None
    suggested_plans: Optional[List[SavingsPlan]] = None
    status: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class AnalyticsSummaryResponse(BaseModel):
    financial_health_score: float
    financial_health_grade: str
    spending_trend: str
    spending_change_percentage: float
    forecast_next_30_days: float
    savings_rate: float
    top_spending_category: Optional[str] = None
    top_spending_amount: Optional[float] = None
    anomaly_count: int
    recommendation_count: int
