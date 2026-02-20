"""
Analytics API Router

Provides ML-powered financial analytics endpoints:
- Spending forecasts
- Spending clusters/personas
- Category predictions
- Budget recommendations
- Cashflow projections
- Financial health scoring
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.utils.security import get_current_user
from app.models import User
from app.services.ml_service import (
    SpendingClusterAnalyzer,
    CategoryPredictor,
    BudgetOptimizer,
    FinancialHealthScorer,
    SpendingHeatmapAnalyzer,
    CategoryCorrelationAnalyzer
)
from app.services.forecast_service import (
    SpendingForecaster,
    CashflowProjector,
    GoalAchievementPredictor
)
from app.schemas.analytics import (
    SpendingForecastResponse,
    CategoryForecastResponse,
    SpendingClustersResponse,
    SpendingPersonaResponse,
    UncategorizedSuggestion,
    BudgetOptimizationResponse,
    CashflowProjectionResponse,
    CashflowScenariosResponse,
    SpendingHeatmapResponse,
    CategoryCorrelationsResponse,
    FinancialHealthScoreResponse,
    GoalPrediction,
    GoalSavingsPlanResponse,
    AnalyticsSummaryResponse
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/spending-forecast", response_model=SpendingForecastResponse)
def get_spending_forecast(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=7, le=90, description="Number of days to forecast"),
    confidence: float = Query(0.95, ge=0.80, le=0.99, description="Confidence level for intervals")
):
    """Get spending forecast for the next N days using ARIMA model."""
    forecaster = SpendingForecaster(db, current_user.id)
    result = forecaster.forecast_spending(forecast_days=days, confidence_level=confidence)
    return result


@router.get("/spending-forecast/by-category", response_model=CategoryForecastResponse)
def get_category_forecast(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=7, le=90, description="Number of days to forecast")
):
    """Get spending forecast broken down by category."""
    forecaster = SpendingForecaster(db, current_user.id)
    result = forecaster.forecast_by_category(forecast_days=days)
    return result


@router.get("/spending-clusters", response_model=SpendingClustersResponse)
def get_spending_clusters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get spending clusters (essential, discretionary, occasional)."""
    analyzer = SpendingClusterAnalyzer(db, current_user.id)
    result = analyzer.get_spending_clusters()
    return result


@router.get("/spending-persona", response_model=SpendingPersonaResponse)
def get_spending_persona(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Identify the user's spending persona based on patterns."""
    analyzer = SpendingClusterAnalyzer(db, current_user.id)
    result = analyzer.identify_spending_persona()
    return result


@router.get("/category-predictions", response_model=List[UncategorizedSuggestion])
def get_category_predictions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of suggestions")
):
    """Get category suggestions for uncategorized transactions."""
    predictor = CategoryPredictor(db, current_user.id)
    result = predictor.get_uncategorized_suggestions(limit=limit)
    return result


@router.post("/category-predictions/predict")
def predict_category(
    description: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Predict category for a given transaction description."""
    predictor = CategoryPredictor(db, current_user.id)
    result = predictor.predict(description)
    return result


@router.get("/budget-recommendations", response_model=BudgetOptimizationResponse)
def get_budget_recommendations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    savings_target: Optional[float] = Query(None, ge=0, description="Monthly savings target"),
    months: int = Query(3, ge=1, le=12, description="Number of months of data to analyze")
):
    """Get AI-powered budget optimization recommendations."""
    optimizer = BudgetOptimizer(db, current_user.id)
    result = optimizer.get_optimization_recommendations(savings_target=savings_target, months=months)
    return result


@router.get("/cashflow-projection", response_model=CashflowProjectionResponse)
def get_cashflow_projection(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(6, ge=1, le=24, description="Months to project ahead")
):
    """Project future account balances based on cashflow patterns."""
    projector = CashflowProjector(db, current_user.id)
    result = projector.project_balance(months_ahead=months)
    return result


@router.get("/cashflow-scenarios", response_model=CashflowScenariosResponse)
def get_cashflow_scenarios(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(12, ge=3, le=24, description="Months to project ahead")
):
    """Get cashflow projections under different scenarios."""
    projector = CashflowProjector(db, current_user.id)
    result = projector.project_with_scenarios(months_ahead=months)
    return result


@router.get("/spending-heatmap", response_model=SpendingHeatmapResponse)
def get_spending_heatmap(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(3, ge=1, le=12, description="Months of data to analyze")
):
    """Get spending heatmap data by day of week."""
    analyzer = SpendingHeatmapAnalyzer(db, current_user.id)
    result = analyzer.get_heatmap_data(months=months)
    return result


@router.get("/category-correlations", response_model=CategoryCorrelationsResponse)
def get_category_correlations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(6, ge=3, le=12, description="Months of data to analyze")
):
    """Analyze correlations between spending categories."""
    analyzer = CategoryCorrelationAnalyzer(db, current_user.id)
    result = analyzer.get_correlations(months=months)
    return result


@router.get("/financial-health-score", response_model=FinancialHealthScoreResponse)
def get_financial_health_score(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Calculate overall financial health score (0-100)."""
    scorer = FinancialHealthScorer(db, current_user.id)
    result = scorer.calculate_score()
    return result


@router.get("/goals/predictions", response_model=List[GoalPrediction])
def get_goal_predictions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Predict completion dates for all active goals."""
    predictor = GoalAchievementPredictor(db, current_user.id)
    result = predictor.predict_all_goals()
    return result


@router.get("/goals/{goal_id}/prediction", response_model=GoalPrediction)
def get_goal_prediction(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Predict completion date for a specific goal."""
    predictor = GoalAchievementPredictor(db, current_user.id)
    result = predictor.predict_goal_completion(goal_id)
    
    if 'error' in result and result['error'] == 'Goal not found':
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    return result


@router.get("/goals/{goal_id}/savings-plan", response_model=GoalSavingsPlanResponse)
def get_goal_savings_plan(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get suggested savings plans to achieve a goal."""
    predictor = GoalAchievementPredictor(db, current_user.id)
    result = predictor.suggest_savings_plan(goal_id)
    
    if 'error' in result and result['error'] == 'Goal not found':
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    return result


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def get_analytics_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a comprehensive analytics summary for the dashboard."""
    health_scorer = FinancialHealthScorer(db, current_user.id)
    health_score = health_scorer.calculate_score()
    
    forecaster = SpendingForecaster(db, current_user.id)
    forecast = forecaster.forecast_spending(forecast_days=30)
    
    optimizer = BudgetOptimizer(db, current_user.id)
    budget_info = optimizer.get_optimization_recommendations()
    
    cluster_analyzer = SpendingClusterAnalyzer(db, current_user.id)
    features = cluster_analyzer.get_spending_features()
    
    top_category = None
    top_amount = 0
    if features and features.get('top_categories'):
        top_category = features['top_categories'][0][0]
        top_amount = features['top_categories'][0][1]
    
    trend = 'stable'
    change_pct = 0
    if forecast.get('summary'):
        change_pct = forecast['summary'].get('change_percentage', 0)
        if change_pct > 5:
            trend = 'increasing'
        elif change_pct < -5:
            trend = 'decreasing'
    
    return {
        'financial_health_score': health_score['overall_score'],
        'financial_health_grade': health_score['grade'],
        'spending_trend': trend,
        'spending_change_percentage': change_pct,
        'forecast_next_30_days': forecast.get('summary', {}).get('total_predicted', 0),
        'savings_rate': budget_info.get('current_savings_rate', 0),
        'top_spending_category': top_category,
        'top_spending_amount': top_amount,
        'anomaly_count': 0,
        'recommendation_count': len(health_score.get('recommendations', []))
    }



