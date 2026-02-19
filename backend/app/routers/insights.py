from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.utils.security import get_current_user
from app.services.insights_service import InsightsService
from app.schemas.insight import (
    UserInsightResponse,
    SpendingPatternResponse,
    InsightSummary,
)
from app.models import Transaction, UserInsight, User
from datetime import timedelta

router = APIRouter(prefix="/insights", tags=["Insights"])


@router.get("/", response_model=List[UserInsightResponse])
def get_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=7, le=365),
    include_read: bool = Query(True),
    include_dismissed: bool = Query(False),
):
    """Get smart spending insights for the user.
    
    Generates fresh insights using statistical analysis of spending patterns.
    """
    service = InsightsService(db, current_user.id)
    insights = service.generate_insights(days=days)
    
    # Filter based on query parameters
    if not include_read:
        insights = [i for i in insights if not i.is_read]
    if not include_dismissed:
        insights = [i for i in insights if not i.is_dismissed]
    
    return insights


@router.get("/summary", response_model=InsightSummary)
def get_insights_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a summary of insights for the dashboard."""
    service = InsightsService(db, current_user.id)
    
    # Generate insights if needed
    insights = service.generate_insights(days=30)
    
    # Calculate summary statistics
    total_count = len(insights)
    unread_count = len([i for i in insights if not i.is_read])
    warning_count = len([i for i in insights if i.severity == 'warning'])
    alert_count = len([i for i in insights if i.severity == 'alert'])
    info_count = len([i for i in insights if i.severity == 'info'])
    success_count = len([i for i in insights if i.severity == 'success'])
    
    # Get top insight (most recent alert/warning, or most recent overall)
    priority_insights = [i for i in insights if i.severity in ['alert', 'warning']]
    top_insight = priority_insights[0] if priority_insights else (insights[0] if insights else None)
    
    return InsightSummary(
        has_insights=total_count > 0,
        total_count=total_count,
        unread_count=unread_count,
        warning_count=warning_count,
        alert_count=alert_count,
        info_count=info_count,
        success_count=success_count,
        top_insight_title=top_insight.title if top_insight else None,
        top_insight_message=top_insight.description if top_insight else None
    )


@router.post("/generate")
def generate_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=7, le=365),
):
    """Manually trigger insight generation."""
    service = InsightsService(db, current_user.id)
    insights = service.generate_insights(days=days)
    
    return {
        "message": f"Generated {len(insights)} insights",
        "insights_count": len(insights)
    }


@router.put("/{insight_id}/read")
def mark_insight_read(
    insight_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark an insight as read."""
    insight = db.query(UserInsight).filter(
        UserInsight.id == insight_id,
        UserInsight.user_id == current_user.id
    ).first()
    
    if not insight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insight not found"
        )
    
    insight.is_read = True
    db.commit()
    
    return {"message": "Insight marked as read"}


@router.put("/{insight_id}/dismiss")
def dismiss_insight(
    insight_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dismiss an insight."""
    insight = db.query(UserInsight).filter(
        UserInsight.id == insight_id,
        UserInsight.user_id == current_user.id
    ).first()
    
    if not insight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insight not found"
        )
    
    insight.is_dismissed = True
    db.commit()
    
    return {"message": "Insight dismissed"}


@router.post("/mark-all-read")
def mark_all_insights_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all insights as read."""
    db.query(UserInsight).filter(
        UserInsight.user_id == current_user.id,
        UserInsight.is_read == False
    ).update({"is_read": True})
    
    db.commit()
    
    return {"message": "All insights marked as read"}


@router.get("/trends/analysis")
def get_trends_analysis(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(6, ge=3, le=24),
):
    """Get spending trend analysis using linear regression.
    
    Analyzes spending patterns over time to identify trends.
    """
    service = InsightsService(db, current_user.id)
    trends = service.analyze_trends(months=months)
    
    return trends


@router.get("/statistics")
def get_spending_statistics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(6, ge=3, le=24),
):
    """Get comprehensive spending statistics.
    
    Includes:
    - Mean, median, std dev
    - Quartiles
    - Monthly breakdown
    - Volatility metrics
    """
    service = InsightsService(db, current_user.id)
    stats = service.get_spending_statistics(months=months)
    
    return stats


@router.post("/patterns/detect")
def detect_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Detect spending patterns.
    
    Identifies:
    - Recurring transactions
    - Weekend vs weekday spending
    - Seasonal patterns
    """
    service = InsightsService(db, current_user.id)
    patterns = service.detect_patterns()
    
    return {
        "message": f"Detected {len(patterns)} patterns",
        "patterns": patterns
    }


@router.get("/patterns", response_model=List[SpendingPatternResponse])
def get_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    include_inactive: bool = Query(False),
):
    """Get detected spending patterns."""
    from app.models import SpendingPattern
    
    query = db.query(SpendingPattern).filter(
        SpendingPattern.user_id == current_user.id
    )
    
    if not include_inactive:
        query = query.filter(SpendingPattern.is_active == True)
    
    patterns = query.order_by(SpendingPattern.confidence_score.desc()).all()
    
    return patterns


@router.get("/category/{category_name}/trend")
def get_category_trend(
    category_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(6, ge=3, le=24),
):
    """Get detailed trend analysis for a specific category."""
    from app.models import Category
    
    # Verify category exists
    category = db.query(Category).filter(
        Category.user_id == current_user.id,
        Category.name == category_name
    ).first()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )
    
    end_date = date.today()
    start_date = end_date - timedelta(days=30*months)
    
    from sqlalchemy import func
    
    # Get monthly data for this category
    monthly_data = db.query(
        func.strftime('%Y-%m', Transaction.date).label('month'),
        func.sum(Transaction.amount).label('total'),
        func.count(Transaction.id).label('count')
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == 'expense',
        Transaction.category_id == category.id,
        Transaction.date >= start_date
    ).group_by(func.strftime('%Y-%m', Transaction.date)).order_by('month').all()
    
    if len(monthly_data) < 3:
        return {
            "category": category_name,
            "error": "Insufficient data for trend analysis (minimum 3 months required)"
        }
    
    # Perform trend analysis
    x = list(range(len(monthly_data)))
    y = [float(m.total) for m in monthly_data]
    
    service = InsightsService(db, current_user.id)
    trend = service.analyzer.linear_regression(x, y)
    
    return {
        "category": category_name,
        "category_color": category.color,
        "months_analyzed": len(monthly_data),
        "trend_direction": trend.trend_direction,
        "trend_percentage": round(trend.trend_percentage, 2),
        "r_squared": round(trend.r_squared, 3),
        "is_significant": trend.r_squared > 0.5,
        "monthly_data": [
            {
                "month": m.month,
                "amount": float(m.total),
                "transaction_count": m.count,
                "average_transaction": round(float(m.total) / m.count, 2) if m.count > 0 else 0
            }
            for m in monthly_data
        ]
    }


@router.get("/anomalies")
def get_anomalies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=7, le=90),
    threshold: float = Query(2.5, ge=1.5, le=4.0),
):
    """Detect spending anomalies using statistical methods.
    
    Uses Z-score method with configurable threshold.
    Higher threshold = less sensitive, lower threshold = more sensitive.
    """
    from datetime import timedelta
    
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    from sqlalchemy import func
    from app.models import Transaction, Category
    
    # Get transactions with anomalies
    transactions = db.query(
        Transaction,
        Category.name.label('category_name')
    ).outerjoin(
        Category, Transaction.category_id == Category.id
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == 'expense',
        Transaction.date >= start_date
    ).order_by(Transaction.amount.desc()).all()
    
    # Calculate statistics per category
    category_amounts = {}
    for tx, cat_name in transactions:
        cat = cat_name or 'Uncategorized'
        if cat not in category_amounts:
            category_amounts[cat] = []
        category_amounts[cat].append(tx.amount)
    
    anomalies = []
    service = InsightsService(db, current_user.id)
    
    for category, amounts in category_amounts.items():
        if len(amounts) < 5:
            continue
        
        summary = service.analyzer.calculate_summary(amounts)
        
        # Check each transaction
        for tx, cat_name in transactions:
            if (cat_name or 'Uncategorized') != category:
                continue
            
            z_score = (tx.amount - summary.mean) / summary.std_dev if summary.std_dev > 0 else 0
            
            if abs(z_score) > threshold:
                anomalies.append({
                    'transaction_id': tx.id,
                    'date': tx.date.isoformat(),
                    'description': tx.description,
                    'category': category,
                    'amount': tx.amount,
                    'z_score': round(z_score, 2),
                    'severity': 'high' if abs(z_score) > 3 else 'medium',
                    'average_for_category': round(summary.mean, 2),
                    'deviation_percentage': round((tx.amount - summary.mean) / summary.mean * 100, 1) if summary.mean > 0 else 0
                })
    
    # Sort by absolute z-score
    anomalies.sort(key=lambda x: abs(x['z_score']), reverse=True)
    
    return {
        'threshold': threshold,
        'analysis_period_days': days,
        'total_anomalies': len(anomalies),
        'anomalies': anomalies[:20]  # Return top 20
    }
