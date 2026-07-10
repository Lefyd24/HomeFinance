from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional, List


class ReportFilter(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    account_ids: Optional[List[int]] = []
    category_ids: Optional[List[int]] = []
    group_by: Optional[str] = "month"  # day, week, month, year


class SpendingReport(BaseModel):
    labels: List[str]
    data: List[float]


class CashflowReport(BaseModel):
    labels: List[str]
    income: List[float]
    expenses: List[float]


class TrendReport(BaseModel):
    labels: List[str]
    data: List[float]


class IncomeReport(BaseModel):
    labels: List[str]
    data: List[float]


class ReportSeries(BaseModel):
    name: str
    data: List[float]


class BalanceHistoryReport(BaseModel):
    labels: List[str]
    series: List[ReportSeries]


class SavedReportCreate(BaseModel):
    name: str
    report_type: str
    configuration: str  # JSON string


class SavedReportResponse(SavedReportCreate):
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True