"""
Machine Learning Service for Financial Analytics

Provides:
1. Spending Cluster Analysis - K-means clustering for spending persona identification
2. Category Prediction - Predict categories for uncategorized transactions
3. Budget Optimization - Recommend optimal budget allocations
4. Financial Health Scoring - Calculate overall financial health score
"""

from datetime import date, timedelta, datetime
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict
import math

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.models import User, Transaction, Category, Budget, Account, Debt


class SpendingClusterAnalyzer:
    """Analyze spending patterns and identify user personas using K-means clustering."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def get_spending_features(self, months: int = 6) -> Dict[str, Any]:
        """Extract spending features for clustering analysis."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        if not transactions:
            return None
        
        category_spending = defaultdict(float)
        daily_spending = defaultdict(float)
        weekday_spending = defaultdict(float)
        monthly_spending = defaultdict(float)
        
        for tx in transactions:
            if tx.category:
                category_spending[tx.category.name] += tx.amount
            daily_spending[tx.date.isoformat()] += tx.amount
            weekday_spending[tx.date.weekday()] += tx.amount
            monthly_spending[tx.date.strftime('%Y-%m')] += tx.amount
        
        total_spent = sum(tx.amount for tx in transactions)
        avg_transaction = total_spent / len(transactions) if transactions else 0
        
        weekend_spending = weekday_spending.get(5, 0) + weekday_spending.get(6, 0)
        weekday_total = sum(weekday_spending.get(d, 0) for d in range(5))
        
        monthly_values = list(monthly_spending.values())
        monthly_avg = np.mean(monthly_values) if monthly_values else 0
        monthly_std = np.std(monthly_values) if len(monthly_values) > 1 else 0
        
        return {
            'total_spent': total_spent,
            'transaction_count': len(transactions),
            'avg_transaction': avg_transaction,
            'category_distribution': dict(category_spending),
            'weekend_ratio': weekend_spending / total_spent if total_spent > 0 else 0,
            'monthly_avg': monthly_avg,
            'monthly_volatility': monthly_std / monthly_avg if monthly_avg > 0 else 0,
            'spending_consistency': 1 - (monthly_std / monthly_avg) if monthly_avg > 0 else 1,
            'top_categories': sorted(category_spending.items(), key=lambda x: x[1], reverse=True)[:5]
        }
    
    def identify_spending_persona(self) -> Dict[str, Any]:
        """Identify the user's spending persona based on their patterns."""
        features = self.get_spending_features()
        
        if not features:
            return {
                'persona': 'New User',
                'description': 'Not enough data to identify spending patterns',
                'confidence': 0,
                'characteristics': []
            }
        
        characteristics = []
        persona_scores = {
            'saver': 0,
            'balanced': 0,
            'spender': 0,
            'volatile': 0,
            'consistent': 0
        }
        
        if features['spending_consistency'] > 0.7:
            persona_scores['consistent'] += 2
            characteristics.append('Consistent monthly spending')
        elif features['monthly_volatility'] > 0.5:
            persona_scores['volatile'] += 2
            characteristics.append('Variable monthly spending')
        
        if features['weekend_ratio'] > 0.4:
            characteristics.append('Weekend-focused spender')
            persona_scores['spender'] += 1
        elif features['weekend_ratio'] < 0.2:
            characteristics.append('Weekday-focused spender')
            persona_scores['balanced'] += 1
        
        if features['avg_transaction'] < 30:
            characteristics.append('Frequent small purchases')
            persona_scores['balanced'] += 1
        elif features['avg_transaction'] > 100:
            characteristics.append('Infrequent large purchases')
            persona_scores['saver'] += 1
        
        top_category = features['top_categories'][0][0] if features['top_categories'] else None
        if top_category:
            category_ratio = features['top_categories'][0][1] / features['total_spent']
            if category_ratio > 0.4:
                characteristics.append(f'Heavy {top_category} spender')
        
        max_persona = max(persona_scores, key=persona_scores.get)
        confidence = min(0.95, 0.5 + (persona_scores[max_persona] * 0.15))
        
        persona_descriptions = {
            'saver': 'Conservative Saver - You tend to make thoughtful, planned purchases',
            'balanced': 'Balanced Spender - You maintain a healthy balance between saving and spending',
            'spender': 'Active Spender - You enjoy spending and make frequent purchases',
            'volatile': 'Variable Spender - Your spending patterns vary significantly month to month',
            'consistent': 'Steady Planner - You maintain very consistent spending habits'
        }
        
        return {
            'persona': max_persona.title(),
            'description': persona_descriptions.get(max_persona, 'Unknown persona'),
            'confidence': confidence,
            'characteristics': characteristics,
            'features': features
        }
    
    def get_spending_clusters(self) -> Dict[str, Any]:
        """Cluster spending by category and time patterns."""
        features = self.get_spending_features()
        
        if not features or not features['category_distribution']:
            return {'clusters': [], 'error': 'Insufficient data'}
        
        categories = list(features['category_distribution'].keys())
        amounts = list(features['category_distribution'].values())
        
        if len(categories) < 3:
            return {
                'clusters': [{'categories': categories, 'type': 'all', 'total': sum(amounts)}],
                'message': 'Not enough categories for clustering'
            }
        
        X = np.array(amounts).reshape(-1, 1)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        n_clusters = min(3, len(categories))
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X_scaled)
        
        clusters = defaultdict(list)
        for cat, amount, label in zip(categories, amounts, labels):
            clusters[int(label)].append({'category': cat, 'amount': amount})
        
        cluster_types = ['Essential', 'Discretionary', 'Occasional']
        sorted_clusters = sorted(clusters.items(), key=lambda x: sum(c['amount'] for c in x[1]), reverse=True)
        
        result = []
        for idx, (label, items) in enumerate(sorted_clusters):
            cluster_total = sum(item['amount'] for item in items)
            result.append({
                'type': cluster_types[idx] if idx < len(cluster_types) else f'Cluster {idx + 1}',
                'categories': sorted(items, key=lambda x: x['amount'], reverse=True),
                'total': cluster_total,
                'percentage': cluster_total / features['total_spent'] * 100 if features['total_spent'] > 0 else 0
            })
        
        return {'clusters': result, 'total_spent': features['total_spent']}


class CategoryPredictor:
    """Predict categories for transactions based on description patterns."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.model = None
        self.categories = []
    
    def train(self) -> bool:
        """Train the category prediction model using historical transactions."""
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.category_id.isnot(None),
            Transaction.description.isnot(None)
        ).all()
        
        if len(transactions) < 20:
            return False
        
        descriptions = [tx.description.lower() for tx in transactions]
        categories = [tx.category.name for tx in transactions]
        
        self.categories = list(set(categories))
        
        self.model = Pipeline([
            ('tfidf', TfidfVectorizer(max_features=500, ngram_range=(1, 2))),
            ('clf', MultinomialNB())
        ])
        
        self.model.fit(descriptions, categories)
        return True
    
    def predict(self, description: str) -> Dict[str, Any]:
        """Predict category for a given transaction description."""
        if not self.model:
            if not self.train():
                return {'category': None, 'confidence': 0, 'error': 'Insufficient training data'}
        
        description_lower = description.lower()
        predicted = self.model.predict([description_lower])[0]
        probabilities = self.model.predict_proba([description_lower])[0]
        confidence = max(probabilities)
        
        top_predictions = []
        for cat, prob in sorted(zip(self.model.classes_, probabilities), key=lambda x: x[1], reverse=True)[:3]:
            top_predictions.append({'category': cat, 'probability': float(prob)})
        
        return {
            'category': predicted,
            'confidence': float(confidence),
            'alternatives': top_predictions
        }
    
    def get_uncategorized_suggestions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get category suggestions for uncategorized transactions."""
        uncategorized = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.category_id.is_(None),
            Transaction.description.isnot(None)
        ).limit(limit).all()
        
        suggestions = []
        for tx in uncategorized:
            prediction = self.predict(tx.description)
            suggestions.append({
                'transaction_id': tx.id,
                'description': tx.description,
                'amount': tx.amount,
                'date': tx.date.isoformat(),
                'suggested_category': prediction['category'],
                'confidence': prediction['confidence'],
                'alternatives': prediction.get('alternatives', [])
            })
        
        return suggestions


class BudgetOptimizer:
    """Recommend optimal budget allocations based on spending history and financial goals."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def get_spending_breakdown(self, months: int = 3) -> Dict[str, float]:
        """Get average spending breakdown by category."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        results = self.db.query(
            Category.name,
            func.sum(Transaction.amount).label('total')
        ).join(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).group_by(Category.name).all()
        
        breakdown = {}
        for r in results:
            monthly_avg = float(r.total) / months
            breakdown[r.name] = monthly_avg
        
        return breakdown
    
    def get_income_estimate(self, months: int = 3) -> float:
        """Estimate monthly income based on recent transactions."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        total_income = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'income',
            Transaction.date >= start_date
        ).scalar() or 0
        
        return float(total_income) / months if months > 0 else 0
    
    def calculate_50_30_20_allocation(self, income: float) -> Dict[str, float]:
        """Calculate recommended allocation based on 50/30/20 rule."""
        return {
            'needs': income * 0.50,
            'wants': income * 0.30,
            'savings': income * 0.20
        }
    
    def categorize_spending_type(self, category_name: str) -> str:
        """Classify a category as need, want, or savings."""
        needs_keywords = ['grocery', 'supermarket', 'rent', 'utilities', 'insurance', 
                        'healthcare', 'medical', 'pharmacy', 'transport', 'gas', 'fuel',
                        'bills', 'electricity', 'water', 'internet', 'phone']
        
        savings_keywords = ['savings', 'investment', 'retirement', 'emergency']
        
        category_lower = category_name.lower()
        
        for keyword in needs_keywords:
            if keyword in category_lower:
                return 'needs'
        
        for keyword in savings_keywords:
            if keyword in category_lower:
                return 'savings'
        
        return 'wants'
    
    def get_optimization_recommendations(self, savings_target: float = None, months: int = 3) -> Dict[str, Any]:
        """Get personalized budget optimization recommendations."""
        spending = self.get_spending_breakdown(months=months)
        income = self.get_income_estimate(months=months)
        
        if income <= 0:
            return {'error': 'Unable to estimate income from transactions'}
        
        total_spending = sum(spending.values())
        current_savings_rate = (income - total_spending) / income if income > 0 else 0
        
        categorized_spending = {'needs': 0, 'wants': 0, 'savings': 0}
        category_details = {'needs': [], 'wants': [], 'savings': []}
        
        for cat, amount in spending.items():
            spend_type = self.categorize_spending_type(cat)
            categorized_spending[spend_type] += amount
            category_details[spend_type].append({'category': cat, 'amount': amount})
        
        ideal = self.calculate_50_30_20_allocation(income)
        
        recommendations = []
        potential_savings = 0
        
        if categorized_spending['needs'] > ideal['needs']:
            overspend = categorized_spending['needs'] - ideal['needs']
            recommendations.append({
                'type': 'reduce_needs',
                'message': f'Your essential spending exceeds the recommended 50%. Consider reducing by €{overspend:.2f}',
                'amount': overspend,
                'priority': 'medium'
            })
        
        if categorized_spending['wants'] > ideal['wants']:
            overspend = categorized_spending['wants'] - ideal['wants']
            potential_savings += overspend
            
            top_wants = sorted(category_details['wants'], key=lambda x: x['amount'], reverse=True)[:3]
            top_categories = ', '.join([c['category'] for c in top_wants])
            
            recommendations.append({
                'type': 'reduce_wants',
                'message': f'Discretionary spending exceeds 30% of income. Top areas: {top_categories}',
                'amount': overspend,
                'priority': 'high',
                'categories': top_wants
            })
        
        target_savings = savings_target if savings_target else ideal['savings']
        actual_savings = income - total_spending
        
        if actual_savings < target_savings:
            gap = target_savings - actual_savings
            recommendations.append({
                'type': 'increase_savings',
                'message': f'You\'re saving €{actual_savings:.2f}/month. Target: €{target_savings:.2f}. Gap: €{gap:.2f}',
                'amount': gap,
                'priority': 'high'
            })
        
        suggested_budgets = {}
        for cat, amount in spending.items():
            spend_type = self.categorize_spending_type(cat)
            if spend_type == 'wants' and categorized_spending['wants'] > ideal['wants']:
                reduction_factor = ideal['wants'] / categorized_spending['wants']
                suggested_budgets[cat] = {
                    'current': amount,
                    'suggested': amount * reduction_factor,
                    'reduction': amount * (1 - reduction_factor)
                }
            else:
                suggested_budgets[cat] = {
                    'current': amount,
                    'suggested': amount,
                    'reduction': 0
                }
        
        return {
            'income_estimate': income,
            'total_spending': total_spending,
            'current_savings_rate': current_savings_rate * 100,
            'target_savings_rate': 20,
            'current_breakdown': {
                'needs': {'amount': categorized_spending['needs'], 'percentage': categorized_spending['needs'] / income * 100 if income > 0 else 0},
                'wants': {'amount': categorized_spending['wants'], 'percentage': categorized_spending['wants'] / income * 100 if income > 0 else 0},
                'savings': {'amount': actual_savings, 'percentage': actual_savings / income * 100 if income > 0 else 0}
            },
            'ideal_breakdown': {
                'needs': {'amount': ideal['needs'], 'percentage': 50},
                'wants': {'amount': ideal['wants'], 'percentage': 30},
                'savings': {'amount': ideal['savings'], 'percentage': 20}
            },
            'recommendations': recommendations,
            'suggested_budgets': suggested_budgets,
            'potential_monthly_savings': potential_savings
        }


class FinancialHealthScorer:
    """Calculate overall financial health score (0-100)."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def calculate_score(self) -> Dict[str, Any]:
        """Calculate comprehensive financial health score."""
        scores = {}
        weights = {
            'savings_rate': 25,
            'debt_ratio': 20,
            'budget_adherence': 20,
            'spending_stability': 15,
            'emergency_fund': 20
        }
        
        savings_score = self._calculate_savings_score()
        scores['savings_rate'] = savings_score
        
        debt_score = self._calculate_debt_score()
        scores['debt_ratio'] = debt_score
        
        budget_score = self._calculate_budget_score()
        scores['budget_adherence'] = budget_score
        
        stability_score = self._calculate_stability_score()
        scores['spending_stability'] = stability_score
        
        emergency_score = self._calculate_emergency_fund_score()
        scores['emergency_fund'] = emergency_score
        
        total_score = sum(scores[k] * weights[k] / 100 for k in weights)
        
        if total_score >= 80:
            grade = 'A'
            status = 'Excellent'
        elif total_score >= 65:
            grade = 'B'
            status = 'Good'
        elif total_score >= 50:
            grade = 'C'
            status = 'Fair'
        elif total_score >= 35:
            grade = 'D'
            status = 'Needs Improvement'
        else:
            grade = 'F'
            status = 'Critical'
        
        recommendations = self._generate_recommendations(scores)
        
        return {
            'overall_score': round(total_score, 1),
            'grade': grade,
            'status': status,
            'component_scores': {
                'savings_rate': {'score': scores['savings_rate'], 'weight': weights['savings_rate']},
                'debt_ratio': {'score': scores['debt_ratio'], 'weight': weights['debt_ratio']},
                'budget_adherence': {'score': scores['budget_adherence'], 'weight': weights['budget_adherence']},
                'spending_stability': {'score': scores['spending_stability'], 'weight': weights['spending_stability']},
                'emergency_fund': {'score': scores['emergency_fund'], 'weight': weights['emergency_fund']}
            },
            'recommendations': recommendations
        }
    
    def _calculate_savings_score(self) -> float:
        """Score based on savings rate (0-100)."""
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
        
        if income <= 0:
            return 50
        
        savings_rate = (income - expenses) / income
        
        if savings_rate >= 0.20:
            return 100
        elif savings_rate >= 0.15:
            return 85
        elif savings_rate >= 0.10:
            return 70
        elif savings_rate >= 0.05:
            return 55
        elif savings_rate >= 0:
            return 40
        else:
            return max(0, 30 + savings_rate * 100)
    
    def _calculate_debt_score(self) -> float:
        """Score based on debt-to-income ratio."""
        debts = self.db.query(Debt).filter(
            Debt.user_id == self.user_id,
            Debt.is_active == True
        ).all()
        
        if not debts:
            return 100
        
        total_debt = sum(d.current_balance for d in debts)
        monthly_payments = sum(d.minimum_payment or 0 for d in debts)
        
        end_date = date.today()
        start_date = end_date - timedelta(days=90)
        monthly_income = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'income',
            Transaction.date >= start_date
        ).scalar() or 0
        monthly_income = monthly_income / 3 if monthly_income else 0
        
        if monthly_income <= 0:
            return 50
        
        dti_ratio = monthly_payments / monthly_income
        
        if dti_ratio <= 0.10:
            return 100
        elif dti_ratio <= 0.20:
            return 85
        elif dti_ratio <= 0.30:
            return 70
        elif dti_ratio <= 0.40:
            return 50
        else:
            return max(0, 40 - (dti_ratio - 0.40) * 100)
    
    def _calculate_budget_score(self) -> float:
        """Score based on budget adherence."""
        budgets = self.db.query(Budget).filter(
            Budget.user_id == self.user_id,
            Budget.is_active == True
        ).all()
        
        if not budgets:
            return 60
        
        adherence_scores = []
        
        for budget in budgets:
            budget_categories = [bc.category_id for bc in budget.budget_categories]
            
            current_month_start = date.today().replace(day=1)
            spent = self.db.query(func.sum(Transaction.amount)).filter(
                Transaction.user_id == self.user_id,
                Transaction.type == 'expense',
                Transaction.category_id.in_(budget_categories),
                Transaction.date >= current_month_start
            ).scalar() or 0
            
            if budget.amount > 0:
                ratio = spent / budget.amount
                if ratio <= 0.8:
                    adherence_scores.append(100)
                elif ratio <= 1.0:
                    adherence_scores.append(85)
                elif ratio <= 1.1:
                    adherence_scores.append(60)
                else:
                    adherence_scores.append(max(0, 50 - (ratio - 1.1) * 100))
        
        return sum(adherence_scores) / len(adherence_scores) if adherence_scores else 60
    
    def _calculate_stability_score(self) -> float:
        """Score based on spending consistency."""
        end_date = date.today()
        start_date = end_date - timedelta(days=180)
        
        monthly_spending = self.db.query(
            func.strftime('%Y-%m', Transaction.date).label('month'),
            func.sum(Transaction.amount).label('total')
        ).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).group_by(func.strftime('%Y-%m', Transaction.date)).all()
        
        if len(monthly_spending) < 3:
            return 70
        
        amounts = [float(m.total) for m in monthly_spending]
        mean = np.mean(amounts)
        std = np.std(amounts)
        
        cv = std / mean if mean > 0 else 0
        
        if cv <= 0.15:
            return 100
        elif cv <= 0.25:
            return 85
        elif cv <= 0.35:
            return 70
        elif cv <= 0.50:
            return 55
        else:
            return max(30, 50 - cv * 40)
    
    def _calculate_emergency_fund_score(self) -> float:
        """Score based on emergency fund coverage."""
        savings_accounts = self.db.query(Account).filter(
            Account.user_id == self.user_id,
            Account.type.in_(['savings', 'checking']),
            Account.is_active == True
        ).all()
        
        total_liquid = sum(a.balance for a in savings_accounts)
        
        end_date = date.today()
        start_date = end_date - timedelta(days=90)
        monthly_expenses = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).scalar() or 0
        monthly_expenses = monthly_expenses / 3 if monthly_expenses else 0
        
        if monthly_expenses <= 0:
            return 70
        
        months_covered = total_liquid / monthly_expenses
        
        if months_covered >= 6:
            return 100
        elif months_covered >= 3:
            return 80
        elif months_covered >= 2:
            return 60
        elif months_covered >= 1:
            return 40
        else:
            return max(0, months_covered * 40)
    
    def _generate_recommendations(self, scores: Dict[str, float]) -> List[Dict[str, Any]]:
        """Generate actionable recommendations based on scores."""
        recommendations = []
        
        if scores['savings_rate'] < 70:
            recommendations.append({
                'area': 'Savings',
                'priority': 'high' if scores['savings_rate'] < 50 else 'medium',
                'message': 'Increase your savings rate. Aim to save at least 15-20% of your income.',
                'action': 'Review discretionary spending and set up automatic transfers to savings.'
            })
        
        if scores['debt_ratio'] < 70:
            recommendations.append({
                'area': 'Debt',
                'priority': 'high' if scores['debt_ratio'] < 50 else 'medium',
                'message': 'Your debt payments are consuming too much of your income.',
                'action': 'Consider debt consolidation or accelerated payment strategies.'
            })
        
        if scores['budget_adherence'] < 70:
            recommendations.append({
                'area': 'Budgeting',
                'priority': 'medium',
                'message': 'You\'re frequently exceeding your budgets.',
                'action': 'Review and adjust budget limits or identify spending leaks.'
            })
        
        if scores['spending_stability'] < 70:
            recommendations.append({
                'area': 'Consistency',
                'priority': 'low',
                'message': 'Your spending varies significantly month to month.',
                'action': 'Create a detailed monthly budget to stabilize spending patterns.'
            })
        
        if scores['emergency_fund'] < 70:
            recommendations.append({
                'area': 'Emergency Fund',
                'priority': 'high' if scores['emergency_fund'] < 50 else 'medium',
                'message': 'Your emergency fund is below the recommended 3-6 months of expenses.',
                'action': 'Prioritize building your emergency fund before other financial goals.'
            })
        
        return recommendations


class SpendingHeatmapAnalyzer:
    """Analyze spending patterns by day of week and time."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def get_heatmap_data(self, months: int = 3) -> Dict[str, Any]:
        """Generate heatmap data for spending by day of week."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        if not transactions:
            return {'data': [], 'error': 'No transaction data'}
        
        day_spending = defaultdict(lambda: defaultdict(float))
        day_counts = defaultdict(lambda: defaultdict(int))
        
        for tx in transactions:
            weekday = tx.date.weekday()
            week_num = tx.date.isocalendar()[1]
            day_spending[weekday][week_num] += tx.amount
            day_counts[weekday][week_num] += 1
        
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        daily_averages = []
        for day in range(7):
            if day_spending[day]:
                total = sum(day_spending[day].values())
                count = len(day_spending[day])
                avg = total / count
            else:
                avg = 0
            daily_averages.append({
                'day': day_names[day],
                'day_index': day,
                'average': avg,
                'total': sum(day_spending[day].values()) if day_spending[day] else 0,
                'transaction_count': sum(day_counts[day].values()) if day_counts[day] else 0
            })
        
        max_avg = max(d['average'] for d in daily_averages) if daily_averages else 1
        for d in daily_averages:
            d['intensity'] = d['average'] / max_avg if max_avg > 0 else 0
        
        peak_day = max(daily_averages, key=lambda x: x['average'])
        low_day = min(daily_averages, key=lambda x: x['average'])
        
        return {
            'daily_data': daily_averages,
            'peak_day': peak_day['day'],
            'peak_amount': peak_day['average'],
            'low_day': low_day['day'],
            'low_amount': low_day['average'],
            'analysis_period_months': months
        }


class CategoryCorrelationAnalyzer:
    """Analyze correlations between spending categories."""
    
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
    
    def get_correlations(self, months: int = 6) -> Dict[str, Any]:
        """Calculate correlations between category spending over time."""
        end_date = date.today()
        start_date = end_date - timedelta(days=30 * months)
        
        transactions = self.db.query(
            Transaction, Category.name.label('category_name')
        ).join(Category).filter(
            Transaction.user_id == self.user_id,
            Transaction.type == 'expense',
            Transaction.date >= start_date
        ).all()
        
        if not transactions:
            return {'correlations': [], 'error': 'No transaction data'}
        
        weekly_spending = defaultdict(lambda: defaultdict(float))
        
        for tx, cat_name in transactions:
            week_key = tx.date.isocalendar()[:2]
            weekly_spending[cat_name][week_key] += tx.amount
        
        categories = list(weekly_spending.keys())
        if len(categories) < 2:
            return {'correlations': [], 'message': 'Need at least 2 categories for correlation'}
        
        all_weeks = set()
        for cat_data in weekly_spending.values():
            all_weeks.update(cat_data.keys())
        all_weeks = sorted(all_weeks)
        
        if len(all_weeks) < 4:
            return {'correlations': [], 'message': 'Need more weeks of data for correlation'}
        
        category_vectors = {}
        for cat in categories:
            category_vectors[cat] = [weekly_spending[cat].get(week, 0) for week in all_weeks]
        
        correlations = []
        for i, cat1 in enumerate(categories):
            for cat2 in categories[i+1:]:
                v1 = np.array(category_vectors[cat1])
                v2 = np.array(category_vectors[cat2])
                
                if np.std(v1) == 0 or np.std(v2) == 0:
                    corr = 0
                else:
                    corr = np.corrcoef(v1, v2)[0, 1]
                
                if not np.isnan(corr):
                    correlations.append({
                        'category1': cat1,
                        'category2': cat2,
                        'correlation': float(corr),
                        'strength': 'strong' if abs(corr) > 0.7 else 'moderate' if abs(corr) > 0.4 else 'weak',
                        'direction': 'positive' if corr > 0 else 'negative'
                    })
        
        correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)
        
        return {
            'correlations': correlations[:10],
            'total_categories': len(categories),
            'analysis_weeks': len(all_weeks)
        }
