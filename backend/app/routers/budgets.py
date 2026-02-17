from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date

from app.database import get_db
from app.utils.security import get_current_user
from app.schemas import BudgetCreate, BudgetUpdate, BudgetResponse, BudgetProgress
from app.models import User, Budget, BudgetCategory, Category, Transaction

router = APIRouter(prefix="/budgets", tags=["Budgets"])


@router.get("/", response_model=List[BudgetResponse])
def get_budgets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    active_only: bool = True
):
    """Get all budgets for current user."""
    query = db.query(Budget).filter(Budget.user_id == current_user.id)
    
    if active_only:
        query = query.filter(Budget.is_active == True)
    
    budgets = query.all()
    
    # Calculate progress for each budget
    result = []
    for budget in budgets:
        budget_data = calculate_budget_progress(db, budget)
        result.append(budget_data)
    
    return result


@router.post("/", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
def create_budget(
    budget_data: BudgetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new budget."""
    # Create budget
    db_budget = Budget(
        user_id=current_user.id,
        name=budget_data.name,
        amount=budget_data.amount,
        period=budget_data.period,
        start_date=budget_data.start_date,
        end_date=budget_data.end_date
    )
    db.add(db_budget)
    db.commit()
    db.refresh(db_budget)
    
    # Add categories to budget
    if budget_data.category_ids:
        for category_id in budget_data.category_ids:
            # Verify category belongs to user
            category = db.query(Category).filter(
                Category.id == category_id,
                Category.user_id == current_user.id
            ).first()
            
            if category:
                budget_category = BudgetCategory(
                    budget_id=db_budget.id,
                    category_id=category_id
                )
                db.add(budget_category)
        
        db.commit()
    
    # Return with progress
    return calculate_budget_progress(db, db_budget)


@router.get("/{budget_id}", response_model=BudgetResponse)
def get_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get budget by ID."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    return calculate_budget_progress(db, budget)


@router.put("/{budget_id}", response_model=BudgetResponse)
def update_budget(
    budget_id: int,
    budget_data: BudgetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a budget."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    # Update fields
    update_data = budget_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(budget, field, value)
    
    db.commit()
    db.refresh(budget)
    
    return calculate_budget_progress(db, budget)


@router.delete("/{budget_id}")
def delete_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a budget."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    db.delete(budget)
    db.commit()
    
    return {"message": "Budget deleted successfully"}


@router.get("/{budget_id}/progress", response_model=BudgetProgress)
def get_budget_progress(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get budget progress/spending."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    progress = calculate_budget_progress(db, budget)
    
    return BudgetProgress(
        spent=progress.spent,
        remaining=progress.remaining,
        percentage=progress.percentage
    )


@router.get("/{budget_id}/report")
def get_budget_report(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get budget vs actual report."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    # Get category breakdown
    category_breakdown = []
    for bc in budget.budget_categories:
        spent = db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == current_user.id,
            Transaction.category_id == bc.category_id,
            Transaction.type == "expense"
        )
        
        # Apply date filters based on budget period
        if budget.start_date:
            spent = spent.filter(Transaction.date >= budget.start_date)
        if budget.end_date:
            spent = spent.filter(Transaction.date <= budget.end_date)
        
        spent = spent.scalar() or 0
        
        category_breakdown.append({
            "category_id": bc.category_id,
            "category_name": bc.category.name,
            "allocated": bc.allocated_amount or 0,
            "spent": spent,
            "remaining": (bc.allocated_amount or 0) - spent
        })
    
    progress = calculate_budget_progress(db, budget)
    
    return {
        "budget": {
            "id": budget.id,
            "name": budget.name,
            "amount": budget.amount,
            "spent": progress.spent,
            "remaining": progress.remaining,
            "percentage": progress.percentage
        },
        "category_breakdown": category_breakdown
    }


@router.get("/{budget_id}/transactions")
def get_budget_transactions(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 50
):
    """Get transactions for a budget within the budget period."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    # Get category IDs for this budget
    category_ids = [bc.category_id for bc in budget.budget_categories]
    
    # Build query for transactions
    query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
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
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    transactions = query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()
    
    # Format response
    result = []
    for tx in transactions:
        result.append({
            "id": tx.id,
            "date": tx.date,
            "description": tx.description,
            "amount": tx.amount,
            "category_id": tx.category_id,
            "category_name": tx.category.name if tx.category else None,
            "category_color": tx.category.color if tx.category else None,
            "account_id": tx.account_id,
            "account_name": tx.account.name if tx.account else None,
            "notes": tx.notes
        })
    
    return {
        "items": result,
        "total": total,
        "budget": {
            "id": budget.id,
            "name": budget.name,
            "amount": budget.amount,
            "start_date": budget.start_date,
            "end_date": budget.end_date,
            "category_ids": category_ids
        }
    }


@router.post("/{budget_id}/categories")
def add_category_to_budget(
    budget_id: int,
    category_id: int,
    allocated_amount: Optional[float] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a category to budget."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    # Verify category belongs to user
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )
    
    # Check if already added
    existing = db.query(BudgetCategory).filter(
        BudgetCategory.budget_id == budget_id,
        BudgetCategory.category_id == category_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category already added to budget"
        )
    
    budget_category = BudgetCategory(
        budget_id=budget_id,
        category_id=category_id,
        allocated_amount=allocated_amount
    )
    db.add(budget_category)
    db.commit()
    
    return {"message": "Category added to budget"}


@router.delete("/{budget_id}/categories/{category_id}")
def remove_category_from_budget(
    budget_id: int,
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a category from budget."""
    budget_category = db.query(BudgetCategory).filter(
        BudgetCategory.budget_id == budget_id,
        BudgetCategory.category_id == category_id
    ).first()
    
    if not budget_category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found in budget"
        )
    
    # Verify budget belongs to user
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    db.delete(budget_category)
    db.commit()
    
    return {"message": "Category removed from budget"}


def calculate_budget_progress(db: Session, budget: Budget) -> BudgetResponse:
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
    remaining = budget.amount - spent
    percentage = (spent / budget.amount * 100) if budget.amount > 0 else 0
    
    return BudgetResponse(
        id=budget.id,
        user_id=budget.user_id,
        name=budget.name,
        amount=budget.amount,
        period=budget.period,
        start_date=budget.start_date,
        end_date=budget.end_date,
        category_ids=category_ids,
        is_active=budget.is_active,
        created_at=budget.created_at,
        spent=spent,
        remaining=remaining,
        percentage=round(percentage, 2)
    )