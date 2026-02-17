from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from app.models import Budget, BudgetCategory, Category, Transaction
from app.schemas import BudgetCreate, BudgetUpdate


class BudgetService:
    """Service for budget-related operations."""
    
    @staticmethod
    def get_budgets(db: Session, user_id: int, active_only: bool = True) -> List[Budget]:
        """Get all budgets for a user."""
        query = db.query(Budget).filter(Budget.user_id == user_id)
        
        if active_only:
            query = query.filter(Budget.is_active == True)
        
        return query.all()
    
    @staticmethod
    def get_budget(db: Session, budget_id: int, user_id: int) -> Optional[Budget]:
        """Get a single budget by ID."""
        return db.query(Budget).filter(
            Budget.id == budget_id,
            Budget.user_id == user_id
        ).first()
    
    @staticmethod
    def create_budget(db: Session, budget_data: BudgetCreate, user_id: int) -> Budget:
        """Create a new budget."""
        # Create budget
        db_budget = Budget(
            user_id=user_id,
            name=budget_data.name,
            amount=budget_data.amount,
            period=budget_data.period,
            start_date=budget_data.start_date,
            end_date=budget_data.end_date
        )
        db.add(db_budget)
        db.commit()
        db.refresh(db_budget)
        
        # Add categories
        if budget_data.category_ids:
            for category_id in budget_data.category_ids:
                budget_category = BudgetCategory(
                    budget_id=db_budget.id,
                    category_id=category_id
                )
                db.add(budget_category)
            db.commit()
        
        return db_budget
    
    @staticmethod
    def update_budget(
        db: Session,
        budget: Budget,
        budget_data: BudgetUpdate
    ) -> Budget:
        """Update a budget."""
        update_data = budget_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(budget, field, value)
        
        db.commit()
        db.refresh(budget)
        return budget
    
    @staticmethod
    def delete_budget(db: Session, budget: Budget) -> None:
        """Delete a budget."""
        db.delete(budget)
        db.commit()
    
    @staticmethod
    def calculate_budget_progress(db: Session, budget: Budget) -> dict:
        """Calculate budget progress with spending data."""
        # Get category IDs for this budget
        category_ids = [bc.category_id for bc in budget.budget_categories]
        
        # Calculate spent amount
        query = db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == budget.user_id,
            Transaction.type == "expense"
        )
        
        # Filter by categories if budget has categories
        if category_ids:
            query = query.filter(Transaction.category_id.in_(category_ids))
        
        # Apply date filters
        if budget.start_date:
            query = query.filter(Transaction.date >= budget.start_date)
        if budget.end_date:
            query = query.filter(Transaction.date <= budget.end_date)
        
        spent = query.scalar() or 0
        remaining = budget.amount - float(spent)
        percentage = (float(spent) / budget.amount * 100) if budget.amount > 0 else 0
        
        return {
            "spent": float(spent),
            "remaining": remaining,
            "percentage": round(float(percentage), 2)
        }
    
    @staticmethod
    def get_category_breakdown(db: Session, budget: Budget) -> List[dict]:
        """Get spending breakdown by category for a budget."""
        breakdown = []
        
        for bc in budget.budget_categories:
            spent = db.query(func.sum(Transaction.amount)).filter(
                Transaction.user_id == budget.user_id,
                Transaction.category_id == bc.category_id,
                Transaction.type == "expense"
            )
            
            # Apply date filters
            if budget.start_date:
                spent = spent.filter(Transaction.date >= budget.start_date)
            if budget.end_date:
                spent = spent.filter(Transaction.date <= budget.end_date)
            
            spent_amount = spent.scalar() or 0
            
            breakdown.append({
                "category_id": bc.category_id,
                "category_name": bc.category.name if bc.category else "Unknown",
                "allocated": bc.allocated_amount or 0,
                "spent": float(spent_amount),
                "remaining": (bc.allocated_amount or 0) - float(spent_amount)
            })
        
        return breakdown
    
    @staticmethod
    def add_category_to_budget(
        db: Session,
        budget_id: int,
        category_id: int,
        allocated_amount: Optional[float] = None
    ) -> BudgetCategory:
        """Add a category to a budget."""
        budget_category = BudgetCategory(
            budget_id=budget_id,
            category_id=category_id,
            allocated_amount=allocated_amount
        )
        db.add(budget_category)
        db.commit()
        db.refresh(budget_category)
        return budget_category
    
    @staticmethod
    def remove_category_from_budget(db: Session, budget_category: BudgetCategory) -> None:
        """Remove a category from a budget."""
        db.delete(budget_category)
        db.commit()