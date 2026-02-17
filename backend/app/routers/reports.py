from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import List, Optional
from datetime import datetime, date, timedelta
import json

from app.database import get_db
from app.utils.security import get_current_user
from app.schemas import (
    ReportFilter, SpendingReport, CashflowReport, TrendReport,
    SavedReportCreate, SavedReportResponse
)
from app.models import User, Transaction, Category, SavedReport, Account

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/types")
def get_report_types():
    """Get available report types."""
    return {
        "types": [
            {"id": "spending", "name": "Spending by Category", "chart_type": ["bar", "pie", "doughnut"]},
            {"id": "income", "name": "Income Analysis", "chart_type": ["bar", "line"]},
            {"id": "cashflow", "name": "Cash Flow", "chart_type": ["line", "bar"]},
            {"id": "category-breakdown", "name": "Category Breakdown", "chart_type": ["pie", "doughnut"]},
            {"id": "trend", "name": "Trend Analysis", "chart_type": ["line", "bar"]},
            {"id": "balance-history", "name": "Balance History", "chart_type": ["line"]}
        ]
    }


@router.get("/spending", response_model=SpendingReport)
def get_spending_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_ids: Optional[str] = None,
    category_ids: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get spending report by category."""
    # Default to current month if no dates
    if not start_date:
        start_date = date.today().replace(day=1)
    if not end_date:
        end_date = date.today()
    
    # Build query
    query = db.query(
        Category.name,
        func.sum(Transaction.amount).label("total")
    ).join(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "expense",
        Transaction.date >= start_date,
        Transaction.date <= end_date
    )
    
    # Apply filters
    if account_ids:
        account_id_list = [int(id) for id in account_ids.split(",")]
        query = query.filter(Transaction.account_id.in_(account_id_list))
    
    if category_ids:
        category_id_list = [int(id) for id in category_ids.split(",")]
        query = query.filter(Transaction.category_id.in_(category_id_list))
    
    results = query.group_by(Category.name).all()
    
    labels = [r.name for r in results]
    data = [float(r.total) for r in results]
    
    return SpendingReport(labels=labels, data=data)


@router.get("/income")
def get_income_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get income report by category."""
    if not start_date:
        start_date = date.today().replace(day=1)
    if not end_date:
        end_date = date.today()
    
    results = db.query(
        Category.name,
        func.sum(Transaction.amount).label("total")
    ).join(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "income",
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).group_by(Category.name).all()
    
    labels = [r.name for r in results]
    data = [float(r.total) for r in results]
    
    return {"labels": labels, "data": data}


@router.get("/cashflow", response_model=CashflowReport)
def get_cashflow_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    group_by: str = "month",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get cash flow report (income vs expenses over time)."""
    if not start_date:
        start_date = date.today() - timedelta(days=180)
    if not end_date:
        end_date = date.today()
    
    # Determine grouping format
    if group_by == "day":
        date_format = "%Y-%m-%d"
        date_trunc = func.date(Transaction.date)
    elif group_by == "week":
        date_format = "%Y-W%W"
        date_trunc = func.strftime("%Y-%W", Transaction.date)
    elif group_by == "year":
        date_format = "%Y"
        date_trunc = func.strftime("%Y", Transaction.date)
    else:  # month
        date_format = "%Y-%m"
        date_trunc = func.strftime("%Y-%m", Transaction.date)
    
    # Get income by period
    income_results = db.query(
        date_trunc.label("period"),
        func.sum(Transaction.amount).label("total")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "income",
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).group_by("period").order_by("period").all()
    
    # Get expenses by period
    expense_results = db.query(
        date_trunc.label("period"),
        func.sum(Transaction.amount).label("total")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "expense",
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).group_by("period").order_by("period").all()
    
    # Combine periods
    all_periods = sorted(set([r.period for r in income_results + expense_results]))
    
    income_data = {r.period: float(r.total) for r in income_results}
    expense_data = {r.period: float(r.total) for r in expense_results}
    
    labels = all_periods
    income = [income_data.get(p, 0) for p in all_periods]
    expenses = [expense_data.get(p, 0) for p in all_periods]
    
    return CashflowReport(labels=labels, income=income, expenses=expenses)


@router.get("/category-breakdown")
def get_category_breakdown(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    type: str = "expense",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed category breakdown."""
    if not start_date:
        start_date = date.today().replace(day=1)
    if not end_date:
        end_date = date.today()
    
    results = db.query(
        Category.name,
        Category.color,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count")
    ).join(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == type,
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).group_by(Category.id).all()
    
    return {
        "categories": [
            {
                "name": r.name,
                "color": r.color,
                "amount": float(r.total),
                "count": r.count
            }
            for r in results
        ]
    }


@router.get("/trend")
def get_trend_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get trend analysis for a category."""
    if not start_date:
        start_date = date.today() - timedelta(days=365)
    if not end_date:
        end_date = date.today()
    
    query = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.sum(Transaction.amount).label("total")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.date >= start_date,
        Transaction.date <= end_date
    )
    
    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    
    results = query.group_by("month").order_by("month").all()
    
    labels = [r.month for r in results]
    data = [float(r.total) for r in results]
    
    return {"labels": labels, "data": data}


@router.get("/balance-history")
def get_balance_history(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get account balance history over time."""
    if not start_date:
        start_date = date.today() - timedelta(days=180)
    if not end_date:
        end_date = date.today()
    
    # Get all accounts for user
    accounts = db.query(Account).filter(
        Account.user_id == current_user.id,
        Account.is_active == True
    ).all()
    
    result = {
        "accounts": [],
        "labels": []
    }
    
    # Generate date range
    current = start_date
    dates = []
    while current <= end_date:
        dates.append(current)
        current += timedelta(days=1)
    
    # For each account, calculate running balance
    for account in accounts:
        balances = []
        for d in dates:
            # Calculate balance up to this date
            balance_query = db.query(func.sum(
                func.case(
                    (Transaction.type == "income", Transaction.amount),
                    (Transaction.type == "expense", -Transaction.amount),
                    else_=0
                )
            )).filter(
                Transaction.account_id == account.id,
                Transaction.date <= d
            )
            
            balance = balance_query.scalar() or 0
            balances.append(float(balance))
        
        result["accounts"].append({
            "name": account.name,
            "balances": balances
        })
    
    result["labels"] = [d.strftime("%Y-%m-%d") for d in dates]
    
    return result


@router.post("/custom")
def generate_custom_report(
    config: ReportFilter,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate custom report based on configuration."""
    # This is a placeholder for custom report generation
    return {"message": "Custom report generation not yet implemented"}


@router.post("/save", response_model=SavedReportResponse)
def save_report(
    report_data: SavedReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a report configuration."""
    db_report = SavedReport(
        user_id=current_user.id,
        **report_data.model_dump()
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    
    return db_report


@router.get("/saved", response_model=List[SavedReportResponse])
def get_saved_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get saved reports for current user."""
    reports = db.query(SavedReport).filter(
        SavedReport.user_id == current_user.id
    ).order_by(SavedReport.created_at.desc()).all()
    
    return reports


@router.get("/saved/{report_id}", response_model=SavedReportResponse)
def get_saved_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a saved report by ID."""
    report = db.query(SavedReport).filter(
        SavedReport.id == report_id,
        SavedReport.user_id == current_user.id
    ).first()
    
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )
    
    return report


@router.delete("/saved/{report_id}")
def delete_saved_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a saved report."""
    report = db.query(SavedReport).filter(
        SavedReport.id == report_id,
        SavedReport.user_id == current_user.id
    ).first()
    
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )
    
    db.delete(report)
    db.commit()
    
    return {"message": "Report deleted successfully"}