from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class DashboardSummary(BaseModel):
    total_balance: float
    total_income: float
    total_expenses: float
    net_savings: float
    account_count: int
    transaction_count: int


class DashboardRecentTransaction(BaseModel):
    id: int
    date: datetime
    description: str
    amount: float
    type: str
    account_name: str
    category_name: Optional[str]
    
    class Config:
        from_attributes = True


class DashboardBudgetProgress(BaseModel):
    id: int
    name: str
    amount: float
    spent: float
    remaining: float
    percentage: float
    
    class Config:
        from_attributes = True


class DashboardData(BaseModel):
    summary: DashboardSummary
    recent_transactions: List[DashboardRecentTransaction]
    budget_progress: List[DashboardBudgetProgress]