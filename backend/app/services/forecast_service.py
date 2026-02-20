"""
Forecasting Service for Financial Predictions

Provides:
1. Spending Forecast - ARIMA-based spending predictions with confidence intervals
2. Cashflow Projection - Project future account balances
3. Goal Achievement Predictor - Predict goal completion dates
"""

from datetime import date, timedelta, datetime
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict
import math
import warnings

import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import User, Transaction, Account, FinancialGoal


class SpendingForecaster:
    """ARIMA-based spending predictions with confidence intervals."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def get_historical_spending(self, days: int = 180) -> List[Dict[str, Any]]:
        """Get daily spending data for the specified period."""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        results = self.db.query(
            Transaction.date,
            func.sum(Transaction.amount).label('total')
        ).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).group_by(Transaction.date).order_by(Transaction.date).all()
        
        daily_data = {r.date: float(r.total) for r in results}
        
        all_days = []
        current = start_date
        while current <= end_date:
            all_days.append({
                'date': current.isoformat(),
                'amount': daily_data.get(current, 0)
            })
            current += timedelta(days=1)
        
        return all_days
    
    def get_weekly_spending(self, weeks: int = 26) -> List[float]:
        """Get weekly spending totals."""
        end_date = date.today()
        start_date = end_date - timedelta(weeks=weeks)
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        weekly_totals = defaultdict(float)
        for tx in transactions:
            week_key = tx.date.isocalendar()[:2]
            weekly_totals[week_key] += tx.amount
        
        sorted_weeks = sorted(weekly_totals.keys())
        return [weekly_totals[week] for week in sorted_weeks]
    
    def get_monthly_spending(self, months: int = 12) -> List[Dict[str, Any]]:
        """Get monthly spending totals."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        results = self.db.query(
            func.strftime('%Y-%m', Transaction.date).label('month'),
            func.sum(Transaction.amount).label('total')
        ).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).group_by(func.strftime('%Y-%m', Transaction.date)).order_by('month').all()
        
        return [{'month': r.month, 'amount': float(r.total)} for r in results]
    
    def forecast_spending(self, forecast_days: int = 30, confidence_level: float = 0.95) -> Dict[str, Any]:
        """Generate spending forecast using ARIMA model."""
        weekly_data = self.get_weekly_spending(weeks=26)
        
        if len(weekly_data) < 8:
            return self._simple_forecast(forecast_days)
        
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                
                y = np.array(weekly_data)
                
                model = ARIMA(y, order=(1, 1, 1))
                fitted = model.fit()
                
                forecast_weeks = max(1, forecast_days // 7)
                forecast_result = fitted.get_forecast(steps=forecast_weeks)
                
                forecast_mean = forecast_result.predicted_mean
                conf_int = forecast_result.conf_int(alpha=1 - confidence_level)
                
                daily_forecast = []
                current_date = date.today() + timedelta(days=1)
                
                for week_idx in range(forecast_weeks):
                    weekly_amount = float(forecast_mean.iloc[week_idx]) if hasattr(forecast_mean, 'iloc') else float(forecast_mean[week_idx])
                    weekly_lower = float(conf_int.iloc[week_idx, 0]) if hasattr(conf_int, 'iloc') else float(conf_int[week_idx, 0])
                    weekly_upper = float(conf_int.iloc[week_idx, 1]) if hasattr(conf_int, 'iloc') else float(conf_int[week_idx, 1])
                    
                    weekly_lower = max(0, weekly_lower)
                    weekly_amount = max(0, weekly_amount)
                    weekly_upper = max(weekly_amount, weekly_upper)
                    
                    daily_amount = weekly_amount / 7
                    daily_lower = weekly_lower / 7
                    daily_upper = weekly_upper / 7
                    
                    for day in range(7):
                        if len(daily_forecast) >= forecast_days:
                            break
                        daily_forecast.append({
                            'date': current_date.isoformat(),
                            'predicted': round(daily_amount, 2),
                            'lower_bound': round(daily_lower, 2),
                            'upper_bound': round(daily_upper, 2)
                        })
                        current_date += timedelta(days=1)
                
                total_forecast = sum(d['predicted'] for d in daily_forecast)
                avg_daily = total_forecast / len(daily_forecast) if daily_forecast else 0
                
                historical_monthly = self.get_monthly_spending(months=3)
                if historical_monthly:
                    recent_avg = sum(m['amount'] for m in historical_monthly[-3:]) / 3
                    forecast_monthly = avg_daily * 30
                    change_pct = ((forecast_monthly - recent_avg) / recent_avg * 100) if recent_avg > 0 else 0
                else:
                    recent_avg = 0
                    change_pct = 0
                
                return {
                    'forecast': daily_forecast,
                    'summary': {
                        'total_predicted': round(total_forecast, 2),
                        'average_daily': round(avg_daily, 2),
                        'forecast_days': forecast_days,
                        'confidence_level': confidence_level,
                        'model': 'ARIMA(1,1,1)',
                        'historical_monthly_avg': round(recent_avg, 2),
                        'predicted_monthly': round(avg_daily * 30, 2),
                        'change_percentage': round(change_pct, 1)
                    },
                    'model_info': {
                        'aic': fitted.aic,
                        'bic': fitted.bic
                    }
                }
                
        except Exception as e:
            return self._simple_forecast(forecast_days, error=str(e))
    
    def _simple_forecast(self, forecast_days: int, error: str = None) -> Dict[str, Any]:
        """Fallback simple forecast using moving average."""
        monthly_data = self.get_monthly_spending(months=6)
        
        if not monthly_data:
            return {
                'forecast': [],
                'summary': {
                    'total_predicted': 0,
                    'average_daily': 0,
                    'forecast_days': forecast_days,
                    'model': 'insufficient_data'
                },
                'error': 'Insufficient historical data for forecasting'
            }
        
        amounts = [m['amount'] for m in monthly_data]
        
        if len(amounts) >= 3:
            weights = [0.5, 0.3, 0.2]
            recent = amounts[-3:]
            weighted_avg = sum(a * w for a, w in zip(recent, weights))
        else:
            weighted_avg = sum(amounts) / len(amounts)
        
        daily_avg = weighted_avg / 30
        std_dev = np.std(amounts) / 30 if len(amounts) > 1 else daily_avg * 0.2
        
        daily_forecast = []
        current_date = date.today() + timedelta(days=1)
        
        for _ in range(forecast_days):
            daily_forecast.append({
                'date': current_date.isoformat(),
                'predicted': round(daily_avg, 2),
                'lower_bound': round(max(0, daily_avg - 1.96 * std_dev), 2),
                'upper_bound': round(daily_avg + 1.96 * std_dev, 2)
            })
            current_date += timedelta(days=1)
        
        total_forecast = daily_avg * forecast_days
        
        result = {
            'forecast': daily_forecast,
            'summary': {
                'total_predicted': round(total_forecast, 2),
                'average_daily': round(daily_avg, 2),
                'forecast_days': forecast_days,
                'confidence_level': 0.95,
                'model': 'weighted_moving_average',
                'historical_monthly_avg': round(weighted_avg, 2),
                'predicted_monthly': round(weighted_avg, 2),
                'change_percentage': 0
            }
        }
        
        if error:
            result['fallback_reason'] = error
        
        return result
    
    def forecast_by_category(self, forecast_days: int = 30) -> Dict[str, Any]:
        """Generate spending forecast broken down by category."""
        end_date = date.today()
        start_date = end_date - timedelta(days=90)
        
        from app.models import Category
        
        results = self.db.query(
            Category.name,
            func.strftime('%Y-%m', Transaction.date).label('month'),
            func.sum(Transaction.amount).label('total')
        ).join(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).group_by(Category.name, func.strftime('%Y-%m', Transaction.date)).all()
        
        category_data = defaultdict(list)
        for r in results:
            category_data[r.name].append(float(r.total))
        
        category_forecasts = []
        for cat_name, amounts in category_data.items():
            if amounts:
                avg_monthly = sum(amounts) / len(amounts)
                forecast_amount = avg_monthly * (forecast_days / 30)
                
                category_forecasts.append({
                    'category': cat_name,
                    'historical_monthly_avg': round(avg_monthly, 2),
                    'forecast_amount': round(forecast_amount, 2),
                    'confidence': 0.7 + min(0.25, len(amounts) * 0.05)
                })
        
        category_forecasts.sort(key=lambda x: x['forecast_amount'], reverse=True)
        
        total_forecast = sum(c['forecast_amount'] for c in category_forecasts)
        
        return {
            'category_forecasts': category_forecasts,
            'total_forecast': round(total_forecast, 2),
            'forecast_days': forecast_days
        }


class CashflowProjector:
    """Project future account balances based on historical patterns."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def get_current_balances(self) -> Dict[str, float]:
        """Get current account balances."""
        accounts = self.db.query(Account).filter(
            Account.user_id == self.user_id,
            Account.is_active == True
        ).all()
        
        return {a.name: float(a.balance) for a in accounts}
    
    def get_average_cashflow(self, months: int = 3) -> Dict[str, float]:
        """Calculate average monthly income and expenses."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
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
        
        return {
            'monthly_income': float(income) / months,
            'monthly_expenses': float(expenses) / months,
            'monthly_net': (float(income) - float(expenses)) / months
        }
    
    def project_balance(self, months_ahead: int = 6) -> Dict[str, Any]:
        """Project future balance based on cashflow patterns."""
        current_balances = self.get_current_balances()
        total_current = sum(current_balances.values())
        
        cashflow = self.get_average_cashflow()
        monthly_net = cashflow['monthly_net']
        
        projections = []
        current_date = date.today()
        running_balance = total_current
        
        for month in range(1, months_ahead + 1):
            future_date = current_date + timedelta(days=30 * month)
            running_balance += monthly_net
            
            projections.append({
                'month': future_date.strftime('%Y-%m'),
                'projected_balance': round(running_balance, 2),
                'cumulative_income': round(cashflow['monthly_income'] * month, 2),
                'cumulative_expenses': round(cashflow['monthly_expenses'] * month, 2),
                'month_number': month
            })
        
        min_balance = min(p['projected_balance'] for p in projections)
        max_balance = max(p['projected_balance'] for p in projections)
        
        if monthly_net < 0:
            months_until_zero = abs(total_current / monthly_net) if monthly_net != 0 else float('inf')
            if months_until_zero < 12:
                warning = f"At current rate, balance will reach zero in approximately {months_until_zero:.1f} months"
            else:
                warning = None
        else:
            warning = None
            months_until_zero = None
        
        return {
            'current_balance': round(total_current, 2),
            'account_breakdown': current_balances,
            'monthly_cashflow': {
                'income': round(cashflow['monthly_income'], 2),
                'expenses': round(cashflow['monthly_expenses'], 2),
                'net': round(monthly_net, 2)
            },
            'projections': projections,
            'summary': {
                'final_projected_balance': round(projections[-1]['projected_balance'], 2) if projections else total_current,
                'total_change': round(monthly_net * months_ahead, 2),
                'min_balance': round(min_balance, 2),
                'max_balance': round(max_balance, 2),
                'trend': 'positive' if monthly_net > 0 else 'negative' if monthly_net < 0 else 'stable'
            },
            'warning': warning,
            'months_until_zero': round(months_until_zero, 1) if months_until_zero and months_until_zero != float('inf') else None
        }
    
    def project_with_scenarios(self, months_ahead: int = 12) -> Dict[str, Any]:
        """Project balance under different scenarios."""
        base_projection = self.project_balance(months_ahead)
        cashflow = self.get_average_cashflow()
        current_balance = base_projection['current_balance']
        
        scenarios = {
            'baseline': base_projection['projections'],
            'optimistic': [],
            'pessimistic': [],
            'savings_boost': []
        }
        
        optimistic_net = cashflow['monthly_net'] * 1.2
        pessimistic_net = cashflow['monthly_net'] * 0.8
        savings_net = cashflow['monthly_net'] + cashflow['monthly_income'] * 0.05
        
        for month in range(1, months_ahead + 1):
            scenarios['optimistic'].append({
                'month': (date.today() + timedelta(days=30 * month)).strftime('%Y-%m'),
                'projected_balance': round(current_balance + optimistic_net * month, 2)
            })
            scenarios['pessimistic'].append({
                'month': (date.today() + timedelta(days=30 * month)).strftime('%Y-%m'),
                'projected_balance': round(current_balance + pessimistic_net * month, 2)
            })
            scenarios['savings_boost'].append({
                'month': (date.today() + timedelta(days=30 * month)).strftime('%Y-%m'),
                'projected_balance': round(current_balance + savings_net * month, 2)
            })
        
        return {
            'current_balance': current_balance,
            'scenarios': scenarios,
            'scenario_descriptions': {
                'baseline': 'Based on current spending patterns',
                'optimistic': '20% improvement in net cashflow',
                'pessimistic': '20% decline in net cashflow',
                'savings_boost': '5% additional savings from income'
            },
            'final_balances': {
                'baseline': scenarios['baseline'][-1]['projected_balance'] if scenarios['baseline'] else current_balance,
                'optimistic': scenarios['optimistic'][-1]['projected_balance'] if scenarios['optimistic'] else current_balance,
                'pessimistic': scenarios['pessimistic'][-1]['projected_balance'] if scenarios['pessimistic'] else current_balance,
                'savings_boost': scenarios['savings_boost'][-1]['projected_balance'] if scenarios['savings_boost'] else current_balance
            }
        }


class GoalAchievementPredictor:
    """Predict goal completion dates based on current progress and patterns."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def predict_goal_completion(self, goal_id: int) -> Dict[str, Any]:
        """Predict when a specific goal will be achieved."""
        goal = self.db.query(Goal).filter(
            Goal.id == goal_id,
            Goal.user_id == self.user_id
        ).first()
        
        if not goal:
            return {'error': 'Goal not found'}
        
        remaining = goal.target_amount - goal.current_amount
        
        if remaining <= 0:
            return {
                'goal_id': goal_id,
                'goal_name': goal.name,
                'status': 'completed',
                'completion_date': date.today().isoformat()
            }
        
        end_date = date.today()
        start_date = goal.created_at.date() if hasattr(goal.created_at, 'date') else goal.created_at
        days_elapsed = (end_date - start_date).days
        
        if days_elapsed <= 0 or goal.current_amount <= 0:
            if goal.target_date:
                days_to_target = (goal.target_date - end_date).days
                if days_to_target > 0:
                    required_daily = remaining / days_to_target
                    return {
                        'goal_id': goal_id,
                        'goal_name': goal.name,
                        'status': 'in_progress',
                        'current_amount': float(goal.current_amount),
                        'target_amount': float(goal.target_amount),
                        'remaining': float(remaining),
                        'target_date': goal.target_date.isoformat(),
                        'required_daily_savings': round(required_daily, 2),
                        'required_monthly_savings': round(required_daily * 30, 2),
                        'prediction_method': 'target_based'
                    }
            
            return {
                'goal_id': goal_id,
                'goal_name': goal.name,
                'status': 'in_progress',
                'current_amount': float(goal.current_amount),
                'target_amount': float(goal.target_amount),
                'remaining': float(remaining),
                'prediction': 'Insufficient data to predict completion date'
            }
        
        daily_rate = goal.current_amount / days_elapsed
        days_to_completion = remaining / daily_rate if daily_rate > 0 else float('inf')
        
        if days_to_completion == float('inf'):
            predicted_date = None
            on_track = False
        else:
            predicted_date = end_date + timedelta(days=int(days_to_completion))
            on_track = goal.target_date is None or predicted_date <= goal.target_date
        
        progress_percentage = (goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0
        
        result = {
            'goal_id': goal_id,
            'goal_name': goal.name,
            'status': 'in_progress',
            'current_amount': float(goal.current_amount),
            'target_amount': float(goal.target_amount),
            'remaining': float(remaining),
            'progress_percentage': round(progress_percentage, 1),
            'daily_savings_rate': round(daily_rate, 2),
            'monthly_savings_rate': round(daily_rate * 30, 2),
            'predicted_completion_date': predicted_date.isoformat() if predicted_date else None,
            'days_to_completion': int(days_to_completion) if days_to_completion != float('inf') else None,
            'on_track': on_track
        }
        
        if goal.target_date:
            result['target_date'] = goal.target_date.isoformat()
            if predicted_date:
                days_difference = (predicted_date - goal.target_date).days
                result['days_ahead_behind'] = days_difference
                result['ahead_or_behind'] = 'behind' if days_difference > 0 else 'ahead' if days_difference < 0 else 'on_time'
        
        return result
    
    def predict_all_goals(self) -> List[Dict[str, Any]]:
        """Predict completion for all active goals."""
        goals = self.db.query(Goal).filter(
            Goal.user_id == self.user_id,
            Goal.is_active == True
        ).all()
        
        predictions = []
        for goal in goals:
            prediction = self.predict_goal_completion(goal.id)
            predictions.append(prediction)
        
        predictions.sort(key=lambda x: x.get('days_to_completion') or float('inf'))
        
        return predictions
    
    def suggest_savings_plan(self, goal_id: int) -> Dict[str, Any]:
        """Suggest a savings plan to meet goal target date."""
        goal = self.db.query(Goal).filter(
            Goal.id == goal_id,
            Goal.user_id == self.user_id
        ).first()
        
        if not goal:
            return {'error': 'Goal not found'}
        
        remaining = goal.target_amount - goal.current_amount
        
        if remaining <= 0:
            return {
                'goal_id': goal_id,
                'goal_name': goal.name,
                'status': 'completed',
                'message': 'Goal already achieved!'
            }
        
        end_date = date.today()
        start_date = goal.created_at.date() if hasattr(goal.created_at, 'date') else goal.created_at
        days_elapsed = (end_date - start_date).days
        current_daily_rate = goal.current_amount / days_elapsed if days_elapsed > 0 else 0
        
        plans = []
        
        if goal.target_date:
            days_to_target = (goal.target_date - end_date).days
            if days_to_target > 0:
                required_daily = remaining / days_to_target
                plans.append({
                    'name': 'Meet Target Date',
                    'daily_amount': round(required_daily, 2),
                    'weekly_amount': round(required_daily * 7, 2),
                    'monthly_amount': round(required_daily * 30, 2),
                    'completion_date': goal.target_date.isoformat(),
                    'feasibility': 'challenging' if required_daily > current_daily_rate * 1.5 else 'achievable'
                })
        
        for months in [3, 6, 12, 24]:
            daily_amount = remaining / (months * 30)
            plans.append({
                'name': f'{months} Month Plan',
                'daily_amount': round(daily_amount, 2),
                'weekly_amount': round(daily_amount * 7, 2),
                'monthly_amount': round(daily_amount * 30, 2),
                'completion_date': (end_date + timedelta(days=months * 30)).isoformat(),
                'feasibility': 'easy' if daily_amount < current_daily_rate else 'moderate' if daily_amount < current_daily_rate * 1.5 else 'challenging'
            })
        
        return {
            'goal_id': goal_id,
            'goal_name': goal.name,
            'current_amount': float(goal.current_amount),
            'target_amount': float(goal.target_amount),
            'remaining': float(remaining),
            'current_daily_rate': round(current_daily_rate, 2),
            'suggested_plans': plans
        }
