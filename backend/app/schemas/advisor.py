"""
Pydantic schemas for Advisor API endpoints
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any


class InvestmentCalculationRequest(BaseModel):
    principal: float = Field(..., ge=0, description="Initial investment amount")
    annual_rate: float = Field(..., ge=0, le=1, description="Annual interest rate as decimal (e.g., 0.07 for 7%)")
    years: int = Field(..., ge=1, le=50, description="Number of years to invest")
    monthly_contribution: float = Field(default=0, ge=0, description="Regular monthly contribution")
    compounds_per_year: int = Field(default=12, ge=1, le=365, description="Compounding frequency per year")


class YearlyBreakdown(BaseModel):
    year: int
    balance: float
    contributions: float
    interest_earned: float
    year_growth: float


class InvestmentCalculationResponse(BaseModel):
    final_balance: float
    total_contributions: float
    total_interest_earned: float
    effective_return: float
    parameters: Dict[str, Any]
    yearly_breakdown: List[YearlyBreakdown]


class RetirementProjectionRequest(BaseModel):
    current_age: int = Field(..., ge=18, le=80, description="Your current age")
    retirement_age: int = Field(..., ge=30, le=90, description="Target retirement age")
    current_savings: float = Field(..., ge=0, description="Current retirement savings")
    monthly_contribution: float = Field(..., ge=0, description="Monthly contribution to retirement")
    annual_return: float = Field(default=0.07, ge=0, le=0.30, description="Expected annual return")
    inflation_rate: float = Field(default=0.02, ge=0, le=0.15, description="Expected annual inflation")
    withdrawal_rate: float = Field(default=0.04, ge=0.01, le=0.10, description="Safe withdrawal rate")


class RetirementMilestone(BaseModel):
    target: float
    years: int
    age: int


class RetirementProjectionResponse(BaseModel):
    retirement_balance: float
    retirement_balance_today_dollars: float
    annual_retirement_income: float
    monthly_retirement_income: float
    total_contributions: float
    total_growth: float
    years_to_retirement: int
    estimated_years_funds_last: int
    parameters: Dict[str, Any]
    milestones: List[RetirementMilestone]
    yearly_projection: List[YearlyBreakdown]
    error: Optional[str] = None


class InvestmentScenario(BaseModel):
    name: str = Field(default="Scenario", description="Scenario name")
    principal: float = Field(..., ge=0)
    annual_rate: float = Field(default=0.07, ge=0, le=1)
    years: int = Field(default=10, ge=1, le=50)
    monthly_contribution: float = Field(default=0, ge=0)


class ScenarioComparisonRequest(BaseModel):
    scenarios: List[InvestmentScenario]


class ScenarioResult(BaseModel):
    scenario_name: str
    final_balance: float
    total_contributions: float
    total_interest_earned: float
    effective_return: float


class ScenarioComparisonResponse(BaseModel):
    scenarios: List[ScenarioResult]
    best_scenario: str
    best_final_balance: float


class SelfSustainingRequest(BaseModel):
    initial_investment: float = Field(..., ge=0, description="Initial investment amount")
    monthly_contribution: float = Field(..., ge=0, description="Regular monthly contribution")
    annual_rate: float = Field(..., gt=0, le=1, description="Annual interest rate as decimal (e.g., 0.07 for 7%)")
    monthly_withdrawal: float = Field(..., gt=0, description="Desired fixed monthly withdrawal amount")


class SelfSustainingYearlyEntry(BaseModel):
    year: int
    balance: float
    contributions: float
    interest_earned: float
    year_growth: float
    target_reached: bool


class SustainabilityCheckEntry(BaseModel):
    month: int
    balance: float


class SelfSustainingResponse(BaseModel):
    target_capital: float
    months_to_goal: int
    years_to_goal: float
    monthly_interest_at_goal: float
    total_contributions: float
    total_interest_earned: float
    parameters: Dict[str, Any]
    yearly_breakdown: List[SelfSustainingYearlyEntry]
    sustainability_check: List[SustainabilityCheckEntry]
    error: Optional[str] = None


class LoanAmortizationRequest(BaseModel):
    principal: float = Field(..., gt=0, description="Loan amount")
    annual_rate: float = Field(..., ge=0, le=1, description="Annual interest rate as decimal")
    term_months: int = Field(..., ge=1, le=600, description="Loan term in months")


class AmortizationEntry(BaseModel):
    month: int
    payment: float
    principal: float
    interest: float
    balance: float
    total_interest_paid: float


class LoanAmortizationResponse(BaseModel):
    monthly_payment: float
    total_payments: float
    total_interest: float
    principal: float
    parameters: Dict[str, Any]
    schedule: List[AmortizationEntry]


class EarlyPayoffRequest(BaseModel):
    principal: float = Field(..., gt=0, description="Loan amount")
    annual_rate: float = Field(..., ge=0, le=1, description="Annual interest rate as decimal")
    term_months: int = Field(..., ge=1, le=600, description="Loan term in months")
    extra_monthly_payment: float = Field(..., ge=0, description="Extra monthly payment amount")


class EarlyPayoffResponse(BaseModel):
    original_term_months: int
    new_term_months: int
    months_saved: int
    years_saved: float
    original_total_interest: float
    new_total_interest: float
    interest_saved: float
    original_monthly_payment: float
    new_monthly_payment: float
    extra_monthly_payment: float
    total_extra_paid: float


class RefinanceComparisonRequest(BaseModel):
    current_balance: float = Field(..., gt=0, description="Current loan balance")
    current_rate: float = Field(..., ge=0, le=1, description="Current annual rate")
    current_remaining_months: int = Field(..., ge=1, description="Remaining months on current loan")
    new_rate: float = Field(..., ge=0, le=1, description="New loan annual rate")
    new_term_months: int = Field(..., ge=1, le=600, description="New loan term in months")
    closing_costs: float = Field(default=0, ge=0, description="Refinancing closing costs")


class LoanDetails(BaseModel):
    monthly_payment: float
    total_interest: float
    remaining_months: Optional[int] = None
    term_months: Optional[int] = None
    closing_costs: Optional[float] = None


class RefinanceComparison(BaseModel):
    monthly_savings: float
    total_interest_savings: float
    net_savings_after_costs: float
    breakeven_months: Optional[float]
    recommendation: str


class RefinanceComparisonResponse(BaseModel):
    current_loan: LoanDetails
    new_loan: LoanDetails
    comparison: RefinanceComparison


class MonthlyExpensesDetail(BaseModel):
    total: float
    essential: float


class EmergencyFundRecommendations(BaseModel):
    minimum: float
    recommended: float
    maximum: float


class EmergencyFundCoverage(BaseModel):
    months_covered: float
    percentage_of_recommended: float


class SavingsPlan(BaseModel):
    months: int
    monthly_savings: float
    weekly_savings: float


class EmergencyFundResponse(BaseModel):
    current_liquid_assets: float
    monthly_expenses: float
    monthly_expenses_detail: Optional[MonthlyExpensesDetail] = None
    recommendations: EmergencyFundRecommendations
    current_coverage: EmergencyFundCoverage
    status: str
    message: str
    gap_to_recommended: float
    savings_plans: List[SavingsPlan]


class NetWorthResponse(BaseModel):
    net_worth: float
    total_assets: float
    total_liabilities: float
    assets_breakdown: Dict[str, float]
    liabilities_breakdown: Dict[str, float]
    debt_to_asset_ratio: float
    calculated_at: str


class NetWorthHistoryEntry(BaseModel):
    date: str
    net_worth: float


class NetWorthProjectionEntry(BaseModel):
    date: str
    projected_net_worth: float
    month_number: int


class NetWorthProjectionResponse(BaseModel):
    current_net_worth: float
    monthly_savings_rate: float
    projections: List[NetWorthProjectionEntry]
    final_projected_net_worth: float
    total_growth: float


class TaxEstimateRequest(BaseModel):
    annual_income: float = Field(..., ge=0, description="Annual gross income")
    deductions: float = Field(default=0, ge=0, description="Tax deductions")


class TaxBracketBreakdown(BaseModel):
    bracket: str
    rate: str
    taxable_amount: float
    tax: float


class TaxEstimateResponse(BaseModel):
    gross_income: float
    deductions: float
    taxable_income: float
    total_tax: float
    effective_tax_rate: float
    net_income: float
    monthly_net_income: float
    tax_breakdown: List[TaxBracketBreakdown]
    country: str
    tax_year: int


class MarginalTaxRequest(BaseModel):
    current_income: float = Field(..., ge=0, description="Current annual income")
    additional_income: float = Field(..., gt=0, description="Additional income to evaluate")


class MarginalTaxResponse(BaseModel):
    current_income: float
    additional_income: float
    new_total_income: float
    additional_tax: float
    marginal_tax_rate: float
    net_additional_income: float
    take_home_percentage: float


class IncomeComparisonEntry(BaseModel):
    gross_income: float
    total_tax: float
    net_income: float
    effective_rate: float
