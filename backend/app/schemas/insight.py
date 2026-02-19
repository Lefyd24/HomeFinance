from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date, datetime


class UserInsightBase(BaseModel):
    """Base schema for user insights."""
    type: str = Field(..., min_length=1, max_length=50)
    category: Optional[str] = Field(None, max_length=100)
    severity: str = Field(..., pattern="^(info|success|warning|alert)$")
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    metric_value: Optional[float] = None
    comparison_value: Optional[float] = None
    percentage_change: Optional[float] = None
    valid_until: Optional[date] = None


class UserInsightCreate(UserInsightBase):
    """Schema for creating user insights."""
    pass


class UserInsightResponse(UserInsightBase):
    """Schema for user insight responses."""
    id: int
    user_id: int
    is_read: bool
    is_dismissed: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class SpendingPatternBase(BaseModel):
    """Base schema for spending patterns."""
    pattern_type: str = Field(..., min_length=1, max_length=50)
    category_id: Optional[int] = None
    description: str = Field(..., min_length=1, max_length=255)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    frequency: Optional[str] = Field(None, max_length=20)
    average_amount: Optional[float] = None


class SpendingPatternCreate(SpendingPatternBase):
    """Schema for creating spending patterns."""
    first_detected: date
    last_occurrence: Optional[date] = None


class SpendingPatternResponse(SpendingPatternBase):
    """Schema for spending pattern responses."""
    id: int
    user_id: int
    category_name: Optional[str] = None
    first_detected: date
    last_occurrence: Optional[date]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class InsightSummary(BaseModel):
    """Summary of insights for dashboard."""
    has_insights: bool
    total_count: int
    unread_count: int
    warning_count: int
    alert_count: int
    info_count: int
    success_count: int
    top_insight_title: Optional[str] = None
    top_insight_message: Optional[str] = None


class TrendDataPoint(BaseModel):
    """Single data point for trend analysis."""
    period: str
    amount: float
    count: int
    average: float


class CategoryTrend(BaseModel):
    """Trend data for a specific category."""
    category_id: int
    category_name: str
    category_color: Optional[str]
    trend_direction: str  # increasing, decreasing, stable
    trend_percentage: float
    data_points: List[TrendDataPoint]


class SpendingAnalysis(BaseModel):
    """Comprehensive spending analysis."""
    period_start: date
    period_end: date
    total_spending: float
    average_monthly_spending: float
    spending_by_category: Dict[str, float]
    top_categories: List[Dict[str, Any]]
    trends: List[CategoryTrend]
    patterns: List[SpendingPatternResponse]
    insights: List[UserInsightResponse]
    month_over_month_change: Optional[float]
    year_over_year_change: Optional[float]


class AnomalyDetectionResult(BaseModel):
    """Result of anomaly detection."""
    is_anomaly: bool
    anomaly_score: float
    expected_amount: float
    actual_amount: float
    deviation_percentage: float
    category: Optional[str]
    description: str
    severity: str


class StatisticalMetrics(BaseModel):
    """Statistical metrics for spending analysis."""
    mean: float
    median: float
    std_dev: float
    variance: float
    min_value: float
    max_value: float
    percentile_25: float
    percentile_75: float
    coefficient_of_variation: float
    sample_size: int
