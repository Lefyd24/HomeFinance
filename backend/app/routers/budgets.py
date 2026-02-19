from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
import calendar

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
    category_ids = update_data.pop('category_ids', None)
    
    for field, value in update_data.items():
        setattr(budget, field, value)
    
    # Update categories if provided
    if category_ids is not None:
        # Remove existing categories
        db.query(BudgetCategory).filter(BudgetCategory.budget_id == budget_id).delete()
        
        # Add new categories
        for category_id in category_ids:
            category = db.query(Category).filter(
                Category.id == category_id,
                Category.user_id == current_user.id
            ).first()
            
            if category:
                budget_category = BudgetCategory(
                    budget_id=budget_id,
                    category_id=category_id
                )
                db.add(budget_category)
    
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
    """Get budget vs actual report for the current period."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    period_start, period_end = get_period_dates(budget)
    
    category_breakdown = []
    for bc in budget.budget_categories:
        spent_query = db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == current_user.id,
            Transaction.category_id == bc.category_id,
            Transaction.type == "expense"
        )
        
        if period_start:
            spent_query = spent_query.filter(Transaction.date >= period_start)
        if period_end:
            spent_query = spent_query.filter(Transaction.date <= period_end)
        
        spent = spent_query.scalar() or 0
        
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
            "percentage": progress.percentage,
            "period_start": period_start,
            "period_end": period_end
        },
        "category_breakdown": category_breakdown
    }


@router.get("/{budget_id}/summary")
def get_budget_summary(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    year: Optional[int] = None
):
    """Get a full-year budget summary grouped by the budget's frequency."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    if year is None:
        year = date.today().year

    category_ids = [bc.category_id for bc in budget.budget_categories]

    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    effective_start = budget.start_date if budget.start_date and budget.start_date > year_start else year_start
    effective_end = budget.end_date if budget.end_date and budget.end_date < year_end else year_end

    if effective_start > effective_end:
        return {
            "budget": {
                "id": budget.id,
                "name": budget.name,
                "amount": budget.amount,
                "period": budget.period,
                "start_date": budget.start_date,
                "end_date": budget.end_date,
            },
            "year": year,
            "periods": [],
            "year_total": {"budget_amount": 0, "spent": 0, "remaining": 0, "percentage": 0},
        }

    # Fetch all matching transactions for the effective range in one query
    tx_query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "expense",
        Transaction.date >= effective_start,
        Transaction.date <= effective_end,
    )
    if category_ids:
        tx_query = tx_query.filter(Transaction.category_id.in_(category_ids))

    all_transactions = tx_query.order_by(Transaction.date.desc()).all()

    # Generate periods and bucket transactions
    periods = _generate_year_periods(budget, effective_start, effective_end)

    period_data = []
    year_total_spent = 0
    year_total_budget = 0

    for p_start, p_end, label in periods:
        period_txs = [tx for tx in all_transactions if p_start <= tx.date <= p_end]
        spent = sum(float(tx.amount) for tx in period_txs)
        remaining = budget.amount - spent
        percentage = (spent / budget.amount * 100) if budget.amount > 0 else 0

        period_data.append({
            "period_start": p_start,
            "period_end": p_end,
            "label": label,
            "budget_amount": budget.amount,
            "spent": round(spent, 2),
            "remaining": round(remaining, 2),
            "percentage": round(percentage, 2),
            "transactions": [
                {
                    "id": tx.id,
                    "date": tx.date,
                    "description": tx.description,
                    "amount": tx.amount,
                    "category_id": tx.category_id,
                    "category_name": tx.category.name if tx.category else None,
                    "category_color": tx.category.color if tx.category else None,
                    "account_name": tx.account.name if tx.account else None,
                }
                for tx in period_txs
            ],
        })

        year_total_spent += spent
        year_total_budget += budget.amount

    year_pct = (year_total_spent / year_total_budget * 100) if year_total_budget > 0 else 0

    return {
        "budget": {
            "id": budget.id,
            "name": budget.name,
            "amount": budget.amount,
            "period": budget.period,
            "start_date": budget.start_date,
            "end_date": budget.end_date,
        },
        "year": year,
        "periods": period_data,
        "year_total": {
            "budget_amount": round(year_total_budget, 2),
            "spent": round(year_total_spent, 2),
            "remaining": round(year_total_budget - year_total_spent, 2),
            "percentage": round(year_pct, 2),
        },
    }


def _generate_year_periods(budget: Budget, effective_start: date, effective_end: date):
    """Generate (start, end, label) tuples for each period within the effective range."""
    periods = []

    if budget.period == "monthly":
        current = effective_start.replace(day=1)
        while current <= effective_end:
            month_start = max(current, effective_start)
            last_day = calendar.monthrange(current.year, current.month)[1]
            month_end = min(current.replace(day=last_day), effective_end)
            label = current.strftime("%B %Y")
            periods.append((month_start, month_end, label))
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)
    elif budget.period == "yearly":
        label = f"{effective_start.year}"
        if effective_start.year != effective_end.year:
            label = f"{effective_start.year} - {effective_end.year}"
        periods.append((effective_start, effective_end, label))
    else:
        label = f"{effective_start.strftime('%b %d, %Y')} - {effective_end.strftime('%b %d, %Y')}"
        periods.append((effective_start, effective_end, label))

    return periods


@router.get("/{budget_id}/transactions")
def get_budget_transactions(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 50
):
    """Get transactions for a budget within the current budget period."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    category_ids = [bc.category_id for bc in budget.budget_categories]
    period_start, period_end = get_period_dates(budget)
    
    query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "expense"
    )
    
    if category_ids:
        query = query.filter(Transaction.category_id.in_(category_ids))
    
    if period_start:
        query = query.filter(Transaction.date >= period_start)
    if period_end:
        query = query.filter(Transaction.date <= period_end)
    
    total = query.count()
    transactions = query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()
    
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
            "period": budget.period,
            "start_date": budget.start_date,
            "end_date": budget.end_date,
            "period_start": period_start,
            "period_end": period_end,
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


def get_period_dates(budget: Budget, reference_date: date = None) -> tuple:
    """Compute the current period's start/end dates based on the budget's frequency.
    
    For 'monthly': returns the first and last day of the reference month.
    For 'yearly': returns Jan 1 and Dec 31 of the reference year.
    For 'custom': returns the budget's own start_date and end_date.
    
    The reference date is clamped to the budget's date range so that
    expired or future budgets still return a meaningful period.
    """
    if reference_date is None:
        reference_date = date.today()

    if budget.period == 'custom':
        return budget.start_date, budget.end_date

    ref = reference_date
    if budget.start_date and ref < budget.start_date:
        ref = budget.start_date
    if budget.end_date and ref > budget.end_date:
        ref = budget.end_date

    if budget.period == 'monthly':
        period_start = ref.replace(day=1)
        last_day = calendar.monthrange(ref.year, ref.month)[1]
        period_end = ref.replace(day=last_day)
    elif budget.period == 'yearly':
        period_start = ref.replace(month=1, day=1)
        period_end = ref.replace(month=12, day=31)
    else:
        return budget.start_date, budget.end_date

    if budget.start_date and period_start < budget.start_date:
        period_start = budget.start_date
    if budget.end_date and period_end > budget.end_date:
        period_end = budget.end_date

    return period_start, period_end


def calculate_budget_progress(db: Session, budget: Budget) -> BudgetResponse:
    """Calculate budget progress with spending data for the current period."""
    category_ids = [bc.category_id for bc in budget.budget_categories]
    period_start, period_end = get_period_dates(budget)

    query = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id == budget.user_id,
        Transaction.type == "expense"
    )

    if category_ids:
        query = query.filter(Transaction.category_id.in_(category_ids))

    if period_start:
        query = query.filter(Transaction.date >= period_start)
    if period_end:
        query = query.filter(Transaction.date <= period_end)
    
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
        percentage=round(percentage, 2),
        period_start=period_start,
        period_end=period_end
    )