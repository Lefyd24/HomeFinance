from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, case
from typing import List, Optional
from datetime import datetime, date, timedelta
import csv
import io
import json

from app.database import get_db
from app.utils.security import get_current_user_authenticated as get_current_user
from app.schemas import (
    ReportFilter, SpendingReport, CashflowReport, TrendReport,
    IncomeReport, BalanceHistoryReport,
    SavedReportCreate, SavedReportResponse
)
from app.models import User, Transaction, Category, SavedReport, Account, Budget, Debt, DebtPayment
from app.routers.budgets import calculate_budget_progress

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


@router.get("/income", response_model=IncomeReport)
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


@router.get("/trend", response_model=TrendReport)
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


@router.get("/balance-history", response_model=BalanceHistoryReport)
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
    
    # Generate date range
    current = start_date
    dates = []
    while current <= end_date:
        dates.append(current)
        current += timedelta(days=1)

    # For each account, calculate running balance, and accumulate a Total series
    series = []
    totals = [0.0] * len(dates)
    for account in accounts:
        balances = []
        for i, d in enumerate(dates):
            # Calculate balance up to this date
            balance_query = db.query(func.sum(
                case(
                    (Transaction.type == "income", Transaction.amount),
                    (Transaction.type == "expense", -Transaction.amount),
                    else_=0
                )
            )).filter(
                Transaction.account_id == account.id,
                Transaction.date <= d
            )

            bal = float(balance_query.scalar() or 0)
            balances.append(bal)
            totals[i] += bal

        series.append({"name": account.name, "data": balances})

    series.append({"name": "Total", "data": totals})

    return {"labels": [d.strftime("%Y-%m-%d") for d in dates], "series": series}


@router.get("/top-merchants")
def get_top_merchants(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_ids: Optional[str] = None,
    category_ids: Optional[str] = None,
    type: str = "expense",
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get top merchants by total spend (grouped by transaction description)."""
    if not start_date:
        start_date = date.today().replace(day=1)
    if not end_date:
        end_date = date.today()

    # Note: Transaction has no `payee` column; `description` holds the merchant/payee text.
    query = db.query(
        Transaction.description.label("merchant"),
        func.sum(Transaction.amount).label("total")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == type,
        Transaction.date >= start_date,
        Transaction.date <= end_date
    )

    if account_ids:
        account_id_list = [int(id) for id in account_ids.split(",")]
        query = query.filter(Transaction.account_id.in_(account_id_list))

    if category_ids:
        category_id_list = [int(id) for id in category_ids.split(",")]
        query = query.filter(Transaction.category_id.in_(category_id_list))

    results = query.group_by(Transaction.description).order_by(
        func.sum(Transaction.amount).desc()
    ).limit(limit).all()

    return {
        "labels": [r.merchant or "Unknown" for r in results],
        "data": [float(r.total) for r in results]
    }


@router.get("/weekday-heatmap")
def get_weekday_heatmap(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_ids: Optional[str] = None,
    category_ids: Optional[str] = None,
    type: str = "expense",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get total spend by weekday."""
    if not start_date:
        start_date = date.today() - timedelta(days=90)
    if not end_date:
        end_date = date.today()

    # SQLite strftime('%w', date): 0=Sunday .. 6=Saturday
    query = db.query(
        func.strftime("%w", Transaction.date).label("w"),
        func.sum(Transaction.amount).label("total")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == type,
        Transaction.date >= start_date,
        Transaction.date <= end_date
    )

    if account_ids:
        account_id_list = [int(id) for id in account_ids.split(",")]
        query = query.filter(Transaction.account_id.in_(account_id_list))

    if category_ids:
        category_id_list = [int(id) for id in category_ids.split(",")]
        query = query.filter(Transaction.category_id.in_(category_id_list))

    results = query.group_by("w").all()
    by_weekday = {int(r.w): float(r.total) for r in results}  # 0=Sun..6=Sat
    order = [1, 2, 3, 4, 5, 6, 0]  # Mon..Sun

    return {
        "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "data": [by_weekday.get(w, 0.0) for w in order]
    }


@router.get("/spending-mom")
def get_spending_mom(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_ids: Optional[str] = None,
    category_ids: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get month-over-month spending totals with percent change."""
    if not start_date:
        start_date = date.today() - timedelta(days=365)
    if not end_date:
        end_date = date.today()

    query = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.sum(Transaction.amount).label("total")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "expense",
        Transaction.date >= start_date,
        Transaction.date <= end_date
    )

    if account_ids:
        account_id_list = [int(id) for id in account_ids.split(",")]
        query = query.filter(Transaction.account_id.in_(account_id_list))

    if category_ids:
        category_id_list = [int(id) for id in category_ids.split(",")]
        query = query.filter(Transaction.category_id.in_(category_id_list))

    results = query.group_by("month").order_by("month").all()

    labels = [r.month for r in results]
    data = [float(r.total) for r in results]

    changes = [0.0]
    for i in range(1, len(data)):
        prev = data[i - 1]
        changes.append(round((data[i] - prev) / prev * 100, 1) if prev else 0.0)

    return {"labels": labels, "data": data, "changes": changes}


@router.get("/savings-rate")
def get_savings_rate(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_ids: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get monthly savings rate: (income - expense) / income * 100."""
    if not start_date:
        start_date = date.today() - timedelta(days=365)
    if not end_date:
        end_date = date.today()

    def totals_by_month(tx_type):
        q = db.query(
            func.strftime("%Y-%m", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total")
        ).filter(
            Transaction.user_id == current_user.id,
            Transaction.type == tx_type,
            Transaction.date >= start_date,
            Transaction.date <= end_date
        )
        if account_ids:
            account_id_list = [int(id) for id in account_ids.split(",")]
            q = q.filter(Transaction.account_id.in_(account_id_list))
        return {r.month: float(r.total) for r in q.group_by("month").all()}

    income_by_month = totals_by_month("income")
    expense_by_month = totals_by_month("expense")

    labels = sorted(set(income_by_month) | set(expense_by_month))
    rate = []
    for m in labels:
        income = income_by_month.get(m, 0.0)
        expense = expense_by_month.get(m, 0.0)
        rate.append(round((income - expense) / income * 100, 1) if income else 0.0)

    return {"labels": labels, "rate": rate}


@router.get("/net-worth")
def get_net_worth(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_ids: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get running net worth (total balance across active accounts) at each month end."""
    if not start_date:
        start_date = date.today() - timedelta(days=365)
    if not end_date:
        end_date = date.today()

    query = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.sum(case(
            (Transaction.type == "income", Transaction.amount),
            (Transaction.type == "expense", -Transaction.amount),
            else_=0
        )).label("delta")
    ).join(Account, Account.id == Transaction.account_id).filter(
        Transaction.user_id == current_user.id,
        Account.is_active == True,
        Transaction.date <= end_date
    )

    if account_ids:
        account_id_list = [int(id) for id in account_ids.split(",")]
        query = query.filter(Transaction.account_id.in_(account_id_list))

    results = query.group_by("month").order_by("month").all()

    labels, data, running = [], [], 0.0
    start_month = start_date.strftime("%Y-%m")
    for r in results:
        running += float(r.delta or 0)
        if r.month >= start_month:
            labels.append(r.month)
            data.append(round(running, 2))

    return {"labels": labels, "data": data}


@router.get("/budget-performance")
def get_budget_performance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get spend vs limit for each of the user's budgets.

    Reuses `calculate_budget_progress` from `app.routers.budgets` (the same
    function backing `GET /budgets/{id}/progress`) so the spend figure here
    matches what the Budgets page shows — no separate spend formula.
    """
    budgets = db.query(Budget).filter(Budget.user_id == current_user.id).all()

    out = []
    for budget in budgets:
        progress = calculate_budget_progress(db, budget)
        out.append({
            "name": progress.name,
            "limit": float(progress.amount),
            "spent": float(progress.spent),
            "pct": round(progress.percentage, 1)
        })

    return {"budgets": out}


@router.get("/debt-insights")
def get_debt_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get per-debt payoff insights plus portfolio totals."""
    debts = db.query(Debt).filter(Debt.user_id == current_user.id).all()

    out = []
    total_current = 0.0
    total_interest_paid = 0.0

    for debt in debts:
        paid = (debt.original_balance - debt.current_balance) if debt.original_balance else 0.0
        paid_pct = round(paid / debt.original_balance * 100, 1) if debt.original_balance else 0.0
        total_current += float(debt.current_balance or 0)

        interest_paid = db.query(func.sum(DebtPayment.interest_amount)).filter(
            DebtPayment.debt_id == debt.id
        ).scalar() or 0.0
        total_interest_paid += float(interest_paid)

        projected_payoff = None
        if debt.minimum_payment and debt.minimum_payment > 0 and debt.current_balance:
            months_remaining = debt.current_balance / debt.minimum_payment
            if months_remaining > 0:
                total_days = int(months_remaining * 30)
                projected_payoff = (date.today() + timedelta(days=total_days)).strftime("%Y-%m-%d")

        out.append({
            "name": debt.name,
            "current_balance": float(debt.current_balance or 0),
            "original_balance": float(debt.original_balance or 0),
            "paid_pct": paid_pct,
            "interest_rate": debt.interest_rate,
            "projected_payoff": projected_payoff
        })

    return {
        "debts": out,
        "total_current": round(total_current, 2),
        "total_interest_paid": round(total_interest_paid, 2)
    }


@router.get("/export")
def export_report(
    report: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export a report's table rows as a CSV streaming response.

    Reuses the existing report functions (rather than duplicating queries)
    so the exported figures always match what the reports pages show.
    """
    if report == "spending":
        data = get_spending_report(start_date, end_date, None, None, current_user, db)
        rows = [("Category", "Amount")] + list(zip(data.labels, data.data))
    elif report == "income":
        data = get_income_report(start_date, end_date, current_user, db)
        rows = [("Category", "Amount")] + list(zip(data["labels"], data["data"]))
    elif report == "cashflow":
        data = get_cashflow_report(start_date, end_date, "month", current_user, db)
        rows = [("Period", "Income", "Expenses")] + list(
            zip(data.labels, data.income, data.expenses)
        )
    elif report == "net-worth":
        data = get_net_worth(start_date, end_date, None, current_user, db)
        rows = [("Month", "Net Worth")] + list(zip(data["labels"], data["data"]))
    elif report == "savings-rate":
        data = get_savings_rate(start_date, end_date, None, current_user, db)
        rows = [("Month", "Savings %")] + list(zip(data["labels"], data["rate"]))
    elif report == "top-merchants":
        data = get_top_merchants(start_date, end_date, None, None, "expense", 50, current_user, db)
        rows = [("Merchant", "Amount")] + list(zip(data["labels"], data["data"]))
    else:
        rows = [("error", f"unknown report {report}")]

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{report}.csv"'}
    )


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