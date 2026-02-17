from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta

from app.models import Transaction, Category, Account


class ReportService:
    """Service for report generation."""
    
    @staticmethod
    def get_spending_by_category(
        db: Session,
        user_id: int,
        start_date: date,
        end_date: date,
        account_ids: List[int] = None,
        category_ids: List[int] = None
    ) -> Dict[str, Any]:
        """Get spending report grouped by category."""
        query = db.query(
            Category.name,
            func.sum(Transaction.amount).label("total")
        ).join(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date >= start_date,
            Transaction.date <= end_date
        )
        
        if account_ids:
            query = query.filter(Transaction.account_id.in_(account_ids))
        if category_ids:
            query = query.filter(Transaction.category_id.in_(category_ids))
        
        results = query.group_by(Category.name).all()
        
        return {
            "labels": [r.name for r in results],
            "data": [float(r.total) for r in results]
        }
    
    @staticmethod
    def get_income_by_category(
        db: Session,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """Get income report grouped by category."""
        results = db.query(
            Category.name,
            func.sum(Transaction.amount).label("total")
        ).join(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.type == "income",
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).group_by(Category.name).all()
        
        return {
            "labels": [r.name for r in results],
            "data": [float(r.total) for r in results]
        }
    
    @staticmethod
    def get_cashflow(
        db: Session,
        user_id: int,
        start_date: date,
        end_date: date,
        group_by: str = "month"
    ) -> Dict[str, Any]:
        """Get cash flow report (income vs expenses over time)."""
        # Determine grouping format
        if group_by == "day":
            date_trunc = func.date(Transaction.date)
        elif group_by == "week":
            date_trunc = func.strftime("%Y-%W", Transaction.date)
        elif group_by == "year":
            date_trunc = func.strftime("%Y", Transaction.date)
        else:  # month
            date_trunc = func.strftime("%Y-%m", Transaction.date)
        
        # Get income by period
        income_results = db.query(
            date_trunc.label("period"),
            func.sum(Transaction.amount).label("total")
        ).filter(
            Transaction.user_id == user_id,
            Transaction.type == "income",
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).group_by("period").order_by("period").all()
        
        # Get expenses by period
        expense_results = db.query(
            date_trunc.label("period"),
            func.sum(Transaction.amount).label("total")
        ).filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).group_by("period").order_by("period").all()
        
        # Combine periods
        all_periods = sorted(set([r.period for r in income_results + expense_results]))
        
        income_data = {r.period: float(r.total) for r in income_results}
        expense_data = {r.period: float(r.total) for r in expense_results}
        
        return {
            "labels": all_periods,
            "income": [income_data.get(p, 0) for p in all_periods],
            "expenses": [expense_data.get(p, 0) for p in all_periods]
        }
    
    @staticmethod
    def get_category_breakdown(
        db: Session,
        user_id: int,
        start_date: date,
        end_date: date,
        type: str = "expense"
    ) -> Dict[str, Any]:
        """Get detailed category breakdown."""
        results = db.query(
            Category.name,
            Category.color,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count")
        ).join(Transaction).filter(
            Transaction.user_id == user_id,
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
    
    @staticmethod
    def get_trend(
        db: Session,
        user_id: int,
        start_date: date,
        end_date: date,
        category_id: int = None
    ) -> Dict[str, Any]:
        """Get trend analysis."""
        query = db.query(
            func.strftime("%Y-%m", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total")
        ).filter(
            Transaction.user_id == user_id,
            Transaction.date >= start_date,
            Transaction.date <= end_date
        )
        
        if category_id:
            query = query.filter(Transaction.category_id == category_id)
        
        results = query.group_by("month").order_by("month").all()
        
        return {
            "labels": [r.month for r in results],
            "data": [float(r.total) for r in results]
        }
    
    @staticmethod
    def get_balance_history(
        db: Session,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """Get account balance history over time."""
        accounts = db.query(Account).filter(
            Account.user_id == user_id,
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
                balance = db.query(func.sum(
                    func.case(
                        (Transaction.type == "income", Transaction.amount),
                        (Transaction.type == "expense", -Transaction.amount),
                        else_=0
                    )
                )).filter(
                    Transaction.account_id == account.id,
                    Transaction.date <= d
                ).scalar() or 0
                
                balances.append(float(balance))
            
            result["accounts"].append({
                "name": account.name,
                "balances": balances
            })
        
        result["labels"] = [d.strftime("%Y-%m-%d") for d in dates]
        
        return result