# Personal Finance - New Features Implementation Plan

## Overview

This document outlines the implementation plan for five major features to enhance the Personal Finance Management System:

1. **Financial Goals System** - Track and achieve financial goals
2. **Cash Flow Forecasting** - Predict future account balances
3. **Smart Spending Insights** - Automated financial insights
4. **Debt Tracking & Payoff Planner** - Manage and eliminate debt
5. **Auto-Categorization Engine** - Intelligent transaction categorization

---

# Feature 1: Financial Goals System

## Feature Overview

A comprehensive goal-tracking system that allows users to set, monitor, and achieve their financial objectives. Users can create multiple goals (emergency fund, vacation, major purchases, etc.), track progress, and receive intelligent recommendations.

### User Stories

- As a user, I want to create savings goals with specific target amounts and deadlines
- As a user, I want to track my progress toward each goal with visual indicators
- As a user, I want to link specific transactions to goals (contributions/withdrawals)
- As a user, I want to see "time to goal" estimates based on current saving rate
- As a user, I want to link budgets to specific goals
- As a user, I want to see goal projections and "what if" scenarios
- As a user, I want to receive notifications when I reach milestones

---

## Database Schema

### New Table: `financial_goals`

```sql
CREATE TABLE financial_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    target_amount DECIMAL(15,2) NOT NULL,
    current_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'EUR',
    category VARCHAR(50), -- 'emergency_fund', 'vacation', 'car', 'home', 'education', 'other'
    icon VARCHAR(50), -- icon identifier for UI
    color VARCHAR(7), -- hex color for progress bar
    
    -- Timeline
    target_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
    is_primary BOOLEAN DEFAULT FALSE, -- primary savings goal
    
    -- Linked items
    linked_budget_id INTEGER, -- optional budget link
    linked_account_id INTEGER, -- optional: track against specific account
    
    -- Progress tracking
    auto_track_from_account BOOLEAN DEFAULT FALSE, -- auto-add from account balance
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (linked_budget_id) REFERENCES budgets(id),
    FOREIGN KEY (linked_account_id) REFERENCES accounts(id)
);
```

### New Table: `goal_transactions`

```sql
CREATE TABLE goal_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    
    -- Source
    transaction_id INTEGER, -- link to actual transaction (optional)
    amount DECIMAL(15,2) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'contribution', 'withdrawal'
    
    -- Metadata
    description TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (goal_id) REFERENCES financial_goals(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

### Migration File

**File**: `backend/alembic/versions/xxx_add_financial_goals.py`

```python
"""add financial goals tables

Revision ID: xxx
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        'financial_goals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('target_amount', sa.Float(), nullable=False),
        sa.Column('current_amount', sa.Float(), server_default='0'),
        sa.Column('currency', sa.String(3), server_default='EUR'),
        sa.Column('category', sa.String(50)),
        sa.Column('icon', sa.String(50)),
        sa.Column('color', sa.String(7)),
        sa.Column('target_date', sa.Date()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime()),
        sa.Column('status', sa.String(20), server_default='active'),
        sa.Column('is_primary', sa.Boolean(), server_default='0'),
        sa.Column('linked_budget_id', sa.Integer()),
        sa.Column('linked_account_id', sa.Integer()),
        sa.Column('auto_track_from_account', sa.Boolean(), server_default='0'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['linked_budget_id'], ['budgets.id']),
        sa.ForeignKeyConstraint(['linked_account_id'], ['accounts.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table(
        'goal_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('transaction_id', sa.Integer()),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['goal_id'], ['financial_goals.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('ix_financial_goals_user_id', 'financial_goals', ['user_id'])
    op.create_index('ix_goal_transactions_goal_id', 'goal_transactions', ['goal_id'])

def downgrade():
    op.drop_table('goal_transactions')
    op.drop_table('financial_goals')
```

---

## Backend Implementation

### Model

**File**: `backend/app/models/goal.py`

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class FinancialGoal(Base):
    """Financial goal tracking model."""
    __tablename__ = "financial_goals"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0)
    currency = Column(String(3), default='EUR')
    category = Column(String(50))
    icon = Column(String(50))
    color = Column(String(7))
    
    target_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    
    status = Column(String(20), default='active')
    is_primary = Column(Boolean, default=False)
    
    linked_budget_id = Column(Integer, ForeignKey("budgets.id"))
    linked_account_id = Column(Integer, ForeignKey("accounts.id"))
    auto_track_from_account = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", back_populates="goals")
    goal_transactions = relationship("GoalTransaction", back_populates="goal", cascade="all, delete-orphan")
    linked_budget = relationship("Budget", foreign_keys=[linked_budget_id])
    linked_account = relationship("Account", foreign_keys=[linked_account_id])


class GoalTransaction(Base):
    """Track contributions and withdrawals from goals."""
    __tablename__ = "goal_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("financial_goals.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)
    
    description = Column(Text)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    goal = relationship("FinancialGoal", back_populates="goal_transactions")
    user = relationship("User")
    transaction = relationship("Transaction")
```

**Update**: `backend/app/models/__init__.py`

```python
from app.models.goal import FinancialGoal, GoalTransaction
# Add to __all__
```

**Update**: `backend/app/models/user.py`

```python
# Add to User model
goals = relationship("FinancialGoal", back_populates="user")
```

### Schemas

**File**: `backend/app/schemas/goal.py`

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class GoalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    target_amount: float = Field(..., gt=0)
    currency: str = Field(default='EUR', min_length=3, max_length=3)
    category: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    target_date: Optional[date] = None
    is_primary: bool = False
    linked_budget_id: Optional[int] = None
    linked_account_id: Optional[int] = None
    auto_track_from_account: bool = False


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    target_amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = None
    category: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None
    is_primary: Optional[bool] = None
    linked_budget_id: Optional[int] = None
    linked_account_id: Optional[int] = None


class GoalTransactionBase(BaseModel):
    amount: float = Field(..., gt=0)
    type: str = Field(..., pattern="^(contribution|withdrawal)$")
    description: Optional[str] = None
    date: date
    transaction_id: Optional[int] = None


class GoalTransactionCreate(GoalTransactionBase):
    pass


class GoalTransactionResponse(GoalTransactionBase):
    id: int
    goal_id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class GoalResponse(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str]
    target_amount: float
    current_amount: float
    currency: str
    category: Optional[str]
    icon: Optional[str]
    color: Optional[str]
    target_date: Optional[date]
    created_at: datetime
    completed_at: Optional[datetime]
    status: str
    is_primary: bool
    linked_budget_id: Optional[int]
    linked_account_id: Optional[int]
    
    # Computed fields
    progress_percentage: float = 0.0
    remaining_amount: float = 0.0
    days_remaining: Optional[int] = None
    monthly_contribution_needed: Optional[float] = None
    estimated_completion_date: Optional[date] = None
    
    class Config:
        from_attributes = True


class GoalProgress(BaseModel):
    goal_id: int
    goal_name: str
    current_amount: float
    target_amount: float
    progress_percentage: float
    remaining_amount: float
    days_remaining: Optional[int]
    monthly_contribution_needed: Optional[float]
    estimated_completion_date: Optional[date]
    on_track: bool
    average_monthly_contribution: float


class GoalSummary(BaseModel):
    total_goals: int
    active_goals: int
    completed_goals: int
    total_target_amount: float
    total_current_amount: float
    overall_progress_percentage: float


### API Endpoints

**File**: `backend/app/routers/goals.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date, timedelta

from app.database import get_db
from app.utils.security import get_current_user
from app.schemas.goal import (
    GoalCreate, GoalUpdate, GoalResponse, GoalProgress,
    GoalTransactionCreate, GoalTransactionResponse, GoalSummary
)
from app.models import User, FinancialGoal, GoalTransaction

router = APIRouter(prefix="/goals", tags=["Goals"])


@router.get("/", response_model=List[GoalResponse])
def get_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    status_filter: str = None
):
    """Get all goals for current user."""
    query = db.query(FinancialGoal).filter(
        FinancialGoal.user_id == current_user.id
    )
    
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get overall goal summary."""
    goals = db.query(FinancialGoal).filter(
        FinancialGoal.user_id == current_user.id
    ).all()
    
    active_goals = [g for g in goals if g.status == 'active']
    completed_goals = [g for g in goals if g.status == 'completed']
    
    total_target = sum(g.target_amount for g in goals)
    total_current = sum(g.current_amount for g in goals)
    
    return GoalSummary(
        total_goals=len(goals),
        active_goals=len(active_goals),
        completed_goals=len(completed_goals),
        total_target_amount=total_target,
        total_current_amount=total_current,
        overall_progress_percentage=(total_current / total_target * 100) if total_target > 0 else 0
    )


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    goal_data: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new financial goal."""
    # If setting as primary, unset other primary goals
    if goal_data.is_primary:
        db.query(FinancialGoal).filter(
            FinancialGoal.user_id == current_user.id,
            FinancialGoal.is_primary == True
        ).update({"is_primary": False})
    
    db_goal = FinancialGoal(
        user_id=current_user.id,
        **goal_data.model_dump()
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    
    return calculate_goal_progress(db, db_goal, current_user.id)


@router.get("/{goal_id}", response_model=GoalResponse)
def get_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific goal details."""
    goal = db.query(FinancialGoal).filter(
        FinancialGoal.id == goal_id,
        FinancialGoal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    return calculate_goal_progress(db, goal, current_user.id)


@router.put("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: int,
    goal_data: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a goal."""
    goal = db.query(FinancialGoal).filter(
        FinancialGoal.id == goal_id,
        FinancialGoal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    # If setting as primary, unset other primary goals
    if goal_data.is_primary:
        db.query(FinancialGoal).filter(
            FinancialGoal.user_id == current_user.id,
            FinancialGoal.is_primary == True,
            FinancialGoal.id != goal_id
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
    db: Session = Depends(get_db)
):
    """Delete a goal."""
    goal = db.query(FinancialGoal).filter(
        FinancialGoal.id == goal_id,
        FinancialGoal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    db.delete(goal)
    db.commit()
    
    return {"message": "Goal deleted successfully"}


@router.post("/{goal_id}/transactions", response_model=GoalTransactionResponse)
def add_goal_transaction(
    goal_id: int,
    tx_data: GoalTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add contribution or withdrawal to a goal."""
    goal = db.query(FinancialGoal).filter(
        FinancialGoal.id == goal_id,
        FinancialGoal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    # Create goal transaction
    goal_tx = GoalTransaction(
        goal_id=goal_id,
        user_id=current_user.id,
        **tx_data.model_dump()
    )
    db.add(goal_tx)
    
    # Update goal current amount
    if tx_data.type == 'contribution':
        goal.current_amount += tx_data.amount
    else:  # withdrawal
        goal.current_amount -= tx_data.amount
    
    # Check if goal is completed
    if goal.current_amount >= goal.target_amount and goal.status == 'active':
        goal.status = 'completed'
        goal.completed_at = date.today()
    
    db.commit()
    db.refresh(goal_tx)
    
    return goal_tx


@router.get("/{goal_id}/transactions", response_model=List[GoalTransactionResponse])
def get_goal_transactions(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50
):
    """Get transactions for a goal."""
    goal = db.query(FinancialGoal).filter(
        FinancialGoal.id == goal_id,
        FinancialGoal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    transactions = db.query(GoalTransaction).filter(
        GoalTransaction.goal_id == goal_id
    ).order_by(GoalTransaction.date.desc()).limit(limit).all()
    
    return transactions


@router.get("/{goal_id}/progress", response_model=GoalProgress)
def get_goal_progress(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed progress for a goal."""
    goal = db.query(FinancialGoal).filter(
        FinancialGoal.id == goal_id,
        FinancialGoal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    progress = calculate_goal_progress(db, goal, current_user.id)
    
    # Calculate average monthly contribution
    thirty_days_ago = date.today() - timedelta(days=30)
    recent_contributions = db.query(func.sum(GoalTransaction.amount)).filter(
        GoalTransaction.goal_id == goal_id,
        GoalTransaction.type == 'contribution',
        GoalTransaction.date >= thirty_days_ago
    ).scalar() or 0
    
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
        on_track=(progress.monthly_contribution_needed or 0) <= avg_monthly if goal.target_date else True,
        average_monthly_contribution=avg_monthly
    )


def calculate_goal_progress(db: Session, goal: FinancialGoal, user_id: int) -> GoalResponse:
    """Calculate progress metrics for a goal."""
    progress_percentage = (goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0
    remaining_amount = goal.target_amount - goal.current_amount
    
    days_remaining = None
    monthly_contribution_needed = None
    estimated_completion_date = None
    
    if goal.target_date:
        days_remaining = (goal.target_date - date.today()).days
        
        if days_remaining > 0:
            months_remaining = days_remaining / 30.0
            monthly_contribution_needed = remaining_amount / months_remaining if months_remaining > 0 else None
        else:
            monthly_contribution_needed = None
    
    # Estimate completion date based on average contribution
    # Get contributions from last 90 days
    ninety_days_ago = date.today() - timedelta(days=90)
    recent_total = db.query(func.sum(GoalTransaction.amount)).filter(
        GoalTransaction.goal_id == goal.id,
        GoalTransaction.type == 'contribution',
        GoalTransaction.date >= ninety_days_ago
    ).scalar() or 0
    
    if recent_total > 0 and remaining_amount > 0:
        monthly_avg = float(recent_total) / 3  # 90 days = 3 months
        if monthly_avg > 0:
            months_to_complete = remaining_amount / monthly_avg
            estimated_completion_date = date.today() + timedelta(days=int(months_to_complete * 30))
    
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
        days_remaining=days_remaining if days_remaining and days_remaining > 0 else None,
        monthly_contribution_needed=round(monthly_contribution_needed, 2) if monthly_contribution_needed else None,
        estimated_completion_date=estimated_completion_date
    )
```

### Frontend Implementation

#### New Page: `frontend/public/pages/goals.html`

Create a comprehensive goals management page with:

1. **Goal Overview Cards** - Display active goals with progress bars
2. **Create Goal Modal** - Form to add new goals with target amount, date, and category
3. **Goal Detail View** - Detailed progress, contributions history, and projections
4. **Quick Contribution** - Add contributions directly from the goal view
5. **Goal Summary Widget** - Dashboard widget showing overall goal progress

Key UI Components:
```javascript
// Goal card component showing progress
function renderGoalCard(goal) {
    const percentage = goal.progress_percentage;
    const color = goal.color || 'primary';
    
    return `
        <div class="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow">
            <div class="card-body">
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-${color} text-${color}-content flex items-center justify-center">
                            ${goal.icon || '🎯'}
                        </div>
                        <div>
                            <h3 class="font-bold text-lg">${goal.name}</h3>
                            <p class="text-sm text-base-content/60">${goal.category || 'General'}</p>
                        </div>
                    </div>
                    ${goal.is_primary ? '<span class="badge badge-primary">Primary</span>' : ''}
                </div>
                
                <div class="mt-4">
                    <div class="flex justify-between text-sm mb-1">
                        <span>${formatCurrency(goal.current_amount)}</span>
                        <span>${formatCurrency(goal.target_amount)}</span>
                    </div>
                    <progress class="progress progress-${percentage > 90 ? 'success' : 'primary'} w-full" 
                              value="${percentage}" max="100"></progress>
                    <p class="text-xs text-base-content/60 mt-1">${percentage}% complete</p>
                </div>
                
                ${goal.monthly_contribution_needed ? `
                    <div class="alert alert-info mt-4 text-sm">
                        <span>Save ${formatCurrency(goal.monthly_contribution_needed)}/month to reach by ${formatDate(goal.target_date)}</span>
                    </div>
                ` : ''}
                
                <div class="card-actions justify-end mt-4">
                    <button onclick="showContributeModal(${goal.id})" class="btn btn-sm btn-primary">
                        Contribute
                    </button>
                    <button onclick="showGoalDetails(${goal.id})" class="btn btn-sm btn-ghost">
                        Details
                    </button>
                </div>
            </div>
        </div>
    `;
}
```

#### Update Dashboard

Add goals widget to the dashboard:

```javascript
// In dashboard.js - Add to loadDashboardData()
async function loadGoalsOverview() {
    try {
        const goals = await API.goals.list({ status_filter: 'active' });
        const container = document.getElementById('goals-overview');
        
        if (!goals || goals.length === 0) {
            container.innerHTML = `
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title mb-4">Financial Goals</h2>
                        <p class="text-base-content/60">No active goals. Create your first goal to start saving!</p>
                        <div class="card-actions justify-end mt-4">
                            <a href="goals.html" class="btn btn-sm btn-primary">Create Goal</a>
                        </div>
                    </div>
                </div>
            `;
            return;
        }
        
        // Show top 3 goals
        const activeGoals = goals.slice(0, 3);
        
        container.innerHTML = `
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h2 class="card-title mb-4">Financial Goals</h2>
                    <div class="space-y-4">
                        ${activeGoals.map(goal => `
                            <div class="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
                                <div class="text-2xl">${goal.icon || '🎯'}</div>
                                <div class="flex-1">
                                    <div class="flex justify-between items-center">
                                        <span class="font-medium">${goal.name}</span>
                                        <span class="text-sm">${Math.round(goal.progress_percentage)}%</span>
                                    </div>
                                    <progress class="progress progress-primary w-full" 
                                              value="${goal.progress_percentage}" max="100"></progress>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="card-actions justify-end mt-4">
                        <a href="goals.html" class="btn btn-sm btn-ghost">View All Goals</a>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading goals overview:', error);
    }
}
```

---

## Implementation Steps

### Phase 1: Backend Foundation

1. **Create migration file**
   ```bash
   cd backend
   alembic revision --autogenerate -m "add financial goals"
   ```

2. **Create models**
   - Create `backend/app/models/goal.py`
   - Update `backend/app/models/__init__.py`
   - Update `backend/app/models/user.py`

3. **Create schemas**
   - Create `backend/app/schemas/goal.py`

4. **Create router**
   - Create `backend/app/routers/goals.py`

5. **Register router**
   - Update `backend/app/main.py` to include goals router

6. **Run migrations**
   ```bash
   alembic upgrade head
   ```

### Phase 2: Frontend Implementation

1. **Create goals page**
   - Create `frontend/public/pages/goals.html`
   - Create `frontend/public/js/pages/goals.js`

2. **Update API client**
   - Add goals endpoints to `frontend/public/js/api.js`

3. **Update dashboard**
   - Add goals widget to dashboard

4. **Add navigation**
   - Update sidebar to include Goals link

### Phase 3: Testing

1. Test CRUD operations for goals
2. Test goal transactions (contributions/withdrawals)
3. Test progress calculations
4. Test edge cases (completed goals, over-contributions)

---

# Feature 2: Cash Flow Forecasting

## Feature Overview

A predictive analytics feature that forecasts future account balances based on recurring transactions and historical patterns. Helps users anticipate cash shortages and plan accordingly.

### User Stories

- As a user, I want to see my projected account balance for the next 30/60/90 days
- As a user, I want to identify upcoming bills and recurring payments
- As a user, I want to receive warnings when my account might go negative
- As a user, I want to see the impact of a planned expense on my future balance
- As a user, I want to visualize cash flow trends on a calendar or timeline

---

## Database Schema

### New Table: `recurring_transactions`

```sql
CREATE TABLE recurring_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- Transaction details
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'income', 'expense'
    category_id INTEGER,
    account_id INTEGER NOT NULL,
    
    -- Recurrence pattern
    frequency VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly', 'custom'
    interval INTEGER DEFAULT 1, -- every N days/weeks/months
    
    -- Schedule
    start_date DATE NOT NULL,
    end_date DATE, -- optional end date
    next_due_date DATE NOT NULL,
    
    -- Optional: day of month/week
    day_of_month INTEGER, -- 1-31 for monthly
    day_of_week INTEGER, -- 0-6 for weekly
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_bill BOOLEAN DEFAULT FALSE, -- mark as bill for bill reminders
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_recurring_user ON recurring_transactions(user_id);
CREATE INDEX idx_recurring_next_due ON recurring_transactions(next_due_date);
CREATE INDEX idx_recurring_active ON recurring_transactions(is_active);
```

### Migration File

**File**: `backend/alembic/versions/xxx_add_recurring_transactions.py`

```python
"""add recurring transactions

Revision ID: xxx
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        'recurring_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(255), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('category_id', sa.Integer()),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('frequency', sa.String(20), nullable=False),
        sa.Column('interval', sa.Integer(), server_default='1'),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date()),
        sa.Column('next_due_date', sa.Date(), nullable=False),
        sa.Column('day_of_month', sa.Integer()),
        sa.Column('day_of_week', sa.Integer()),
        sa.Column('is_active', sa.Boolean(), server_default='1'),
        sa.Column('is_bill', sa.Boolean(), server_default='0'),
        sa.Column('notes', sa.Text()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('idx_recurring_user', 'recurring_transactions', ['user_id'])
    op.create_index('idx_recurring_next_due', 'recurring_transactions', ['next_due_date'])
    op.create_index('idx_recurring_active', 'recurring_transactions', ['is_active'])

def downgrade():
    op.drop_table('recurring_transactions')
```

---

## Backend Implementation

### Model

**File**: `backend/app/models/recurring.py`

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class RecurringTransaction(Base):
    """Recurring transaction model for bills and regular income/expenses."""
    __tablename__ = "recurring_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Transaction details
    description = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)  # income, expense
    category_id = Column(Integer, ForeignKey("categories.id"))
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    
    # Recurrence pattern
    frequency = Column(String(20), nullable=False)  # daily, weekly, monthly, yearly
    interval = Column(Integer, default=1)
    
    # Schedule
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    next_due_date = Column(Date, nullable=False)
    
    # Optional scheduling
    day_of_month = Column(Integer)  # 1-31
    day_of_week = Column(Integer)   # 0-6
    
    # Status
    is_active = Column(Boolean, default=True)
    is_bill = Column(Boolean, default=False)
    
    # Metadata
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="recurring_transactions")
    category = relationship("Category")
    account = relationship("Account")
```

**Update**: `backend/app/models/__init__.py`

```python
from app.models.recurring import RecurringTransaction
# Add to __all__
```

**Update**: `backend/app/models/user.py`

```python
# Add to User model
recurring_transactions = relationship("RecurringTransaction", back_populates="user")
```

### Schemas

**File**: `backend/app/schemas/recurring.py`

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class RecurringTransactionBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    amount: float = Field(..., gt=0)
    type: str = Field(..., pattern="^(income|expense)$")
    category_id: Optional[int] = None
    account_id: int
    frequency: str = Field(..., pattern="^(daily|weekly|monthly|yearly|custom)$")
    interval: int = Field(default=1, ge=1)
    start_date: date
    end_date: Optional[date] = None
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    is_bill: bool = False
    notes: Optional[str] = None


class RecurringTransactionCreate(RecurringTransactionBase):
    pass


class RecurringTransactionUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    amount: Optional[float] = Field(None, gt=0)
    type: Optional[str] = Field(None, pattern="^(income|expense)$")
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    frequency: Optional[str] = Field(None, pattern="^(daily|weekly|monthly|yearly|custom)$")
    interval: Optional[int] = Field(None, ge=1)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    is_bill: Optional[bool] = None
    notes: Optional[str] = None


class RecurringTransactionResponse(RecurringTransactionBase):
    id: int
    user_id: int
    next_due_date: date
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CashflowForecast(BaseModel):
    """Forecast data for a specific date."""
    date: date
    projected_balance: float
    recurring_income: float
    recurring_expenses: float
    net_flow: float
    events: List[dict]


class CashflowProjection(BaseModel):
    """Overall cashflow projection response."""
    account_id: int
    account_name: str
    current_balance: float
    forecast_period_days: int
    daily_forecasts: List[CashflowForecast]
    
    # Summary statistics
    lowest_balance: float
    lowest_balance_date: Optional[date]
    highest_balance: float
    highest_balance_date: Optional[date]
    
    # Risk analysis
    risk_days: List[date]
    warnings: List[str]


class UpcomingBill(BaseModel):
    """Upcoming bill reminder."""
    id: int
    description: str
    amount: float
    due_date: date
    days_until_due: int
    account_name: str
    category_name: Optional[str]


### API Endpoints

**File**: `backend/app/routers/recurring.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

from app.database import get_db
from app.utils.security import get_current_user
from app.schemas.recurring import (
    RecurringTransactionCreate, RecurringTransactionUpdate,
    RecurringTransactionResponse, CashflowProjection, UpcomingBill
)
from app.models import User, RecurringTransaction, Account

router = APIRouter(prefix="/recurring", tags=["Recurring"])


@router.get("/", response_model=List[RecurringTransactionResponse])
def get_recurring_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    active_only: bool = True
):
    """Get all recurring transactions for user."""
    query = db.query(RecurringTransaction).filter(
        RecurringTransaction.user_id == current_user.id
    )
    
    if active_only:
        query = query.filter(RecurringTransaction.is_active == True)
    
    return query.order_by(RecurringTransaction.next_due_date).all()


@router.post("/", response_model=RecurringTransactionResponse, status_code=status.HTTP_201_CREATED)
def create_recurring_transaction(
    tx_data: RecurringTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new recurring transaction."""
    # Calculate next due date if not provided
    next_due = calculate_next_due_date(tx_data.start_date, tx_data.frequency, tx_data.interval)
    
    db_tx = RecurringTransaction(
        user_id=current_user.id,
        next_due_date=next_due,
        **tx_data.model_dump()
    )
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    
    return db_tx


@router.get("/upcoming-bills", response_model=List[UpcomingBill])
def get_upcoming_bills(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get upcoming bills for the next N days."""
    end_date = date.today() + timedelta(days=days)
    
    bills = db.query(RecurringTransaction).filter(
        RecurringTransaction.user_id == current_user.id,
        RecurringTransaction.is_active == True,
        RecurringTransaction.is_bill == True,
        RecurringTransaction.next_due_date <= end_date
    ).order_by(RecurringTransaction.next_due_date).all()
    
    result = []
    for bill in bills:
        result.append(UpcomingBill(
            id=bill.id,
            description=bill.description,
            amount=bill.amount,
            due_date=bill.next_due_date,
            days_until_due=(bill.next_due_date - date.today()).days,
            account_name=bill.account.name if bill.account else 'Unknown',
            category_name=bill.category.name if bill.category else None
        ))
    
    return result


@router.get("/cashflow-forecast")
def get_cashflow_forecast(
    account_id: Optional[int] = None,
    days: int = 90,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate cash flow forecast for an account or all accounts."""
    
    if account_id:
        # Forecast single account
        account = db.query(Account).filter(
            Account.id == account_id,
            Account.user_id == current_user.id
        ).first()
        
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        
        return generate_account_forecast(db, account, days)
    else:
        # Forecast all accounts
        accounts = db.query(Account).filter(
            Account.user_id == current_user.id,
            Account.is_active == True
        ).all()
        
        return [generate_account_forecast(db, acc, days) for acc in accounts]


def calculate_next_due_date(start_date: date, frequency: str, interval: int) -> date:
    """Calculate the next due date based on frequency."""
    today = date.today()
    
    if frequency == 'daily':
        return today + timedelta(days=interval)
    elif frequency == 'weekly':
        return today + timedelta(weeks=interval)
    elif frequency == 'monthly':
        return today + relativedelta(months=interval)
    elif frequency == 'yearly':
        return today + relativedelta(years=interval)
    else:
        return today + timedelta(days=interval)


def generate_account_forecast(db: Session, account: Account, days: int) -> CashflowProjection:
    """Generate cash flow forecast for an account."""
    
    # Get current balance
    current_balance = account.balance or 0
    
    # Get active recurring transactions for this account
    recurring = db.query(RecurringTransaction).filter(
        RecurringTransaction.account_id == account.id,
        RecurringTransaction.is_active == True
    ).all()
    
    # Generate daily forecasts
    daily_forecasts = []
    balance = current_balance
    lowest_balance = current_balance
    highest_balance = current_balance
    lowest_date = date.today()
    highest_date = date.today()
    risk_days = []
    warnings = []
    
    for i in range(days):
        forecast_date = date.today() + timedelta(days=i)
        
        # Find recurring transactions for this date
        day_events = []
        day_income = 0
        day_expenses = 0
        
        for rec in recurring:
            if is_due_on_date(rec, forecast_date):
                day_events.append({
                    'id': rec.id,
                    'description': rec.description,
                    'amount': rec.amount,
                    'type': rec.type
                })
                
                if rec.type == 'income':
                    day_income += rec.amount
                else:
                    day_expenses += rec.amount
                
                # Update next due date
                rec.next_due_date = calculate_next_due_date(
                    forecast_date, rec.frequency, rec.interval
                )
        
        net_flow = day_income - day_expenses
        balance += net_flow
        
        # Track highs and lows
        if balance < lowest_balance:
            lowest_balance = balance
            lowest_date = forecast_date
        if balance > highest_balance:
            highest_balance = balance
            highest_date = forecast_date
        
        # Check for risk
        if balance < 0:
            risk_days.append(forecast_date)
            if len(risk_days) == 1:
                warnings.append(f"Account may go negative on {forecast_date}")
        
        daily_forecasts.append(CashflowForecast(
            date=forecast_date,
            projected_balance=round(balance, 2),
            recurring_income=day_income,
            recurring_expenses=day_expenses,
            net_flow=net_flow,
            events=day_events
        ))
    
    if lowest_balance < 0:
        warnings.append(f"Lowest projected balance: €{lowest_balance:.2f} on {lowest_date}")
    
    return CashflowProjection(
        account_id=account.id,
        account_name=account.name,
        current_balance=current_balance,
        forecast_period_days=days,
        daily_forecasts=daily_forecasts,
        lowest_balance=lowest_balance,
        lowest_balance_date=lowest_date if lowest_balance < current_balance else None,
        highest_balance=highest_balance,
        highest_balance_date=highest_date if highest_balance > current_balance else None,
        risk_days=risk_days,
        warnings=warnings
    )


def is_due_on_date(recurring: RecurringTransaction, check_date: date) -> bool:
    """Check if a recurring transaction is due on a specific date."""
    
    # Check if past end date
    if recurring.end_date and check_date > recurring.end_date:
        return False
    
    # Check if before start date
    if check_date < recurring.start_date:
        return False
    
    # Check frequency-based recurrence
    if recurring.frequency == 'daily':
        days_diff = (check_date - recurring.start_date).days
        return days_diff % recurring.interval == 0
    
    elif recurring.frequency == 'weekly':
        if recurring.day_of_week is not None:
            return check_date.weekday() == recurring.day_of_week
        else:
            weeks_diff = (check_date - recurring.start_date).days // 7
            return weeks_diff % recurring.interval == 0
    
    elif recurring.frequency == 'monthly':
        if recurring.day_of_month is not None:
            return check_date.day == recurring.day_of_month
        else:
            # Check if same day of month as start date
            months_diff = (check_date.year - recurring.start_date.year) * 12 + \
                         (check_date.month - recurring.start_date.month)
            return months_diff % recurring.interval == 0 and \
                   check_date.day == recurring.start_date.day
    
    elif recurring.frequency == 'yearly':
        return check_date.month == recurring.start_date.month and \
               check_date.day == recurring.start_date.day
    
    return False
```

---

# Feature 3: Smart Spending Insights

## Feature Overview

An intelligent analytics engine that automatically detects spending patterns, anomalies, and trends. Provides actionable insights to help users understand their financial behavior and make better decisions.

### User Stories

- As a user, I want to receive automated insights about my spending patterns
- As a user, I want to be alerted to unusual spending or potential issues
- As a user, I want to see month-over-month and year-over-year comparisons
- As a user, I want to identify my top spending categories and trends
- As a user, I want personalized recommendations for saving money

---

## Backend Implementation

### Service

**File**: `backend/app/services/insights_service.py`

```python
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.models import User, Transaction, Category, UserInsight, Budget


class InsightsService:
    """Generate intelligent financial insights."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def generate_insights(self, user_id: int) -> List[UserInsight]:
        """Generate all insights for a user."""
        insights = []
        
        insights.extend(self._check_spending_increases(user_id))
        insights.extend(self._check_budget_status(user_id))
        insights.extend(self._check_savings_opportunities(user_id))
        insights.extend(self._detect_anomalies(user_id))
        
        return insights
    
    def _check_spending_increases(self, user_id: int) -> List[UserInsight]:
        """Detect categories with significant spending increases."""
        insights = []
        
        # Get current month spending by category
        current_month = date.today().replace(day=1)
        last_month = (current_month - timedelta(days=1)).replace(day=1)
        
        current_spending = self._get_category_spending(user_id, current_month)
        last_spending = self._get_category_spending(user_id, last_month)
        
        for category_name, current_amount in current_spending.items():
            last_amount = last_spending.get(category_name, 0)
            
            if last_amount > 0:
                increase_pct = ((current_amount - last_amount) / last_amount) * 100
                
                if increase_pct >= 50:  # 50% increase threshold
                    severity = 'alert' if increase_pct >= 100 else 'warning'
                    
                    insights.append(UserInsight(
                        user_id=user_id,
                        type='spending_increase',
                        category=category_name,
                        severity=severity,
                        title=f"{category_name} spending up {increase_pct:.0f}%",
                        description=f"You spent €{current_amount:.2f} on {category_name} this month, "
                                   f"compared to €{last_amount:.2f} last month.",
                        metric_value=current_amount,
                        comparison_value=last_amount,
                        percentage_change=increase_pct,
                        valid_until=date.today() + timedelta(days=7)
                    ))
        
        return insights
    
    def _check_budget_status(self, user_id: int) -> List[UserInsight]:
        """Check budget progress and generate alerts."""
        insights = []
        
        budgets = self.db.query(Budget).filter(
            Budget.user_id == user_id,
            Budget.is_active == True
        ).all()
        
        for budget in budgets:
            # Calculate current spending
            # ... (implementation similar to budget router)
            
            if budget.percentage >= 90:
                severity = 'alert' if budget.percentage >= 100 else 'warning'
                insights.append(UserInsight(
                    user_id=user_id,
                    type='budget_alert',
                    title=f"{budget.name} budget {budget.percentage:.0f}% used",
                    description=f"You've used {budget.percentage:.0f}% of your {budget.name} budget. "
                               f"Remaining: €{budget.remaining:.2f}",
                    metric_value=budget.spent,
                    comparison_value=budget.amount,
                    percentage_change=budget.percentage,
                    severity=severity,
                    valid_until=budget.end_date
                ))
        
        return insights
    
    def _get_category_spending(self, user_id: int, month_start: date) -> dict:
        """Get spending by category for a specific month."""
        results = self.db.query(
            Category.name,
            func.sum(Transaction.amount).label('total')
        ).join(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.type == 'expense',
            Transaction.date >= month_start,
            Transaction.date < (month_start + timedelta(days=32)).replace(day=1)
        ).group_by(Category.name).all()
        
        return {r.name: float(r.total) for r in results}
```

### API Endpoint

**File**: `backend/app/routers/insights.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.utils.security import get_current_user
from app.services.insights_service import InsightsService
from app.models import User

router = APIRouter(prefix="/insights", tags=["Insights"])


@router.get("/")
def get_insights(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get smart spending insights."""
    service = InsightsService(db, current_user.id)
    insights = service.generate_insights(days)
    
    # Convert dataclasses to dicts
    return {
        "insights": [
            {
                "type": i.type,
                "category": i.category,
                "title": i.title,
                "message": i.message,
                "severity": i.severity,
                "amount": i.amount,
                "percentage": i.percentage,
                "actionable": i.actionable,
                "action_text": i.action_text
            }
            for i in insights
        ],
        "total_count": len(insights),
        "unread_count": len([i for i in insights if i.severity in ['warning', 'error']])
    }


@router.get("/summary")
def get_insights_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of insights for dashboard."""
    service = InsightsService(db, current_user.id)
    insights = service.generate_insights(days=30)
    
    warnings = [i for i in insights if i.severity == 'warning']
    successes = [i for i in insights if i.severity == 'success']
    
    return {
        "has_insights": len(insights) > 0,
        "warning_count": len(warnings),
        "success_count": len(successes),
        "top_insight": insights[0].title if insights else None,
        "top_message": insights[0].message if insights else None
    }
```

---

# Feature 4: Debt Tracking & Payoff Planner

## Feature Overview

A comprehensive debt management system that helps users track loans, credit cards, and other debts. Calculates payoff dates, compares payoff strategies (snowball vs avalanche), and visualizes progress toward debt freedom.

### User Stories

- As a user, I want to track all my debts in one place
- As a user, I want to see payoff dates for each debt
- As a user, I want to compare snowball vs avalanche payoff strategies
- As a user, I want to see how extra payments affect payoff dates
- As a user, I want to visualize my debt payoff progress over time

---

## Database Schema

### New Table: `debts`

```sql
CREATE TABLE debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- Debt details
    name VARCHAR(200) NOT NULL,
    creditor VARCHAR(200),
    type VARCHAR(50), -- 'credit_card', 'student_loan', 'mortgage', 'car_loan', 'personal_loan', 'other'
    
    -- Financial terms
    original_balance DECIMAL(15,2) NOT NULL,
    current_balance DECIMAL(15,2) NOT NULL,
    interest_rate DECIMAL(5,4), -- e.g., 0.0525 for 5.25%
    minimum_payment DECIMAL(10,2),
    
    -- Timeline
    opened_date DATE,
    maturity_date DATE,
    
    -- Tracking
    priority INTEGER DEFAULT 0, -- user-defined priority
    is_active BOOLEAN DEFAULT TRUE,
    is_paid_off BOOLEAN DEFAULT FALSE,
    paid_off_date DATE,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE debt_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    principal_amount DECIMAL(10,2),
    interest_amount DECIMAL(10,2),
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (debt_id) REFERENCES debts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Schemas

**File**: `backend/app/schemas/debt.py`

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class DebtBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    creditor: Optional[str] = None
    type: str = Field(..., pattern="^(credit_card|student_loan|mortgage|car_loan|personal_loan|other)$")
    original_balance: float = Field(..., gt=0)
    current_balance: float = Field(..., ge=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=1)
    minimum_payment: Optional[float] = Field(None, gt=0)
    opened_date: Optional[date] = None
    maturity_date: Optional[date] = None
    notes: Optional[str] = None


class DebtCreate(DebtBase):
    pass


class DebtResponse(DebtBase):
    id: int
    user_id: int
    priority: int
    is_active: bool
    is_paid_off: bool
    paid_off_date: Optional[date]
    created_at: datetime
    updated_at: datetime
    
    # Computed fields
    months_to_payoff: Optional[int]
    total_interest: Optional[float]
    payoff_date: Optional[date]
    
    class Config:
        from_attributes = True


class PayoffStrategy(BaseModel):
    """Debt payoff strategy comparison."""
    strategy: str  # 'snowball' or 'avalanche'
    total_months: int
    total_interest_paid: float
    payoff_schedule: List[dict]  # Which debt to pay when


class DebtPaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    payment_date: date
    principal_amount: Optional[float] = None
    interest_amount: Optional[float] = None
    notes: Optional[str] = None
```

---

# Feature 5: Auto-Categorization Engine

## Feature Overview

An intelligent system that automatically categorizes transactions based on historical patterns, merchant names, and machine learning. Reduces manual work and improves data accuracy.

### User Stories

- As a user, I want transactions to be automatically categorized when imported
- As a user, I want to create custom categorization rules
- As a user, I want the system to learn from my manual categorizations
- As a user, I want to review and confirm auto-categorizations

---

## Database Schema

### New Table: `categorization_rules`

```sql
CREATE TABLE categorization_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- Rule matching
    pattern VARCHAR(255) NOT NULL, -- text to match
    pattern_type VARCHAR(20) NOT NULL, -- 'contains', 'starts_with', 'ends_with', 'exact', 'regex'
    field VARCHAR(20) NOT NULL, -- 'description', 'merchant', 'notes'
    
    -- Action
    category_id INTEGER NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 1.0, -- 0.0 to 1.0
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    match_count INTEGER DEFAULT 0, -- how many times used
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE categorization_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    source VARCHAR(50), -- 'rule', 'ml', 'history'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

### Service

**File**: `backend/app/services/categorization_service.py`

```python
import re
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import Transaction, Category, CategorizationRule


class CategorizationService:
    """Auto-categorize transactions using rules and ML."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def categorize_transaction(self, transaction: Transaction, user_id: int) -> Optional[int]:
        """Categorize a transaction and return category_id."""
        
        # 1. Try exact match with rules
        category_id = self._match_rules(transaction, user_id)
        if category_id:
            return category_id
        
        # 2. Try historical pattern matching
        category_id = self._match_history(transaction, user_id)
        if category_id:
            return category_id
        
        # 3. Try merchant-based matching
        category_id = self._match_merchant(transaction, user_id)
        if category_id:
            return category_id
        
        return None
    
    def _match_rules(self, transaction: Transaction, user_id: int) -> Optional[int]:
        """Match transaction against user-defined rules."""
        rules = self.db.query(CategorizationRule).filter(
            CategorizationRule.user_id == user_id,
            CategorizationRule.is_active == True
        ).all()
        
        for rule in rules:
            text_to_check = getattr(transaction, rule.field, '') or ''
            
            if self._check_pattern(text_to_check, rule.pattern, rule.pattern_type):
                # Update match count
                rule.match_count += 1
                self.db.commit()
                return rule.category_id
        
        return None
    
    def _check_pattern(self, text: str, pattern: str, pattern_type: str) -> bool:
        """Check if text matches pattern."""
        text_lower = text.lower()
        pattern_lower = pattern.lower()
        
        if pattern_type == 'contains':
            return pattern_lower in text_lower
        elif pattern_type == 'starts_with':
            return text_lower.startswith(pattern_lower)
        elif pattern_type == 'ends_with':
            return text_lower.endswith(pattern_lower)
        elif pattern_type == 'exact':
            return text_lower == pattern_lower
        elif pattern_type == 'regex':
            return bool(re.search(pattern, text, re.IGNORECASE))
        
        return False
    
    def _match_history(self, transaction: Transaction, user_id: int) -> Optional[int]:
        """Find similar past transactions and use their category."""
        # Look for transactions with similar description in past 90 days
        from datetime import timedelta, date
        
        similar = self.db.query(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.category_id.isnot(None),
            Transaction.description.ilike(f"%{transaction.description[:20]}%"),
            Transaction.date >= date.today() - timedelta(days=90)
        ).order_by(Transaction.date.desc()).first()
        
        return similar.category_id if similar else None
    
    def _match_merchant(self, transaction: Transaction, user_id: int) -> Optional[int]:
        """Match based on common merchant patterns."""
        description_lower = (transaction.description or '').lower()
        
        # Common merchant patterns
        merchant_categories = {
            'supermarket': ['supermarket', 'grocery', 'carrefour', 'lidl', 'aldi'],
            'restaurant': ['restaurant', 'tavern', 'cafe', 'mcdonalds', 'kfc'],
            'gas': ['shell', 'bp', 'esso', 'gas station', 'fuel'],
            'transport': ['uber', 'taxi', 'bus', 'train ticket', 'metro'],
            'shopping': ['amazon', 'ebay', 'zara', 'h&m', 'shopping'],
        }
        
        for category_type, keywords in merchant_categories.items():
            for keyword in keywords:
                if keyword in description_lower:
                    # Find category by name/type
                    category = self.db.query(Category).filter(
                        Category.user_id == user_id,
                        Category.name.ilike(f"%{category_type}%")
                    ).first()
                    
                    if category:
                        return category.id
        
        return None
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. Set up database migrations for all new tables
2. Create models and schemas
3. Implement basic CRUD endpoints

### Phase 2: Core Features (Week 3-4)
1. Implement Financial Goals system
2. Build Cash Flow Forecasting
3. Create Recurring Transactions management

### Phase 3: Intelligence (Week 5-6)
1. Implement Smart Spending Insights engine
2. Build Auto-Categorization service
3. Add Debt Tracking system

### Phase 4: Frontend (Week 7-8)
1. Build Goals management page
2. Create Cash Flow visualization
3. Add Insights dashboard widget
4. Implement Debt tracker UI
5. Add Auto-categorization review interface

### Phase 5: Polish (Week 9-10)
1. Testing and bug fixes
2. Performance optimization
3. Documentation
4. User onboarding flow

---

## Priority Matrix

| Feature | User Impact | Implementation Effort | Priority |
|---------|-------------|----------------------|----------|
| Financial Goals | High | Medium | **1** |
| Cash Flow Forecasting | High | Medium | **2** |
| Smart Spending Insights | Medium | High | 3 |
| Debt Tracking | High | Medium | **2** |
| Auto-Categorization | Medium | High | 4 |

**Recommendation**: Start with **Financial Goals** and **Debt Tracking** as they provide immediate value with manageable complexity. Then proceed with **Cash Flow Forecasting** before tackling the more complex ML-based features.
