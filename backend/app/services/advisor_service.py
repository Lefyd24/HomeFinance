"""
Financial Advisor Service

Provides financial planning calculators:
1. Investment Calculator - Compound interest and retirement planning
2. Loan/Mortgage Calculator - Amortization and early payoff scenarios
3. Emergency Fund Calculator - Personalized recommendations based on spending
4. Net Worth Tracker - Assets vs liabilities over time
5. Budget Optimizer - AI-powered budget allocation suggestions
6. Tax Estimator - Basic income tax calculations (Greek tax brackets)
"""

from datetime import date, timedelta, datetime
from typing import List, Dict, Optional, Any
from collections import defaultdict
import math

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import User, Transaction, Account, Debt, FinancialGoal


class InvestmentCalculator:
    """Investment and retirement planning calculations."""
    
    @staticmethod
    def calculate_compound_interest(
        principal: float,
        annual_rate: float,
        years: int,
        compounds_per_year: int = 12,
        monthly_contribution: float = 0
    ) -> Dict[str, Any]:
        """Calculate compound interest with optional regular contributions.
        
        Args:
            principal: Initial investment amount
            annual_rate: Annual interest rate (as decimal, e.g., 0.07 for 7%)
            years: Number of years to invest
            compounds_per_year: How often interest compounds (12 = monthly)
            monthly_contribution: Regular monthly contribution
        """
        rate_per_period = annual_rate / compounds_per_year
        total_periods = years * compounds_per_year
        
        future_value_principal = principal * ((1 + rate_per_period) ** total_periods)
        
        if monthly_contribution > 0 and rate_per_period > 0:
            future_value_contributions = monthly_contribution * (
                ((1 + rate_per_period) ** total_periods - 1) / rate_per_period
            )
        else:
            future_value_contributions = monthly_contribution * total_periods
        
        final_balance = future_value_principal + future_value_contributions
        total_contributions = principal + (monthly_contribution * 12 * years)
        total_interest = final_balance - total_contributions
        
        yearly_breakdown = []
        running_balance = principal
        running_contributions = principal
        
        for year in range(1, years + 1):
            year_start_balance = running_balance
            
            for month in range(12):
                running_balance = running_balance * (1 + rate_per_period)
                running_balance += monthly_contribution
                running_contributions += monthly_contribution
            
            yearly_breakdown.append({
                'year': year,
                'balance': round(running_balance, 2),
                'contributions': round(running_contributions, 2),
                'interest_earned': round(running_balance - running_contributions, 2),
                'year_growth': round(running_balance - year_start_balance, 2)
            })
        
        return {
            'final_balance': round(final_balance, 2),
            'total_contributions': round(total_contributions, 2),
            'total_interest_earned': round(total_interest, 2),
            'effective_return': round((final_balance / total_contributions - 1) * 100, 2),
            'parameters': {
                'principal': principal,
                'annual_rate': annual_rate * 100,
                'years': years,
                'monthly_contribution': monthly_contribution,
                'compounds_per_year': compounds_per_year
            },
            'yearly_breakdown': yearly_breakdown
        }
    
    @staticmethod
    def calculate_retirement_projection(
        current_age: int,
        retirement_age: int,
        current_savings: float,
        monthly_contribution: float,
        annual_return: float = 0.07,
        inflation_rate: float = 0.02,
        withdrawal_rate: float = 0.04
    ) -> Dict[str, Any]:
        """Project retirement savings and income.
        
        Args:
            current_age: Your current age
            retirement_age: Target retirement age
            current_savings: Current retirement savings
            monthly_contribution: Monthly contribution to retirement
            annual_return: Expected annual return (default 7%)
            inflation_rate: Expected annual inflation (default 2%)
            withdrawal_rate: Safe withdrawal rate (default 4%)
        """
        years_to_retirement = retirement_age - current_age
        
        if years_to_retirement <= 0:
            return {'error': 'Retirement age must be greater than current age'}
        
        investment = InvestmentCalculator.calculate_compound_interest(
            principal=current_savings,
            annual_rate=annual_return,
            years=years_to_retirement,
            monthly_contribution=monthly_contribution
        )
        
        retirement_balance = investment['final_balance']
        
        real_return = ((1 + annual_return) / (1 + inflation_rate)) - 1
        
        today_dollars_balance = retirement_balance / ((1 + inflation_rate) ** years_to_retirement)
        
        annual_income_nominal = retirement_balance * withdrawal_rate
        annual_income_real = today_dollars_balance * withdrawal_rate
        monthly_income_real = annual_income_real / 12
        
        years_funds_last = 30
        if annual_return > withdrawal_rate:
            years_funds_last = 50
        elif annual_return < withdrawal_rate:
            years_funds_last = int(retirement_balance / annual_income_nominal)
        
        milestones = []
        for target in [100000, 250000, 500000, 1000000]:
            if target > current_savings and target <= retirement_balance:
                for i, year_data in enumerate(investment['yearly_breakdown']):
                    if year_data['balance'] >= target:
                        milestones.append({
                            'target': target,
                            'years': i + 1,
                            'age': current_age + i + 1
                        })
                        break
        
        return {
            'retirement_balance': round(retirement_balance, 2),
            'retirement_balance_today_dollars': round(today_dollars_balance, 2),
            'annual_retirement_income': round(annual_income_real, 2),
            'monthly_retirement_income': round(monthly_income_real, 2),
            'total_contributions': round(investment['total_contributions'], 2),
            'total_growth': round(investment['total_interest_earned'], 2),
            'years_to_retirement': years_to_retirement,
            'estimated_years_funds_last': years_funds_last,
            'parameters': {
                'current_age': current_age,
                'retirement_age': retirement_age,
                'current_savings': current_savings,
                'monthly_contribution': monthly_contribution,
                'annual_return': annual_return * 100,
                'inflation_rate': inflation_rate * 100,
                'withdrawal_rate': withdrawal_rate * 100
            },
            'milestones': milestones,
            'yearly_projection': investment['yearly_breakdown']
        }
    
    @staticmethod
    def compare_scenarios(scenarios: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compare multiple investment scenarios."""
        results = []
        
        for i, scenario in enumerate(scenarios):
            result = InvestmentCalculator.calculate_compound_interest(
                principal=scenario.get('principal', 0),
                annual_rate=scenario.get('annual_rate', 0.07),
                years=scenario.get('years', 10),
                monthly_contribution=scenario.get('monthly_contribution', 0)
            )
            result['scenario_name'] = scenario.get('name', f'Scenario {i + 1}')
            results.append(result)
        
        best_return = max(results, key=lambda x: x['final_balance'])
        
        return {
            'scenarios': results,
            'best_scenario': best_return['scenario_name'],
            'best_final_balance': best_return['final_balance']
        }


class LoanCalculator:
    """Loan and mortgage calculations."""
    
    @staticmethod
    def calculate_amortization(
        principal: float,
        annual_rate: float,
        term_months: int
    ) -> Dict[str, Any]:
        """Calculate loan amortization schedule.
        
        Args:
            principal: Loan amount
            annual_rate: Annual interest rate (as decimal)
            term_months: Loan term in months
        """
        monthly_rate = annual_rate / 12
        
        if monthly_rate > 0:
            monthly_payment = principal * (
                monthly_rate * (1 + monthly_rate) ** term_months
            ) / ((1 + monthly_rate) ** term_months - 1)
        else:
            monthly_payment = principal / term_months
        
        schedule = []
        balance = principal
        total_interest = 0
        total_principal_paid = 0
        
        for month in range(1, term_months + 1):
            interest_payment = balance * monthly_rate
            principal_payment = monthly_payment - interest_payment
            balance -= principal_payment
            
            total_interest += interest_payment
            total_principal_paid += principal_payment
            
            if month <= 12 or month > term_months - 12 or month % 12 == 0:
                schedule.append({
                    'month': month,
                    'payment': round(monthly_payment, 2),
                    'principal': round(principal_payment, 2),
                    'interest': round(interest_payment, 2),
                    'balance': round(max(0, balance), 2),
                    'total_interest_paid': round(total_interest, 2)
                })
        
        return {
            'monthly_payment': round(monthly_payment, 2),
            'total_payments': round(monthly_payment * term_months, 2),
            'total_interest': round(total_interest, 2),
            'principal': principal,
            'parameters': {
                'principal': principal,
                'annual_rate': annual_rate * 100,
                'term_months': term_months,
                'term_years': term_months / 12
            },
            'schedule': schedule
        }
    
    @staticmethod
    def calculate_early_payoff(
        principal: float,
        annual_rate: float,
        term_months: int,
        extra_monthly_payment: float
    ) -> Dict[str, Any]:
        """Calculate impact of extra monthly payments."""
        original = LoanCalculator.calculate_amortization(principal, annual_rate, term_months)
        
        monthly_rate = annual_rate / 12
        regular_payment = original['monthly_payment']
        total_payment = regular_payment + extra_monthly_payment
        
        balance = principal
        months_to_payoff = 0
        total_interest_paid = 0
        
        while balance > 0 and months_to_payoff < term_months * 2:
            months_to_payoff += 1
            interest = balance * monthly_rate
            principal_paid = min(total_payment - interest, balance)
            balance -= principal_paid
            total_interest_paid += interest
            
            if balance < 0.01:
                balance = 0
                break
        
        interest_saved = original['total_interest'] - total_interest_paid
        months_saved = term_months - months_to_payoff
        
        return {
            'original_term_months': term_months,
            'new_term_months': months_to_payoff,
            'months_saved': months_saved,
            'years_saved': round(months_saved / 12, 1),
            'original_total_interest': round(original['total_interest'], 2),
            'new_total_interest': round(total_interest_paid, 2),
            'interest_saved': round(interest_saved, 2),
            'original_monthly_payment': regular_payment,
            'new_monthly_payment': round(total_payment, 2),
            'extra_monthly_payment': extra_monthly_payment,
            'total_extra_paid': round(extra_monthly_payment * months_to_payoff, 2)
        }
    
    @staticmethod
    def compare_refinance(
        current_balance: float,
        current_rate: float,
        current_remaining_months: int,
        new_rate: float,
        new_term_months: int,
        closing_costs: float = 0
    ) -> Dict[str, Any]:
        """Compare current loan vs refinancing option."""
        current = LoanCalculator.calculate_amortization(
            current_balance, current_rate, current_remaining_months
        )
        
        new = LoanCalculator.calculate_amortization(
            current_balance + closing_costs, new_rate, new_term_months
        )
        
        monthly_savings = current['monthly_payment'] - new['monthly_payment']
        total_interest_difference = current['total_interest'] - new['total_interest']
        net_savings = total_interest_difference - closing_costs
        
        if monthly_savings > 0:
            breakeven_months = closing_costs / monthly_savings
        else:
            breakeven_months = float('inf')
        
        return {
            'current_loan': {
                'monthly_payment': current['monthly_payment'],
                'total_interest': current['total_interest'],
                'remaining_months': current_remaining_months
            },
            'new_loan': {
                'monthly_payment': new['monthly_payment'],
                'total_interest': new['total_interest'],
                'term_months': new_term_months,
                'closing_costs': closing_costs
            },
            'comparison': {
                'monthly_savings': round(monthly_savings, 2),
                'total_interest_savings': round(total_interest_difference, 2),
                'net_savings_after_costs': round(net_savings, 2),
                'breakeven_months': round(breakeven_months, 1) if breakeven_months != float('inf') else None,
                'recommendation': 'refinance' if net_savings > 0 and breakeven_months < new_term_months else 'keep_current'
            }
        }


class EmergencyFundCalculator:
    """Emergency fund recommendations based on actual spending."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def get_monthly_expenses(self, months: int = 6) -> float:
        """Calculate average monthly expenses."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        total = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).scalar() or 0
        
        return float(total) / months
    
    def get_essential_expenses(self, months: int = 6) -> float:
        """Calculate average essential monthly expenses."""
        from app.models import Category
        
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        essential_keywords = ['rent', 'mortgage', 'utilities', 'grocery', 'insurance', 
                            'healthcare', 'transport', 'phone', 'internet', 'electric',
                            'water', 'gas', 'food', 'medical']
        
        categories = self.db.query(Category).filter(
            Category.user_id == self.user_id
        ).all()
        
        essential_category_ids = []
        for cat in categories:
            cat_lower = cat.name.lower()
            if any(keyword in cat_lower for keyword in essential_keywords):
                essential_category_ids.append(cat.id)
        
        if not essential_category_ids:
            return self.get_monthly_expenses(months) * 0.7
        
        total = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.category_id.in_(essential_category_ids),
            Transaction.date >= start_date
        ).scalar() or 0
        
        return float(total) / months
    
    def calculate_recommendation(self) -> Dict[str, Any]:
        """Calculate personalized emergency fund recommendation."""
        total_monthly = self.get_monthly_expenses()
        essential_monthly = self.get_essential_expenses()
        
        # Use total monthly expenses for calculations (more conservative approach)
        # Essential expenses might be underestimated if categories aren't properly tagged
        baseline_monthly = total_monthly if total_monthly > 0 else essential_monthly
        
        # If we still have no expenses data, return error state
        if baseline_monthly <= 0:
            return {
                'current_liquid_assets': 0,
                'monthly_expenses': 0,
                'monthly_expenses_detail': {
                    'total': 0,
                    'essential': 0
                },
                'recommendations': {
                    'minimum': 0,
                    'recommended': 0,
                    'maximum': 0
                },
                'current_coverage': {
                    'months_covered': 0,
                    'percentage_of_recommended': 0
                },
                'status': 'unknown',
                'message': 'Not enough expense data to calculate recommendations. Please add some transactions first.',
                'gap_to_recommended': 0,
                'savings_plans': []
            }
        
        savings_accounts = self.db.query(Account).filter(
            Account.user_id == self.user_id,
            Account.type.in_(['savings', 'checking']),
            Account.is_active == True
        ).all()
        
        current_liquid = sum(a.balance for a in savings_accounts)
        
        # Calculate fund targets based on total monthly expenses (conservative)
        min_fund = baseline_monthly * 3
        recommended_fund = baseline_monthly * 6
        max_fund = baseline_monthly * 12
        
        # Calculate coverage based on total expenses (how many months can you survive)
        months_covered = current_liquid / baseline_monthly
        
        # Determine status based on months of coverage
        if months_covered >= 6:
            status = 'excellent'
            message = 'Your emergency fund is well-funded! You have a robust safety net.'
        elif months_covered >= 3:
            status = 'good'
            message = 'Your emergency fund covers the minimum. Consider building toward 6 months.'
        elif months_covered >= 1:
            status = 'fair'
            message = 'Your emergency fund needs attention. Aim for at least 3 months of expenses.'
        else:
            status = 'critical'
            message = 'Building an emergency fund should be your top priority.'
        
        gap = max(0, recommended_fund - current_liquid)
        
        savings_plans = []
        for months_to_goal in [6, 12, 18, 24]:
            if gap > 0:
                monthly_savings = gap / months_to_goal
                savings_plans.append({
                    'months': months_to_goal,
                    'monthly_savings': round(monthly_savings, 2),
                    'weekly_savings': round(monthly_savings / 4, 2)
                })
        
        return {
            'current_liquid_assets': round(current_liquid, 2),
            'monthly_expenses': round(baseline_monthly, 2),  # Single value for easy display
            'monthly_expenses_detail': {
                'total': round(total_monthly, 2),
                'essential': round(essential_monthly, 2)
            },
            'recommendations': {
                'minimum': round(min_fund, 2),
                'recommended': round(recommended_fund, 2),
                'maximum': round(max_fund, 2)
            },
            'current_coverage': {
                'months_covered': round(months_covered, 1),
                'percentage_of_recommended': round((current_liquid / recommended_fund * 100) if recommended_fund > 0 else 0, 1)
            },
            'status': status,
            'message': message,
            'gap_to_recommended': round(gap, 2),
            'savings_plans': savings_plans
        }


class NetWorthTracker:
    """Track and project net worth over time."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def calculate_current(self) -> Dict[str, Any]:
        """Calculate current net worth."""
        accounts = self.db.query(Account).filter(
            Account.user_id == self.user_id,
            Account.is_active == True
        ).all()
        
        assets = {
            'checking': 0,
            'savings': 0,
            'investment': 0,
            'cash': 0,
            'other': 0
        }
        
        for account in accounts:
            acc_type = account.type.lower() if account.type else 'other'
            if acc_type in assets:
                assets[acc_type] += account.balance
            else:
                assets['other'] += account.balance
        
        total_assets = sum(assets.values())
        
        debts = self.db.query(Debt).filter(
            Debt.user_id == self.user_id,
            Debt.is_active == True
        ).all()
        
        liabilities = {
            'credit_card': 0,
            'personal_loan': 0,
            'mortgage': 0,
            'auto_loan': 0,
            'student_loan': 0,
            'other': 0
        }
        
        for debt in debts:
            debt_type = debt.type.lower() if debt.type else 'other'
            debt_type = debt_type.replace(' ', '_')
            if debt_type in liabilities:
                liabilities[debt_type] += debt.current_balance
            else:
                liabilities['other'] += debt.current_balance
        
        total_liabilities = sum(liabilities.values())
        
        net_worth = total_assets - total_liabilities
        
        return {
            'net_worth': round(net_worth, 2),
            'total_assets': round(total_assets, 2),
            'total_liabilities': round(total_liabilities, 2),
            'assets_breakdown': {k: round(v, 2) for k, v in assets.items() if v > 0},
            'liabilities_breakdown': {k: round(v, 2) for k, v in liabilities.items() if v > 0},
            'debt_to_asset_ratio': round((total_liabilities / total_assets * 100) if total_assets > 0 else 0, 1),
            'calculated_at': date.today().isoformat()
        }
    
    def get_history(self, months: int = 12) -> List[Dict[str, Any]]:
        """Estimate historical net worth based on transaction history."""
        current = self.calculate_current()
        
        end_date = date.today()
        history = []
        
        running_net_worth = current['net_worth']
        
        for month_offset in range(months, -1, -1):
            month_date = end_date - timedelta(days=30 * month_offset)
            month_start = month_date.replace(day=1)
            
            if month_offset == 0:
                history.append({
                    'date': end_date.isoformat(),
                    'net_worth': round(running_net_worth, 2)
                })
            else:
                month_income = self.db.query(func.sum(Transaction.amount)).filter(
                    Transaction.user_id == self.user_id,
                    Transaction.type == 'income',
                    func.strftime('%Y-%m', Transaction.date) == month_date.strftime('%Y-%m')
                ).scalar() or 0
                
                month_expenses = self.db.query(func.sum(Transaction.amount)).filter(
                    Transaction.user_id == self.user_id,
                    Transaction.type == 'expense',
                    func.strftime('%Y-%m', Transaction.date) == month_date.strftime('%Y-%m')
                ).scalar() or 0
                
                month_change = float(month_income) - float(month_expenses)
                running_net_worth -= month_change
                
                history.append({
                    'date': month_start.isoformat(),
                    'net_worth': round(running_net_worth, 2)
                })
        
        history.reverse()
        return history
    
    def project_future(self, months: int = 12, monthly_savings: float = None) -> Dict[str, Any]:
        """Project future net worth."""
        current = self.calculate_current()
        
        if monthly_savings is None:
            end_date = date.today()
            start_date = end_date - timedelta(days=90)
            
            income = self.db.query(func.sum(Transaction.amount)).filter(
                Transaction.user_id == self.user_id,
                Transaction.type == 'income',
                Transaction.date >= start_date
            ).scalar() or 0
            
            expenses = self.db.query(func.sum(Transaction.amount)).filter(
                Transaction.user_id == self.user_id,
                Transaction.type == 'expense',
                Transaction.date >= start_date
            ).scalar() or 0
            
            monthly_savings = (float(income) - float(expenses)) / 3
        
        projections = []
        running_net_worth = current['net_worth']
        
        for month in range(1, months + 1):
            running_net_worth += monthly_savings
            future_date = date.today() + timedelta(days=30 * month)
            projections.append({
                'date': future_date.isoformat(),
                'projected_net_worth': round(running_net_worth, 2),
                'month_number': month
            })
        
        return {
            'current_net_worth': current['net_worth'],
            'monthly_savings_rate': round(monthly_savings, 2),
            'projections': projections,
            'final_projected_net_worth': round(running_net_worth, 2),
            'total_growth': round(running_net_worth - current['net_worth'], 2)
        }


class TaxEstimator:
    """Basic income tax calculations."""
    
    GREEK_TAX_BRACKETS_2024 = [
        (10000, 0.09),
        (10000, 0.22),
        (10000, 0.28),
        (10000, 0.36),
        (float('inf'), 0.44)
    ]
    
    @staticmethod
    def estimate_greek_income_tax(annual_income: float, deductions: float = 0) -> Dict[str, Any]:
        """Estimate Greek income tax.
        
        Greek tax brackets (2024):
        - 0-10,000: 9%
        - 10,001-20,000: 22%
        - 20,001-30,000: 28%
        - 30,001-40,000: 36%
        - 40,001+: 44%
        """
        taxable_income = max(0, annual_income - deductions)
        
        tax = 0
        remaining = taxable_income
        tax_breakdown = []
        running_income = 0
        
        for bracket_amount, rate in TaxEstimator.GREEK_TAX_BRACKETS_2024:
            if remaining <= 0:
                break
            
            taxable_in_bracket = min(remaining, bracket_amount)
            tax_in_bracket = taxable_in_bracket * rate
            tax += tax_in_bracket
            remaining -= taxable_in_bracket
            
            if taxable_in_bracket > 0:
                tax_breakdown.append({
                    'bracket': f'€{running_income:,.0f} - €{running_income + bracket_amount:,.0f}' if bracket_amount != float('inf') else f'€{running_income:,.0f}+',
                    'rate': f'{rate * 100:.0f}%',
                    'taxable_amount': round(taxable_in_bracket, 2),
                    'tax': round(tax_in_bracket, 2)
                })
            
            running_income += bracket_amount
        
        effective_rate = (tax / taxable_income * 100) if taxable_income > 0 else 0
        
        net_income = annual_income - tax
        monthly_net = net_income / 12
        
        return {
            'gross_income': round(annual_income, 2),
            'deductions': round(deductions, 2),
            'taxable_income': round(taxable_income, 2),
            'total_tax': round(tax, 2),
            'effective_tax_rate': round(effective_rate, 2),
            'net_income': round(net_income, 2),
            'monthly_net_income': round(monthly_net, 2),
            'tax_breakdown': tax_breakdown,
            'country': 'Greece',
            'tax_year': 2024
        }
    
    @staticmethod
    def compare_income_scenarios(incomes: List[float]) -> List[Dict[str, Any]]:
        """Compare tax impact across different income levels."""
        results = []
        
        for income in incomes:
            result = TaxEstimator.estimate_greek_income_tax(income)
            results.append({
                'gross_income': income,
                'total_tax': result['total_tax'],
                'net_income': result['net_income'],
                'effective_rate': result['effective_tax_rate']
            })
        
        return results
    
    @staticmethod
    def calculate_marginal_benefit(current_income: float, additional_income: float) -> Dict[str, Any]:
        """Calculate the marginal tax on additional income."""
        current_tax = TaxEstimator.estimate_greek_income_tax(current_income)
        new_tax = TaxEstimator.estimate_greek_income_tax(current_income + additional_income)
        
        additional_tax = new_tax['total_tax'] - current_tax['total_tax']
        marginal_rate = (additional_tax / additional_income * 100) if additional_income > 0 else 0
        net_additional = additional_income - additional_tax
        
        return {
            'current_income': round(current_income, 2),
            'additional_income': round(additional_income, 2),
            'new_total_income': round(current_income + additional_income, 2),
            'additional_tax': round(additional_tax, 2),
            'marginal_tax_rate': round(marginal_rate, 2),
            'net_additional_income': round(net_additional, 2),
            'take_home_percentage': round((net_additional / additional_income * 100) if additional_income > 0 else 0, 2)
        }
