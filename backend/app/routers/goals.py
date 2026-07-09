from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date, timedelta

from app.database import get_db
from app.utils.security import get_current_user_authenticated as get_current_user
from app.schemas.goal import (
    GoalCreate,
    GoalUpdate,
    GoalResponse,
    GoalProgress,
    GoalTransactionCreate,
    GoalTransactionResponse,
    GoalSummary,
)
from app.models import User, FinancialGoal, GoalTransaction

router = APIRouter(prefix="/goals", tags=["Goals"])


@router.get("/", response_model=List[GoalResponse])
def get_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    status_filter: str = None,
):
    """Get all goals for current user."""
    query = db.query(FinancialGoal).filter(FinancialGoal.user_id == current_user.id)

    if status_filter:
        query = query.filter(FinancialGoal.status == status_filter)

    goals = query.order_by(FinancialGoal.created_at.desc()).all()

    # Calculate progress for each goal
    result = []
    for goal in goals:
        goal_data = calculate_goal_progress(db, goal, current_user.id)
        result.append(goal_data)

    return result


@router.get("/summary", response_model=GoalSummary)
def get_goals_summary(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Get overall goal summary."""
    goals = (
        db.query(FinancialGoal).filter(FinancialGoal.user_id == current_user.id).all()
    )

    active_goals = [g for g in goals if g.status == "active"]
    completed_goals = [g for g in goals if g.status == "completed"]

    total_target = sum(g.target_amount for g in goals)
    total_current = sum(g.current_amount for g in goals)

    return GoalSummary(
        total_goals=len(goals),
        active_goals=len(active_goals),
        completed_goals=len(completed_goals),
        total_target_amount=total_target,
        total_current_amount=total_current,
        overall_progress_percentage=(total_current / total_target * 100)
        if total_target > 0
        else 0,
    )


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    goal_data: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new financial goal."""
    # If setting as primary, unset other primary goals
    if goal_data.is_primary:
        db.query(FinancialGoal).filter(
            FinancialGoal.user_id == current_user.id, FinancialGoal.is_primary == True
        ).update({"is_primary": False})

    db_goal = FinancialGoal(user_id=current_user.id, **goal_data.model_dump())
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)

    return calculate_goal_progress(db, db_goal, current_user.id)


@router.get("/{goal_id}", response_model=GoalResponse)
def get_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get specific goal details."""
    goal = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found"
        )

    return calculate_goal_progress(db, goal, current_user.id)


@router.put("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: int,
    goal_data: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a goal."""
    goal = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found"
        )

    # If setting as primary, unset other primary goals
    if goal_data.is_primary:
        db.query(FinancialGoal).filter(
            FinancialGoal.user_id == current_user.id,
            FinancialGoal.is_primary == True,
            FinancialGoal.id != goal_id,
        ).update({"is_primary": False})

    update_data = goal_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(goal, field, value)

    db.commit()
    db.refresh(goal)

    return calculate_goal_progress(db, goal, current_user.id)


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a goal."""
    goal = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found"
        )

    db.delete(goal)
    db.commit()

    return {"message": "Goal deleted successfully"}


@router.post("/{goal_id}/transactions", response_model=GoalTransactionResponse)
def add_goal_transaction(
    goal_id: int,
    tx_data: GoalTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add contribution or withdrawal to a goal."""
    goal = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found"
        )

    # Create goal transaction
    goal_tx = GoalTransaction(
        goal_id=goal_id, user_id=current_user.id, **tx_data.model_dump()
    )
    db.add(goal_tx)

    # Update goal current amount
    if tx_data.type == "contribution":
        goal.current_amount += tx_data.amount
    else:  # withdrawal
        goal.current_amount -= tx_data.amount

    # Check if goal is completed
    if goal.current_amount >= goal.target_amount and goal.status == "active":
        goal.status = "completed"
        goal.completed_at = date.today()

    db.commit()
    db.refresh(goal_tx)

    return goal_tx


@router.get("/{goal_id}/transactions", response_model=List[GoalTransactionResponse])
def get_goal_transactions(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """Get transactions for a goal."""
    goal = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found"
        )

    transactions = (
        db.query(GoalTransaction)
        .filter(GoalTransaction.goal_id == goal_id)
        .order_by(GoalTransaction.date.desc())
        .limit(limit)
        .all()
    )

    return transactions


@router.get("/{goal_id}/progress", response_model=GoalProgress)
def get_goal_progress(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get detailed progress for a goal."""
    goal = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found"
        )

    progress = calculate_goal_progress(db, goal, current_user.id)

    # Calculate average monthly contribution
    thirty_days_ago = date.today() - timedelta(days=30)
    recent_contributions = (
        db.query(func.sum(GoalTransaction.amount))
        .filter(
            GoalTransaction.goal_id == goal_id,
            GoalTransaction.type == "contribution",
            GoalTransaction.date >= thirty_days_ago,
        )
        .scalar()
        or 0
    )

    avg_monthly = float(recent_contributions)

    return GoalProgress(
        goal_id=goal.id,
        goal_name=goal.name,
        current_amount=goal.current_amount,
        target_amount=goal.target_amount,
        progress_percentage=progress.progress_percentage,
        remaining_amount=progress.remaining_amount,
        days_remaining=progress.days_remaining,
        monthly_contribution_needed=progress.monthly_contribution_needed,
        estimated_completion_date=progress.estimated_completion_date,
        on_track=(progress.monthly_contribution_needed or 0) <= avg_monthly
        if goal.target_date
        else True,
        average_monthly_contribution=avg_monthly,
    )


def calculate_goal_progress(
    db: Session, goal: FinancialGoal, user_id: int
) -> GoalResponse:
    """Calculate progress metrics for a goal."""
    progress_percentage = (
        (goal.current_amount / goal.target_amount * 100)
        if goal.target_amount > 0
        else 0
    )
    remaining_amount = goal.target_amount - goal.current_amount

    days_remaining = None
    monthly_contribution_needed = None
    estimated_completion_date = None

    if goal.target_date:
        days_remaining = (goal.target_date - date.today()).days

        if days_remaining > 0:
            months_remaining = days_remaining / 30.0
            monthly_contribution_needed = (
                remaining_amount / months_remaining if months_remaining > 0 else None
            )
        else:
            monthly_contribution_needed = None

    # Estimate completion date based on average contribution
    # Get contributions from last 90 days
    ninety_days_ago = date.today() - timedelta(days=90)
    recent_total = (
        db.query(func.sum(GoalTransaction.amount))
        .filter(
            GoalTransaction.goal_id == goal.id,
            GoalTransaction.type == "contribution",
            GoalTransaction.date >= ninety_days_ago,
        )
        .scalar()
        or 0
    )

    if recent_total > 0 and remaining_amount > 0:
        monthly_avg = float(recent_total) / 3  # 90 days = 3 months
        if monthly_avg > 0:
            months_to_complete = remaining_amount / monthly_avg
            estimated_completion_date = date.today() + timedelta(
                days=int(months_to_complete * 30)
            )

    return GoalResponse(
        id=goal.id,
        user_id=goal.user_id,
        name=goal.name,
        description=goal.description,
        target_amount=goal.target_amount,
        current_amount=goal.current_amount,
        currency=goal.currency,
        category=goal.category,
        icon=goal.icon,
        color=goal.color,
        target_date=goal.target_date,
        created_at=goal.created_at,
        completed_at=goal.completed_at,
        status=goal.status,
        is_primary=goal.is_primary,
        linked_budget_id=goal.linked_budget_id,
        linked_account_id=goal.linked_account_id,
        progress_percentage=round(progress_percentage, 2),
        remaining_amount=remaining_amount,
        days_remaining=days_remaining
        if days_remaining and days_remaining > 0
        else None,
        monthly_contribution_needed=round(monthly_contribution_needed, 2)
        if monthly_contribution_needed
        else None,
        estimated_completion_date=estimated_completion_date,
    )
