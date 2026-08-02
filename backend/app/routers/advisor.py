"""
Financial Advisor API Router

Provides financial planning calculator endpoints:
- Investment calculations
- Loan/mortgage calculations
- Emergency fund recommendations
- Net worth tracking
- Tax estimation
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.utils.security import get_current_user_authenticated as get_current_user
from app.models import User
from app.services.advisor_service import (
    InvestmentCalculator,
    SelfSustainingCalculator,
    LoanCalculator,
    EmergencyFundCalculator,
    NetWorthTracker,
    TaxEstimator
)
from app.schemas.advisor import (
    InvestmentCalculationRequest,
    InvestmentCalculationResponse,
    RetirementProjectionRequest,
    RetirementProjectionResponse,
    ScenarioComparisonRequest,
    ScenarioComparisonResponse,
    SelfSustainingRequest,
    SelfSustainingResponse,
    LoanAmortizationRequest,
    LoanAmortizationResponse,
    EarlyPayoffRequest,
    EarlyPayoffResponse,
    RefinanceComparisonRequest,
    RefinanceComparisonResponse,
    EmergencyFundResponse,
    NetWorthResponse,
    NetWorthHistoryEntry,
    NetWorthProjectionResponse,
    TaxEstimateRequest,
    TaxEstimateResponse,
    MarginalTaxRequest,
    MarginalTaxResponse,
    IncomeComparisonEntry
)

router = APIRouter(prefix="/advisor", tags=["Financial Advisor"])


@router.post("/investment/calculate", response_model=InvestmentCalculationResponse)
def calculate_investment(
    request: InvestmentCalculationRequest,
    current_user: User = Depends(get_current_user)
):
    """Calculate compound interest with regular contributions.
    
    Calculates future value of an investment with:
    - Initial principal
    - Regular monthly contributions
    - Compound interest
    
    Returns yearly breakdown of growth.
    """
    result = InvestmentCalculator.calculate_compound_interest(
        principal=request.principal,
        annual_rate=request.annual_rate,
        years=request.years,
        compounds_per_year=request.compounds_per_year,
        monthly_contribution=request.monthly_contribution
    )
    return result


@router.post("/investment/retirement", response_model=RetirementProjectionResponse)
def project_retirement(
    request: RetirementProjectionRequest,
    current_user: User = Depends(get_current_user)
):
    """Project retirement savings and income.
    
    Calculates:
    - Projected retirement balance
    - Inflation-adjusted (today's dollars) values
    - Monthly retirement income using safe withdrawal rate
    - Key milestones along the way
    """
    result = InvestmentCalculator.calculate_retirement_projection(
        current_age=request.current_age,
        retirement_age=request.retirement_age,
        current_savings=request.current_savings,
        monthly_contribution=request.monthly_contribution,
        annual_return=request.annual_return,
        inflation_rate=request.inflation_rate,
        withdrawal_rate=request.withdrawal_rate
    )
    
    if 'error' in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result['error']
        )
    
    return result


@router.post("/investment/compare", response_model=ScenarioComparisonResponse)
def compare_investment_scenarios(
    request: ScenarioComparisonRequest,
    current_user: User = Depends(get_current_user)
):
    """Compare multiple investment scenarios side by side.
    
    Useful for comparing different:
    - Contribution amounts
    - Investment rates
    - Time horizons
    """
    if len(request.scenarios) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 scenarios are required for comparison"
        )
    
    scenarios_dict = [s.model_dump() for s in request.scenarios]
    result = InvestmentCalculator.compare_scenarios(scenarios_dict)
    return result


@router.post("/investment/self-sustaining", response_model=SelfSustainingResponse)
def calculate_self_sustaining_portfolio(
    request: SelfSustainingRequest,
    current_user: User = Depends(get_current_user)
):
    """Calculate the target capital for a self-sustaining portfolio.

    Finds the balance at which monthly interest alone covers a fixed monthly
    withdrawal — so the portfolio no longer depletes — along with how many
    months/years of contributions it takes to reach that balance.
    """
    result = SelfSustainingCalculator.calculate(
        initial_investment=request.initial_investment,
        monthly_contribution=request.monthly_contribution,
        annual_rate=request.annual_rate,
        monthly_withdrawal=request.monthly_withdrawal
    )

    if 'error' in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result['error']
        )

    return result


@router.post("/loan/amortization", response_model=LoanAmortizationResponse)
def calculate_loan_amortization(
    request: LoanAmortizationRequest,
    current_user: User = Depends(get_current_user)
):
    """Calculate loan amortization schedule.
    
    Returns:
    - Monthly payment amount
    - Total interest paid
    - Full amortization schedule
    """
    result = LoanCalculator.calculate_amortization(
        principal=request.principal,
        annual_rate=request.annual_rate,
        term_months=request.term_months
    )
    return result


@router.post("/loan/early-payoff", response_model=EarlyPayoffResponse)
def calculate_early_payoff(
    request: EarlyPayoffRequest,
    current_user: User = Depends(get_current_user)
):
    """Calculate impact of extra monthly payments on a loan.
    
    Shows:
    - How much faster the loan will be paid off
    - Total interest saved
    - New payoff timeline
    """
    result = LoanCalculator.calculate_early_payoff(
        principal=request.principal,
        annual_rate=request.annual_rate,
        term_months=request.term_months,
        extra_monthly_payment=request.extra_monthly_payment
    )
    return result


@router.post("/loan/refinance-compare", response_model=RefinanceComparisonResponse)
def compare_refinance_options(
    request: RefinanceComparisonRequest,
    current_user: User = Depends(get_current_user)
):
    """Compare current loan with refinancing option.
    
    Evaluates:
    - Monthly payment difference
    - Total interest savings
    - Break-even point (when refinancing costs are recouped)
    - Recommendation on whether to refinance
    """
    result = LoanCalculator.compare_refinance(
        current_balance=request.current_balance,
        current_rate=request.current_rate,
        current_remaining_months=request.current_remaining_months,
        new_rate=request.new_rate,
        new_term_months=request.new_term_months,
        closing_costs=request.closing_costs
    )
    return result


@router.get("/emergency-fund/recommendation", response_model=EmergencyFundResponse)
def get_emergency_fund_recommendation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get personalized emergency fund recommendation.
    
    Based on your actual spending patterns:
    - Calculates essential vs total expenses
    - Recommends 3-6 month fund target
    - Shows current coverage status
    - Provides savings plans to reach goal
    """
    calculator = EmergencyFundCalculator(db, current_user.id)
    result = calculator.calculate_recommendation()
    return result


@router.get("/net-worth", response_model=NetWorthResponse)
def get_current_net_worth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Calculate current net worth.
    
    Aggregates:
    - All account balances (assets)
    - All debt balances (liabilities)
    - Calculates debt-to-asset ratio
    """
    tracker = NetWorthTracker(db, current_user.id)
    result = tracker.calculate_current()
    return result


@router.get("/net-worth/history", response_model=List[NetWorthHistoryEntry])
def get_net_worth_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(12, ge=3, le=36, description="Months of history")
):
    """Get historical net worth estimates.
    
    Reconstructs historical net worth based on transaction history.
    """
    tracker = NetWorthTracker(db, current_user.id)
    result = tracker.get_history(months=months)
    return result


@router.get("/net-worth/projection", response_model=NetWorthProjectionResponse)
def project_net_worth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    months: int = Query(12, ge=3, le=36, description="Months to project"),
    monthly_savings: Optional[float] = Query(None, description="Override monthly savings rate")
):
    """Project future net worth.
    
    Uses current savings rate (or specified override) to project
    net worth growth over time.
    """
    tracker = NetWorthTracker(db, current_user.id)
    result = tracker.project_future(months=months, monthly_savings=monthly_savings)
    return result


@router.post("/tax/estimate", response_model=TaxEstimateResponse)
def estimate_income_tax(
    request: TaxEstimateRequest,
    current_user: User = Depends(get_current_user)
):
    """Estimate income tax (Greek tax brackets).
    
    Calculates:
    - Total tax owed
    - Effective tax rate
    - Net income after tax
    - Breakdown by tax bracket
    """
    result = TaxEstimator.estimate_greek_income_tax(
        annual_income=request.annual_income,
        deductions=request.deductions
    )
    return result


@router.post("/tax/marginal", response_model=MarginalTaxResponse)
def calculate_marginal_tax(
    request: MarginalTaxRequest,
    current_user: User = Depends(get_current_user)
):
    """Calculate marginal tax on additional income.
    
    Useful for evaluating:
    - Raise or bonus impact
    - Side income tax implications
    - Take-home percentage on new income
    """
    result = TaxEstimator.calculate_marginal_benefit(
        current_income=request.current_income,
        additional_income=request.additional_income
    )
    return result


@router.get("/tax/compare", response_model=List[IncomeComparisonEntry])
def compare_income_tax_levels(
    current_user: User = Depends(get_current_user),
    incomes: str = Query(..., description="Comma-separated income levels (e.g., '20000,30000,40000')")
):
    """Compare tax impact across different income levels.
    
    Helps visualize how tax burden changes with income.
    """
    try:
        income_list = [float(x.strip()) for x in incomes.split(',')]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid income format. Use comma-separated numbers."
        )
    
    if len(income_list) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 income levels allowed"
        )
    
    result = TaxEstimator.compare_income_scenarios(income_list)
    return result


@router.get("/tools")
def get_available_tools(
    current_user: User = Depends(get_current_user)
):
    """Get list of available advisor tools with descriptions."""
    return {
        'tools': [
            {
                'id': 'investment',
                'name': 'Investment Calculator',
                'description': 'Calculate compound interest and compare investment scenarios',
                'icon': 'chart-line',
                'endpoints': [
                    '/advisor/investment/calculate',
                    '/advisor/investment/retirement',
                    '/advisor/investment/compare',
                    '/advisor/investment/self-sustaining'
                ]
            },
            {
                'id': 'loan',
                'name': 'Loan Calculator',
                'description': 'Calculate loan payments, early payoff savings, and refinance options',
                'icon': 'credit-card',
                'endpoints': [
                    '/advisor/loan/amortization',
                    '/advisor/loan/early-payoff',
                    '/advisor/loan/refinance-compare'
                ]
            },
            {
                'id': 'emergency',
                'name': 'Emergency Fund',
                'description': 'Get personalized emergency fund recommendations based on your spending',
                'icon': 'shield-check',
                'endpoints': [
                    '/advisor/emergency-fund/recommendation'
                ]
            },
            {
                'id': 'networth',
                'name': 'Net Worth Tracker',
                'description': 'Track your net worth over time and project future growth',
                'icon': 'trending-up',
                'endpoints': [
                    '/advisor/net-worth',
                    '/advisor/net-worth/history',
                    '/advisor/net-worth/projection'
                ]
            },
            {
                'id': 'tax',
                'name': 'Tax Estimator',
                'description': 'Estimate income tax and understand marginal tax rates',
                'icon': 'calculator',
                'endpoints': [
                    '/advisor/tax/estimate',
                    '/advisor/tax/marginal',
                    '/advisor/tax/compare'
                ]
            }
        ]
    }
