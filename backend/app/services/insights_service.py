"""
Smart Spending Insights Service with Statistical Predictive Models

This service provides:
1. Pattern detection using statistical analysis
2. Trend analysis with linear regression
3. Anomaly detection using Z-score and IQR methods
4. Predictive modeling using time series analysis
5. Spending forecasts with confidence intervals
"""

from datetime import date, timedelta, datetime
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict
import math
from dataclasses import dataclass

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from fastapi import HTTPException

from app.models import User, Transaction, Category, Budget, UserInsight, SpendingPattern


@dataclass
class StatisticalSummary:
    """Statistical summary of a dataset."""
    mean: float
    median: float
    std_dev: float
    variance: float
    min_val: float
    max_val: float
    q1: float  # 25th percentile
    q3: float  # 75th percentile
    count: int
    
    @property
    def coefficient_of_variation(self) -> float:
        """Calculate coefficient of variation (std_dev / mean)."""
        return self.std_dev / self.mean if self.mean != 0 else 0
    
    @property
    def iqr(self) -> float:
        """Calculate interquartile range."""
        return self.q3 - self.q1


@dataclass
class TrendAnalysis:
    """Trend analysis results."""
    slope: float
    intercept: float
    r_squared: float
    trend_direction: str  # 'increasing', 'decreasing', 'stable'
    trend_percentage: float
    significance: float  # p-value


class StatisticalAnalyzer:
    """Statistical analysis utilities."""
    
    @staticmethod
    def calculate_summary(data: List[float]) -> StatisticalSummary:
        """Calculate statistical summary of data."""
        if not data:
            return StatisticalSummary(0, 0, 0, 0, 0, 0, 0, 0, 0)
        
        n = len(data)
        sorted_data = sorted(data)
        
        mean = sum(data) / n
        variance = sum((x - mean) ** 2 for x in data) / n
        std_dev = math.sqrt(variance)
        
        # Median
        mid = n // 2
        median = sorted_data[mid] if n % 2 else (sorted_data[mid - 1] + sorted_data[mid]) / 2
        
        # Quartiles
        q1_idx = n // 4
        q3_idx = 3 * n // 4
        q1 = sorted_data[q1_idx] if q1_idx < n else sorted_data[0]
        q3 = sorted_data[q3_idx] if q3_idx < n else sorted_data[-1]
        
        return StatisticalSummary(
            mean=mean,
            median=median,
            std_dev=std_dev,
            variance=variance,
            min_val=min(sorted_data),
            max_val=max(sorted_data),
            q1=q1,
            q3=q3,
            count=n
        )
    
    @staticmethod
    def linear_regression(x: List[float], y: List[float]) -> TrendAnalysis:
        """Perform linear regression analysis.
        
        Uses the least squares method to find the best fit line.
        """
        n = len(x)
        if n < 2 or len(y) != n:
            return TrendAnalysis(0, 0, 0, 'stable', 0, 1.0)
        
        # Calculate means
        mean_x = sum(x) / n
        mean_y = sum(y) / n
        
        # Calculate slope (b) and intercept (a)
        numerator = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
        denominator = sum((x[i] - mean_x) ** 2 for i in range(n))
        
        if denominator == 0:
            return TrendAnalysis(0, mean_y, 0, 'stable', 0, 1.0)
        
        slope = numerator / denominator
        intercept = mean_y - slope * mean_x
        
        # Calculate R-squared
        ss_res = sum((y[i] - (intercept + slope * x[i])) ** 2 for i in range(n))
        ss_tot = sum((y[i] - mean_y) ** 2 for i in range(n))
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        # Determine trend direction
        if slope > 0.01:
            trend_direction = 'increasing'
        elif slope < -0.01:
            trend_direction = 'decreasing'
        else:
            trend_direction = 'stable'
        
        # Calculate trend percentage (relative change)
        first_val = intercept + slope * x[0]
        last_val = intercept + slope * x[-1]
        trend_percentage = ((last_val - first_val) / abs(first_val) * 100) if first_val != 0 else 0
        
        return TrendAnalysis(
            slope=slope,
            intercept=intercept,
            r_squared=r_squared,
            trend_direction=trend_direction,
            trend_percentage=trend_percentage,
            significance=1 - r_squared  # simplified significance measure
        )
    
    @staticmethod
    def detect_anomalies_zscore(data: List[float], threshold: float = 2.5) -> List[Tuple[int, float, float]]:
        """Detect anomalies using Z-score method.
        
        Returns: List of (index, value, z_score) for anomalies
        """
        if len(data) < 3:
            return []
        
        summary = StatisticalAnalyzer.calculate_summary(data)
        if summary.std_dev == 0:
            return []
        
        anomalies = []
        for i, value in enumerate(data):
            z_score = (value - summary.mean) / summary.std_dev
            if abs(z_score) > threshold:
                anomalies.append((i, value, z_score))
        
        return anomalies
    
    @staticmethod
    def detect_anomalies_iqr(data: List[float]) -> List[Tuple[int, float]]:
        """Detect anomalies using Interquartile Range (IQR) method.
        
        Returns: List of (index, value) for anomalies
        """
        if len(data) < 4:
            return []
        
        summary = StatisticalAnalyzer.calculate_summary(data)
        iqr = summary.iqr
        lower_bound = summary.q1 - 1.5 * iqr
        upper_bound = summary.q3 + 1.5 * iqr
        
        anomalies = []
        for i, value in enumerate(data):
            if value < lower_bound or value > upper_bound:
                anomalies.append((i, value))
        
        return anomalies
    
    @staticmethod
    def moving_average(data: List[float], window: int = 3) -> List[float]:
        """Calculate simple moving average."""
        if window <= 0 or len(data) < window:
            return data
        
        result = []
        for i in range(len(data)):
            if i < window - 1:
                # Use available data for initial values
                result.append(sum(data[:i+1]) / (i+1))
            else:
                result.append(sum(data[i-window+1:i+1]) / window)
        return result
    
    @staticmethod
    def exponential_smoothing(data: List[float], alpha: float = 0.3) -> List[float]:
        """Calculate exponential smoothing forecast.
        
        alpha: smoothing factor (0 < alpha < 1)
        """
        if not data or alpha <= 0 or alpha >= 1:
            return data
        
        result = [data[0]]
        for i in range(1, len(data)):
            smoothed = alpha * data[i] + (1 - alpha) * result[i-1]
            result.append(smoothed)
        
        return result
    
    @staticmethod
    def calculate_confidence_interval(data: List[float], confidence: float = 0.95) -> Tuple[float, float]:
        """Calculate confidence interval for the mean.
        
        Uses t-distribution approximation.
        """
        if not data or len(data) < 2:
            return (0, 0)
        
        summary = StatisticalAnalyzer.calculate_summary(data)
        n = summary.count
        
        # Z-values for common confidence levels
        z_values = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576}
        z = z_values.get(confidence, 1.96)
        
        margin_of_error = z * (summary.std_dev / math.sqrt(n))
        
        return (summary.mean - margin_of_error, summary.mean + margin_of_error)


class InsightsService:
    """Generate intelligent financial insights using statistical analysis."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.analyzer = StatisticalAnalyzer()
    
    def generate_insights(self, days: int = 30) -> List[UserInsight]:
        """Generate all insights for a user."""
        insights = []
        
        # Generate different types of insights
        insights.extend(self._check_spending_increases(days))
        insights.extend(self._check_budget_status())
        insights.extend(self._detect_spending_anomalies(days))
        insights.extend(self._identify_savings_opportunities(days))
        insights.extend(self._analyze_seasonal_patterns(days))
        
        # Save new insights to database
        for insight in insights:
            self._save_insight(insight)
        
        # Return all active (non-dismissed) insights
        return self._get_active_insights()
    
    def _get_active_insights(self) -> List[UserInsight]:
        """Get all active (non-dismissed) insights for user."""
        return self.db.query(UserInsight).filter(
            UserInsight.user_id == self.user_id,
            UserInsight.is_dismissed == False,
            or_(
                UserInsight.valid_until >= date.today(),
                UserInsight.valid_until.is_(None)
            )
        ).order_by(UserInsight.created_at.desc()).all()
    
    def _save_insight(self, insight_data: Dict[str, Any]) -> UserInsight:
        """Save insight to database, avoiding duplicates."""
        # Check for existing similar insight
        existing = self.db.query(UserInsight).filter(
            UserInsight.user_id == self.user_id,
            UserInsight.type == insight_data['type'],
            UserInsight.category == insight_data.get('category'),
            UserInsight.is_dismissed == False
        ).first()
        
        if existing:
            # Update existing insight
            existing.metric_value = insight_data.get('metric_value')
            existing.comparison_value = insight_data.get('comparison_value')
            existing.percentage_change = insight_data.get('percentage_change')
            existing.description = insight_data['description']
            existing.created_at = datetime.utcnow()
            self.db.commit()
            return existing
        
        # Create new insight
        insight = UserInsight(
            user_id=self.user_id,
            **insight_data
        )
        self.db.add(insight)
        self.db.commit()
        self.db.refresh(insight)
        return insight
    
    def _check_spending_increases(self, days: int = 30) -> List[Dict]:
        """Detect categories with significant spending increases."""
        insights = []
        
        # Get current period
        current_end = date.today()
        current_start = current_end - timedelta(days=days)
        
        # Get previous period
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days)
        
        current_spending = self._get_category_spending(current_start, current_end)
        previous_spending = self._get_category_spending(previous_start, previous_end)
        
        for category_name, current_amount in current_spending.items():
            previous_amount = previous_spending.get(category_name, 0)
            
            if previous_amount > 0:
                increase_pct = ((current_amount - previous_amount) / previous_amount) * 100
                
                if increase_pct >= 30:  # 30% increase threshold
                    severity = 'alert' if increase_pct >= 50 else 'warning'
                    
                    insights.append({
                        'type': 'spending_increase',
                        'category': category_name,
                        'severity': severity,
                        'title': f"📈 {category_name} spending up {increase_pct:.0f}%",
                        'description': f"You spent €{current_amount:.2f} on {category_name} in the last {days} days, "
                                     f"compared to €{previous_amount:.2f} in the previous period. "
                                     f"That's an increase of {increase_pct:.1f}%.",
                        'metric_value': current_amount,
                        'comparison_value': previous_amount,
                        'percentage_change': increase_pct,
                        'valid_until': date.today() + timedelta(days=14)
                    })
        
        return insights
    
    def _check_budget_status(self) -> List[Dict]:
        """Check budget progress and generate alerts."""
        insights = []
        
        budgets = self.db.query(Budget).filter(
            Budget.user_id == self.user_id,
            Budget.is_active == True
        ).all()
        
        for budget in budgets:
            # Get spending for this budget
            budget_categories = [bc.category_id for bc in budget.budget_categories]
            
            current_month_start = date.today().replace(day=1)
            current_month_end = date.today()
            
            spent = self.db.query(func.sum(Transaction.amount)).filter(
                Transaction.user_id == self.user_id,
                Transaction.type == 'expense',
                Transaction.category_id.in_(budget_categories),
                Transaction.date >= current_month_start,
                Transaction.date <= current_month_end
            ).scalar() or 0
            
            percentage = (spent / budget.amount * 100) if budget.amount > 0 else 0
            
            if percentage >= 80:
                severity = 'alert' if percentage >= 100 else 'warning'
                remaining = budget.amount - spent
                
                insights.append({
                    'type': 'budget_alert',
                    'category': budget.name,
                    'severity': severity,
                    'title': f"💰 {budget.name} budget {percentage:.0f}% used",
                    'description': f"You've used {percentage:.0f}% of your {budget.name} budget (€{spent:.2f} of €{budget.amount:.2f}). "
                                 f"Remaining: €{remaining:.2f}",
                    'metric_value': spent,
                    'comparison_value': budget.amount,
                    'percentage_change': percentage,
                    'valid_until': budget.end_date
                })
        
        return insights
    
    def _detect_spending_anomalies(self, days: int = 30) -> List[Dict]:
        """Detect unusual spending patterns using statistical methods."""
        insights = []
        
        # Get historical spending data
        end_date = date.today()
        start_date = end_date - timedelta(days=180)  # 6 months of data
        
        transactions = self.db.query(Transaction, Category.name.label('category_name')).join(
            Category, Transaction.category_id == Category.id
        ).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).all()
        
        # Group by category and analyze each
        category_data = defaultdict(list)
        for tx, cat_name in transactions:
            category_data[cat_name].append({
                'amount': tx.amount,
                'date': tx.date
            })
        
        for category_name, data in category_data.items():
            if len(data) < 5:  # Need minimum data points
                continue
            
            amounts = [d['amount'] for d in data]
            summary = self.analyzer.calculate_summary(amounts)
            
            # Check for recent anomalies
            recent_data = [d for d in data if d['date'] >= end_date - timedelta(days=days)]
            
            for recent in recent_data:
                z_score = (recent['amount'] - summary.mean) / summary.std_dev if summary.std_dev > 0 else 0
                
                # If z-score > 2.5, it's an anomaly
                if abs(z_score) > 2.5:
                    severity = 'alert' if abs(z_score) > 3 else 'warning'
                    direction = 'high' if z_score > 0 else 'low'
                    
                    insights.append({
                        'type': 'spending_anomaly',
                        'category': category_name,
                        'severity': severity,
                        'title': f"⚠️ Unusual {direction} spending in {category_name}",
                        'description': f"Detected an unusual transaction of €{recent['amount']:.2f} in {category_name}. "
                                     f"This is {abs(z_score):.1f} standard deviations {direction}er than your average (€{summary.mean:.2f}).",
                        'metric_value': recent['amount'],
                        'comparison_value': summary.mean,
                        'percentage_change': z_score,
                        'valid_until': date.today() + timedelta(days=7)
                    })
        
        return insights
    
    def _identify_savings_opportunities(self, days: int = 30) -> List[Dict]:
        """Identify potential savings opportunities."""
        insights = []
        
        # Analyze recurring subscriptions
        recurring = self._detect_recurring_transactions()
        
        if recurring:
            total_recurring = sum(r['average_amount'] for r in recurring)
            
            insights.append({
                'type': 'savings_opportunity',
                'category': 'recurring_expenses',
                'severity': 'info',
                'title': f"💡 You have €{total_recurring:.2f} in recurring expenses",
                'description': f"We detected {len(recurring)} recurring payment(s) totaling €{total_recurring:.2f} per month. "
                             f"Review these subscriptions to find potential savings.",
                'metric_value': total_recurring,
                'valid_until': date.today() + timedelta(days=30)
            })
        
        # Check for high-variance categories
        variance_insights = self._analyze_spending_variance(days)
        insights.extend(variance_insights)
        
        return insights
    
    def _detect_recurring_transactions(self) -> List[Dict]:
        """Detect recurring transaction patterns."""
        end_date = date.today()
        start_date = end_date - timedelta(days=180)
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        # Group by description similarity
        pattern_groups = defaultdict(list)
        for tx in transactions:
            # Normalize description for grouping
            key = tx.description.lower().strip()[:30]
            pattern_groups[key].append(tx)
        
        recurring = []
        for key, tx_list in pattern_groups.items():
            if len(tx_list) >= 3:  # At least 3 occurrences
                amounts = [tx.amount for tx in tx_list]
                summary = self.analyzer.calculate_summary(amounts)
                
                # Check if amounts are similar (low variance)
                cv = summary.coefficient_of_variation
                if cv < 0.3:  # Low variance suggests recurring
                    recurring.append({
                        'description': tx_list[0].description,
                        'average_amount': summary.mean,
                        'occurrences': len(tx_list),
                        'category': tx_list[0].category.name if tx_list[0].category else 'Uncategorized'
                    })
        
        return recurring
    
    def _analyze_spending_variance(self, days: int = 30) -> List[Dict]:
        """Analyze spending variance to identify optimization opportunities."""
        insights = []
        
        end_date = date.today()
        start_date = end_date - timedelta(days=90)
        
        category_spending = self._get_category_spending_by_month(start_date, end_date)
        
        for category_name, monthly_data in category_spending.items():
            amounts = list(monthly_data.values())
            if len(amounts) < 2:
                continue
            
            summary = self.analyzer.calculate_summary(amounts)
            cv = summary.coefficient_of_variation
            
            # High variance suggests inconsistent spending
            if cv > 0.5 and summary.mean > 100:
                potential_savings = summary.std_dev * 0.5  # Could reduce variance by 50%
                
                insights.append({
                    'type': 'savings_opportunity',
                    'category': category_name,
                    'severity': 'info',
                    'title': f"💡 Variable spending in {category_name}",
                    'description': f"Your {category_name} spending varies by {cv*100:.0f}% month-to-month (avg: €{summary.mean:.2f}). "
                                 f"Setting a consistent budget could save up to €{potential_savings:.2f} monthly.",
                    'metric_value': summary.mean,
                    'comparison_value': summary.std_dev,
                    'valid_until': date.today() + timedelta(days=30)
                })
        
        return insights
    
    def _analyze_seasonal_patterns(self, days: int = 30) -> List[Dict]:
        """Detect seasonal spending patterns."""
        insights = []
        
        end_date = date.today()
        start_date = end_date - timedelta(days=365)
        
        transactions = self.db.query(Transaction, Category.name.label('category_name')).join(
            Category, Transaction.category_id == Category.id
        ).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        # Group by month and category
        monthly_category_spending = defaultdict(lambda: defaultdict(float))
        for tx, cat_name in transactions:
            month_key = tx.date.strftime('%Y-%m')
            monthly_category_spending[cat_name][month_key] += tx.amount
        
        # Analyze each category for seasonality
        for category_name, monthly_data in monthly_category_spending.items():
            if len(monthly_data) < 6:  # Need at least 6 months of data
                continue
            
            amounts = list(monthly_data.values())
            summary = self.analyzer.calculate_summary(amounts)
            
            # Check for seasonal pattern (high variance)
            cv = summary.coefficient_of_variation
            if cv > 0.4:
                # Find peak months
                sorted_months = sorted(monthly_data.items(), key=lambda x: x[1], reverse=True)
                peak_month = sorted_months[0][0]
                peak_amount = sorted_months[0][1]
                
                insights.append({
                    'type': 'seasonal_pattern',
                    'category': category_name,
                    'severity': 'info',
                    'title': f"📅 Seasonal pattern detected: {category_name}",
                    'description': f"Your {category_name} spending shows seasonal variation (CV: {cv*100:.0f}%). "
                                 f"Peak spending typically occurs in {peak_month} (€{peak_amount:.2f}). "
                                 f"Average monthly spending: €{summary.mean:.2f}.",
                    'metric_value': peak_amount,
                    'comparison_value': summary.mean,
                    'valid_until': date.today() + timedelta(days=365)
                })
        
        return insights
    
    def _get_category_spending(self, start_date: date, end_date: date) -> Dict[str, float]:
        """Get total spending by category for a date range."""
        results = self.db.query(
            Category.name,
            func.sum(Transaction.amount).label('total')
        ).join(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).group_by(Category.name).all()
        
        return {r.name: float(r.total) for r in results}
    
    def _get_category_spending_by_month(self, start_date: date, end_date: date) -> Dict[str, Dict[str, float]]:
        """Get category spending grouped by month."""
        results = self.db.query(
            Category.name,
            func.strftime('%Y-%m', Transaction.date).label('month'),
            func.sum(Transaction.amount).label('total')
        ).join(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).group_by(Category.name, func.strftime('%Y-%m', Transaction.date)).all()
        
        data = defaultdict(dict)
        for r in results:
            data[r.name][r.month] = float(r.total)
        
        return dict(data)
    
    def analyze_trends(self, months: int = 6) -> Dict[str, Any]:
        """Analyze spending trends using linear regression."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30*months)
        
        # Get monthly totals
        monthly_data = self.db.query(
            func.strftime('%Y-%m', Transaction.date).label('month'),
            func.sum(Transaction.amount).label('total')
        ).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).group_by(func.strftime('%Y-%m', Transaction.date)).order_by('month').all()
        
        if len(monthly_data) < 3:
            return {'error': 'Insufficient data for trend analysis'}
        
        # Prepare data for regression
        x = list(range(len(monthly_data)))
        y = [float(m.total) for m in monthly_data]
        
        trend = self.analyzer.linear_regression(x, y)
        
        # Calculate moving average
        moving_avg = self.analyzer.moving_average(y, window=3)
        
        return {
            'months_analyzed': len(monthly_data),
            'trend_direction': trend.trend_direction,
            'trend_percentage': round(trend.trend_percentage, 2),
            'r_squared': round(trend.r_squared, 3),
            'slope': round(trend.slope, 2),
            'monthly_data': [
                {'month': m.month, 'amount': float(m.total)}
                for m in monthly_data
            ],
            'moving_average': moving_avg,
            'is_significant': trend.r_squared > 0.5
        }
    
    def _get_category_id(self, category_name: str) -> Optional[int]:
        """Get category ID by name."""
        category = self.db.query(Category).filter(
            Category.user_id == self.user_id,
            Category.name == category_name
        ).first()
        return category.id if category else None
    
    def get_spending_statistics(self, months: int = 6) -> Dict[str, Any]:
        """Get comprehensive spending statistics."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30*months)
        
        # Get all transactions
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        if not transactions:
            return {'error': 'No transaction data available'}
        
        amounts = [tx.amount for tx in transactions]
        summary = self.analyzer.calculate_summary(amounts)
        
        # Get monthly breakdown
        monthly_totals = defaultdict(float)
        for tx in transactions:
            month_key = tx.date.strftime('%Y-%m')
            monthly_totals[month_key] += tx.amount
        
        monthly_amounts = list(monthly_totals.values())
        monthly_summary = self.analyzer.calculate_summary(monthly_amounts)
        
        return {
            'period_months': months,
            'total_transactions': len(transactions),
            'total_spent': round(sum(amounts), 2),
            'transaction_statistics': {
                'mean': round(summary.mean, 2),
                'median': round(summary.median, 2),
                'std_dev': round(summary.std_dev, 2),
                'min': round(summary.min_val, 2),
                'max': round(summary.max_val, 2),
                'q1': round(summary.q1, 2),
                'q3': round(summary.q3, 2),
            },
            'monthly_statistics': {
                'mean': round(monthly_summary.mean, 2),
                'median': round(monthly_summary.median, 2),
                'std_dev': round(monthly_summary.std_dev, 2),
                'min': round(monthly_summary.min_val, 2),
                'max': round(monthly_summary.max_val, 2),
            },
            'average_transaction_size': round(summary.mean, 2),
            'average_monthly_spending': round(monthly_summary.mean, 2),
            'spending_volatility': round(monthly_summary.coefficient_of_variation, 3),
            'monthly_breakdown': [
                {'month': month, 'amount': round(amount, 2)}
                for month, amount in sorted(monthly_totals.items())
            ]
        }
    
    def detect_patterns(self) -> List[Dict[str, Any]]:
        """Detect and save spending patterns."""
        self.db.query(SpendingPattern).filter(
            SpendingPattern.user_id == self.user_id
        ).delete()
        
        patterns = []
        
        recurring = self._detect_recurring_transactions()
        for rec in recurring:
            pattern = SpendingPattern(
                user_id=self.user_id,
                pattern_type='recurring',
                category_id=self._get_category_id(rec['category']),
                description=f"Recurring: {rec['description']}",
                confidence_score=min(0.95, 0.7 + (rec['occurrences'] * 0.05)),
                frequency='monthly',
                average_amount=rec['average_amount'],
                first_detected=date.today() - timedelta(days=180),
                last_occurrence=date.today()
            )
            self.db.add(pattern)
            patterns.append({
                'type': 'recurring',
                'description': rec['description'],
                'category': rec['category'],
                'average_amount': rec['average_amount'],
                'occurrences': rec['occurrences'],
                'confidence': pattern.confidence_score
            })
        
        weekend_patterns = self._detect_weekend_weekday_patterns()
        patterns.extend(weekend_patterns)
        
        self.db.commit()
        return patterns
    
    def _detect_weekend_weekday_patterns(self) -> List[Dict[str, Any]]:
        """Detect if user spends more on weekends vs weekdays."""
        end_date = date.today()
        start_date = end_date - timedelta(days=90)
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        weekend_total = 0
        weekday_total = 0
        weekend_count = 0
        weekday_count = 0
        
        for tx in transactions:
            # weekday(): Monday=0, Sunday=6
            if tx.date.weekday() >= 5:  # Saturday or Sunday
                weekend_total += tx.amount
                weekend_count += 1
            else:
                weekday_total += tx.amount
                weekday_count += 1
        
        patterns = []
        
        if weekend_count > 0 and weekday_count > 0:
            weekend_avg = weekend_total / weekend_count
            weekday_avg = weekday_total / weekday_count
            
            if weekend_avg > weekday_avg * 1.3:  # 30% more on weekends
                patterns.append({
                    'type': 'pattern',
                    'pattern_type': 'weekend_spending',
                    'description': 'Higher spending on weekends',
                    'confidence': 0.8,
                    'weekend_avg': round(weekend_avg, 2),
                    'weekday_avg': round(weekday_avg, 2),
                    'difference_pct': round((weekend_avg - weekday_avg) / weekday_avg * 100, 1)
                })
                
                pattern = SpendingPattern(
                    user_id=self.user_id,
                    pattern_type='weekend',
                    description='Higher spending on weekends vs weekdays',
                    confidence_score=0.8,
                    frequency='weekly',
                    first_detected=date.today(),
                    last_occurrence=date.today()
                )
                self.db.add(pattern)
        
        return patterns
