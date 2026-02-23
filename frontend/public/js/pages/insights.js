/**
 * Financial Analytics Dashboard Controller
 * ML-powered insights and visualizations
 */

let healthScoreGaugeChart = null;
let forecastChart = null;
let categoryChart = null;
let heatmapChart = null;
let cashflowChart = null;

let analyticsData = {
    healthScore: null,
    forecast: null,
    persona: null,
    budgetOptimization: null,
    clusters: null,
    heatmap: null,
    cashflow: null
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    Layout.render('insights');
    
    const template = document.getElementById('insights-template');
    const mainContent = document.getElementById('main-content');
    if (template && mainContent) {
        mainContent.innerHTML = '';
        mainContent.appendChild(template.content.cloneNode(true));
    }
    
    await loadAnalyticsDashboard();
});

async function loadAnalyticsDashboard() {
    try {
        await Promise.all([
            loadHealthScore(),
            loadSpendingForecast(),
            loadSpendingPersona(),
            loadBudgetOptimization(),
            loadSpendingClusters(),
            loadSpendingHeatmap(),
            loadCashflowProjection()
        ]);
    } catch (error) {
        console.error('Error loading analytics dashboard:', error);
        Utils.showToast('Error loading analytics', 'error');
    }
}

async function refreshAnalytics() {
    Utils.showToast('Refreshing analytics...', 'info');
    
    if (healthScoreGaugeChart) healthScoreGaugeChart.destroy();
    if (forecastChart) forecastChart.destroy();
    if (categoryChart) categoryChart.destroy();
    if (heatmapChart) heatmapChart.destroy();
    if (cashflowChart) cashflowChart.destroy();
    
    await loadAnalyticsDashboard();
    Utils.showToast('Analytics refreshed', 'success');
}

async function loadHealthScore() {
    try {
        const data = await API.analytics.getFinancialHealthScore();
        analyticsData.healthScore = data;
        
        renderHealthScoreGauge(data.overall_score, data.grade);
        renderHealthMetrics(data);
        renderHealthBreakdown(data);
        renderRecommendations(data.recommendations);
        
    } catch (error) {
        console.error('Error loading health score:', error);
        document.getElementById('healthScoreValue').textContent = '--';
        document.getElementById('healthScoreGrade').textContent = 'Error';
    }
}

function renderHealthScoreGauge(score, grade) {
    const canvas = document.getElementById('healthScoreGauge');
    const ctx = canvas.getContext('2d');
    
    const getScoreColor = (score) => {
        if (score >= 80) return '#10B981';
        if (score >= 65) return '#3B82F6';
        if (score >= 50) return '#F59E0B';
        if (score >= 35) return '#F97316';
        return '#EF4444';
    };
    
    const color = getScoreColor(score);
    
    healthScoreGaugeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [score, 100 - score],
                backgroundColor: [color, 'rgba(0,0,0,0.1)'],
                borderWidth: 0,
                circumference: 270,
                rotation: 225
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
    
    document.getElementById('healthScoreValue').textContent = Math.round(score);
    document.getElementById('healthScoreGrade').textContent = grade;
    
    const healthDescEl = document.getElementById('healthScoreDescription');
    if (healthDescEl) {
        let description = '';
        if (score >= 80) {
            description = 'Excellent financial health! You\'re managing your money wisely with strong savings and controlled spending.';
        } else if (score >= 65) {
            description = 'Good financial standing. There\'s room for improvement in savings or debt management.';
        } else if (score >= 50) {
            description = 'Fair financial health. Focus on building your emergency fund and reducing unnecessary expenses.';
        } else if (score >= 35) {
            description = 'Your finances need attention. Prioritize debt reduction and creating a stricter budget.';
        } else {
            description = 'Critical attention needed. Consider seeking financial advice to stabilize your situation.';
        }
        healthDescEl.textContent = description;
    }
}

function renderHealthMetrics(data) {
    const savingsScore = data.component_scores?.savings_rate?.score || 0;
    let savingsRate = 0;
    if (savingsScore >= 85) savingsRate = 20;
    else if (savingsScore >= 70) savingsRate = 15;
    else if (savingsScore >= 55) savingsRate = 10;
    else if (savingsScore >= 40) savingsRate = 5;
    else savingsRate = 0;
    
    document.getElementById('savingsRateValue').textContent = `${savingsRate}%`;
    
    let savingsStatus = '';
    let savingsClass = '';
    if (savingsRate >= 15) {
        savingsStatus = 'Excellent - exceeds recommended 15%';
        savingsClass = 'text-success';
    } else if (savingsRate >= 10) {
        savingsStatus = 'Good - approaching the 15% goal';
        savingsClass = 'text-info';
    } else if (savingsRate >= 5) {
        savingsStatus = 'Below target - aim for 15%+';
        savingsClass = 'text-warning';
    } else {
        savingsStatus = 'Critical - no measurable savings';
        savingsClass = 'text-error';
    }
    
    document.getElementById('savingsRateStatus').textContent = savingsStatus;
    document.getElementById('savingsRateStatus').className = `stat-desc text-xs ${savingsClass}`;
}

function renderHealthBreakdown(data) {
    const container = document.getElementById('healthBreakdownContainer');
    const components = data.component_scores;
    
    const componentInfo = {
        savings_rate: {
            label: 'Savings Rate',
            getDescription: (score) => {
                if (score >= 80) return 'You\'re saving a healthy portion of your income';
                if (score >= 60) return 'Moderate savings - try to increase by 5%';
                if (score >= 40) return 'Low savings rate - review discretionary spending';
                return 'Minimal savings detected - prioritize building reserves';
            }
        },
        debt_ratio: {
            label: 'Debt Management',
            getDescription: (score) => {
                if (score >= 80) return 'Excellent debt-to-income ratio';
                if (score >= 60) return 'Manageable debt levels';
                if (score >= 40) return 'Debt consuming significant income';
                return 'High debt burden - consider consolidation';
            }
        },
        budget_adherence: {
            label: 'Budget Discipline',
            getDescription: (score) => {
                if (score >= 80) return 'Consistently staying within budgets';
                if (score >= 60) return 'Occasionally exceeding budget limits';
                if (score >= 40) return 'Frequently over budget - review limits';
                return 'Budget tracking needs improvement';
            }
        },
        spending_stability: {
            label: 'Spending Stability',
            getDescription: (score) => {
                if (score >= 80) return 'Very consistent monthly spending';
                if (score >= 60) return 'Moderately stable spending patterns';
                if (score >= 40) return 'Variable spending - consider fixed budgets';
                return 'Highly volatile spending patterns';
            }
        },
        emergency_fund: {
            label: 'Emergency Fund',
            getDescription: (score) => {
                if (score >= 80) return 'Well-funded for 6+ months of expenses';
                if (score >= 60) return 'Covers 3-6 months - keep building';
                if (score >= 40) return 'Limited coverage - prioritize savings';
                return 'Insufficient emergency reserves';
            }
        }
    };
    
    const getColorClass = (score) => {
        if (score >= 80) return 'progress-success';
        if (score >= 60) return 'progress-info';
        if (score >= 40) return 'progress-warning';
        return 'progress-error';
    };
    
    let html = `
        <p class="text-xs text-base-content/60 mb-3">
            Your financial health is measured across 5 key areas. Each score reflects your performance based on the last 3-6 months of data.
        </p>
        <div class="space-y-3">
    `;
    
    for (const [key, value] of Object.entries(components)) {
        const info = componentInfo[key] || { label: key, getDescription: () => '' };
        html += `
            <div class="group">
                <div class="flex justify-between text-sm mb-1">
                    <span>${info.label}</span>
                    <span class="font-medium">${Math.round(value.score)}/100</span>
                </div>
                <progress class="progress ${getColorClass(value.score)} w-full h-2" value="${value.score}" max="100"></progress>
                <p class="text-xs text-base-content/50 mt-1">${info.getDescription(value.score)}</p>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function renderRecommendations(recommendations) {
    const container = document.getElementById('recommendationsContainer');
    
    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <span class="text-4xl">🎉</span>
                <p class="text-sm text-base-content/60 mt-2">Great job! No critical recommendations at this time.</p>
                <p class="text-xs text-base-content/40 mt-1">Keep maintaining your current financial habits.</p>
            </div>
        `;
        return;
    }
    
    const priorityIcons = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
    };
    
    let html = `
        <p class="text-xs text-base-content/60 mb-3">
            These recommendations are generated based on your actual spending patterns and financial behavior.
        </p>
        <div class="space-y-3">
    `;
    
    for (const rec of recommendations.slice(0, 4)) {
        html += `
            <div class="p-3 rounded-lg bg-base-200 border-l-4 ${
                rec.priority === 'high' ? 'border-error' : 
                rec.priority === 'medium' ? 'border-warning' : 'border-info'
            }">
                <div class="flex items-start gap-2">
                    <span class="text-sm">${priorityIcons[rec.priority] || '💡'}</span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium">${rec.area}</p>
                        <p class="text-xs text-base-content/70 mt-1">${rec.message}</p>
                        ${rec.action ? `<p class="text-xs text-primary mt-2 font-medium">→ ${rec.action}</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

async function loadSpendingForecast() {
    try {
        const days = parseInt(document.getElementById('forecastDays')?.value || '30');
        const data = await API.analytics.getSpendingForecast(days);
        analyticsData.forecast = data;
        
        document.getElementById('forecastValue').textContent = Utils.formatCurrency(data.summary.total_predicted);
        document.getElementById('forecastConfidence').textContent = `${(data.summary.confidence_level * 100).toFixed(0)}% confidence`;
        
        const changeClass = data.summary.change_percentage > 0 ? 'text-error' : 'text-success';
        const changeIcon = data.summary.change_percentage > 0 ? '↑' : '↓';
        const changeAbs = Math.abs(data.summary.change_percentage);
        
        document.getElementById('spendingTrendValue').innerHTML = `
            <span class="${changeClass}">${changeIcon} ${changeAbs.toFixed(1)}%</span>
        `;
        
        let trendDescription = '';
        if (changeAbs < 3) {
            trendDescription = 'Spending is stable compared to previous period';
        } else if (data.summary.change_percentage > 0) {
            trendDescription = `Spending increased by ${changeAbs.toFixed(1)}% vs last period`;
        } else {
            trendDescription = `Spending decreased by ${changeAbs.toFixed(1)}% vs last period`;
        }
        document.getElementById('spendingTrendChange').textContent = trendDescription;
        
        const forecastDescEl = document.getElementById('forecastDescription');
        if (forecastDescEl) {
            const avgDaily = data.summary.average_daily;
            const model = data.summary.model === 'ARIMA(1,1,1)' ? 'ARIMA time-series model' : 'weighted moving average';
            forecastDescEl.innerHTML = `
                <p class="text-xs text-base-content/60 mb-2">
                    Based on your historical spending patterns, we predict you'll spend approximately 
                    <strong>${Utils.formatCurrency(avgDaily)}</strong> per day over the next ${days} days.
                </p>
                <p class="text-xs text-base-content/50">
                    Prediction uses ${model} with ${(data.summary.confidence_level * 100).toFixed(0)}% confidence interval. 
                    The shaded area shows the range where actual spending is likely to fall.
                </p>
            `;
        }
        
        renderForecastChart(data);
        
    } catch (error) {
        console.error('Error loading spending forecast:', error);
        document.getElementById('forecastValue').textContent = '€--';
        document.getElementById('forecastConfidence').textContent = 'Error loading';
    }
}

function renderForecastChart(data) {
    const ctx = document.getElementById('forecastChart').getContext('2d');
    
    if (forecastChart) forecastChart.destroy();
    
    const forecastDates = data.forecast.map(d => d.date);
    const predictions = data.forecast.map(d => d.predicted);
    const lowerBounds = data.forecast.map(d => d.lower_bound);
    const upperBounds = data.forecast.map(d => d.upper_bound);
    
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    };
    
    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: forecastDates.map(formatDate),
            datasets: [
                {
                    label: 'Upper Bound',
                    data: upperBounds,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: '+1',
                    pointRadius: 0
                },
                {
                    label: 'Predicted',
                    data: predictions,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2,
                    pointHoverRadius: 5
                },
                {
                    label: 'Lower Bound',
                    data: lowerBounds,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === 'Predicted') {
                                return `Predicted: €${context.raw.toFixed(2)}`;
                            }
                            return null;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 7,
                        font: { size: 11 }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '€' + value
                    }
                }
            }
        }
    });
}

async function loadSpendingPersona() {
    try {
        const data = await API.analytics.getSpendingPersona();
        analyticsData.persona = data;
        
        const container = document.getElementById('personaContainer');
        
        const personaIcons = {
            'Saver': '💰',
            'Balanced': '⚖️',
            'Spender': '🛒',
            'Volatile': '📊',
            'Consistent': '📐',
            'New User': '👋'
        };
        
        const personaExplanations = {
            'Saver': 'You prioritize savings and make thoughtful purchasing decisions. Your spending tends to be below average with a focus on necessities.',
            'Balanced': 'You maintain a healthy balance between enjoying life and saving for the future. Your spending patterns are sustainable.',
            'Spender': 'You enjoy spending and make frequent purchases. Consider setting stricter budget limits to increase savings.',
            'Volatile': 'Your spending varies significantly from month to month. Creating a fixed budget could help stabilize your finances.',
            'Consistent': 'You have very predictable spending patterns, which makes budgeting easier and financial planning more reliable.',
            'New User': 'We need more transaction data to accurately identify your spending persona. Keep tracking for better insights!'
        };
        
        let html = `
            <div class="text-center">
                <span class="text-5xl">${personaIcons[data.persona] || '🧑'}</span>
                <h3 class="text-xl font-bold mt-2">${data.persona}</h3>
                <p class="text-sm text-base-content/70 mt-1">${data.description}</p>
                <div class="badge badge-outline mt-2">${(data.confidence * 100).toFixed(0)}% confidence</div>
            </div>
            <p class="text-xs text-base-content/60 mt-4 text-center">
                ${personaExplanations[data.persona] || data.description}
            </p>
        `;
        
        if (data.characteristics && data.characteristics.length > 0) {
            html += `
                <div class="mt-4 space-y-2">
                    <p class="text-sm font-medium">Key traits identified from your data:</p>
                    <div class="flex flex-wrap gap-2">
                        ${data.characteristics.map(c => `
                            <span class="badge badge-sm badge-ghost">${c}</span>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        if (data.features) {
            loadCategoryDistribution(data.features);
            
            if (data.features.top_categories && data.features.top_categories.length > 0) {
                const top = data.features.top_categories[0];
                const topPct = (top[1] / data.features.total_spent * 100).toFixed(0);
                document.getElementById('topCategoryValue').textContent = top[0];
                document.getElementById('topCategoryAmount').textContent = `${Utils.formatCurrency(top[1])} (${topPct}%)`;
            }
        }
        
    } catch (error) {
        console.error('Error loading spending persona:', error);
        document.getElementById('personaContainer').innerHTML = `
            <div class="text-center text-base-content/60 py-4">
                <p>Unable to determine spending persona</p>
                <p class="text-xs mt-1">More transaction data is needed for analysis</p>
            </div>
        `;
    }
}

function loadCategoryDistribution(features) {
    if (!features.category_distribution) return;
    
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (categoryChart) categoryChart.destroy();
    
    const categories = Object.entries(features.category_distribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280'];
    
    const categoryDescEl = document.getElementById('categoryDescription');
    if (categoryDescEl && categories.length > 0) {
        const total = categories.reduce((sum, c) => sum + c[1], 0);
        const topThree = categories.slice(0, 3).map(c => c[0]).join(', ');
        categoryDescEl.innerHTML = `
            <p class="text-xs text-base-content/60">
                Your top spending categories are <strong>${topThree}</strong>, 
                which account for ${((categories.slice(0, 3).reduce((s, c) => s + c[1], 0) / total) * 100).toFixed(0)}% of your total spending.
            </p>
        `;
    }
    
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories.map(c => c[0]),
            datasets: [{
                data: categories.map(c => c[1]),
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 8,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.label}: €${context.raw.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

async function loadBudgetOptimization() {
    try {
        const data = await API.analytics.getBudgetRecommendations();
        analyticsData.budgetOptimization = data;
        
        const container = document.getElementById('budgetOptContainer');
        
        if (data.error) {
            container.innerHTML = `<p class="text-sm text-base-content/60">${data.error}</p>`;
            return;
        }
        
        const current = data.current_breakdown;
        const ideal = data.ideal_breakdown;
        
        let overallAssessment = '';
        const needsPct = current.needs?.percentage || 0;
        const wantsPct = current.wants?.percentage || 0;
        const savingsPct = current.savings?.percentage || 0;
        
        if (savingsPct >= 20 && needsPct <= 55 && wantsPct <= 35) {
            overallAssessment = 'Your budget allocation is well-balanced! You\'re following healthy financial principles.';
        } else if (savingsPct < 10) {
            overallAssessment = 'Your savings rate is low. Try reducing discretionary spending to increase savings to at least 20%.';
        } else if (wantsPct > 40) {
            overallAssessment = 'Discretionary spending is high. Consider cutting back on wants to improve your savings.';
        } else {
            overallAssessment = 'There\'s room to optimize your budget. Review the breakdown below for specific areas.';
        }
        
        let html = `
            <div class="space-y-4">
                <p class="text-xs text-base-content/60">${overallAssessment}</p>
                
                <div class="text-center">
                    <p class="text-xs text-base-content/50">50/30/20 Rule Comparison</p>
                </div>
                
                <div class="space-y-3">
        `;
        
        const categories = [
            { key: 'needs', label: 'Needs (essentials)', color: 'primary', ideal: 50, desc: 'rent, utilities, groceries, insurance' },
            { key: 'wants', label: 'Wants (discretionary)', color: 'secondary', ideal: 30, desc: 'entertainment, dining out, hobbies' },
            { key: 'savings', label: 'Savings', color: 'success', ideal: 20, desc: 'emergency fund, investments, goals' }
        ];
        
        for (const cat of categories) {
            const currentPct = current[cat.key]?.percentage || 0;
            const idealPct = cat.ideal;
            const isOver = currentPct > cat.ideal + 5;
            const isUnder = currentPct < cat.ideal - 5;
            
            let status = '';
            let statusClass = '';
            if (cat.key === 'savings') {
                status = currentPct >= cat.ideal ? '✓ On track' : '⚠ Below target';
                statusClass = currentPct >= cat.ideal ? 'text-success' : 'text-warning';
            } else {
                status = currentPct <= cat.ideal + 5 ? '✓ Within range' : '⚠ Over budget';
                statusClass = currentPct <= cat.ideal + 5 ? 'text-success' : 'text-error';
            }

            const barColor = cat.key === 'needs' ? 'primary' : cat.key === 'wants' ? 'secondary' : 'success';
            const barColorClass = barColor === 'primary' ? 'bg-primary' : barColor === 'secondary' ? 'bg-secondary' : 'bg-success';
            const markerColorClass = currentPct > idealPct ? 'bg-error' : 'bg-success';
            
            html += `
                <div class="space-y-1">
                    <div class="flex justify-between text-xs">
                        <span class="font-medium" title="${cat.desc}">${cat.label}</span>
                        <span class="${statusClass}">${currentPct.toFixed(0)}% / ${idealPct}% ${status}</span>
                    </div>
                    <div class="relative h-4 bg-base-300 rounded-full overflow-visible">
                        <div class="absolute h-full ${barColorClass} rounded-full transition-all duration-300" style="width: ${Math.min(currentPct, 100)}%"></div>
                        <div class="absolute top-0 bottom-0 w-0.5 ${markerColorClass} z-10" style="left: ${idealPct}%" title="Limit: ${idealPct}%">
                            <span class="absolute -top-5 left-1/2 transform -translate-x-1/2 text-[8px] font-bold bg-base-100 px-1 rounded whitespace-nowrap">${idealPct}%</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += `
                </div>
                
                <div class="divider my-2"></div>
                
                <div class="flex justify-between text-sm">
                    <span>Potential Monthly Savings</span>
                    <span class="font-bold text-success">+${Utils.formatCurrency(data.potential_monthly_savings)}</span>
                </div>
                <p class="text-xs text-base-content/50">
                    By optimizing your wants spending to the recommended 30%, you could save an additional 
                    ${Utils.formatCurrency(data.potential_monthly_savings)} per month.
                </p>
            </div>
        `;
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading budget optimization:', error);
        document.getElementById('budgetOptContainer').innerHTML = `
            <p class="text-sm text-base-content/60">Unable to load budget optimization</p>
        `;
    }
}

async function loadSpendingClusters() {
    try {
        const data = await API.analytics.getSpendingClusters();
        analyticsData.clusters = data;
        
        const container = document.getElementById('clustersContainer');
        
        if (data.error || !data.clusters || data.clusters.length === 0) {
            container.innerHTML = `
                <p class="text-sm text-base-content/60">Not enough data for cluster analysis</p>
                <p class="text-xs text-base-content/40 mt-1">Continue tracking expenses to enable this feature</p>
            `;
            return;
        }
        
        const clusterIcons = {
            'Essential': '🏠',
            'Discretionary': '🎮',
            'Occasional': '🎁'
        };
        
        const clusterColors = {
            'Essential': 'primary',
            'Discretionary': 'secondary',
            'Occasional': 'accent'
        };
        
        const clusterDescriptions = {
            'Essential': 'Regular, necessary expenses that are harder to reduce',
            'Discretionary': 'Optional spending that can be adjusted based on budget',
            'Occasional': 'Infrequent purchases that vary month to month'
        };
        
        let html = `
            <p class="text-xs text-base-content/60 mb-3">
                Your spending has been grouped into clusters using machine learning to identify patterns.
            </p>
            <div class="space-y-3">
        `;
        
        for (const cluster of data.clusters) {
            html += `
                <div class="collapse collapse-arrow bg-base-200 rounded-lg">
                    <input type="checkbox" />
                    <div class="collapse-title py-2 px-3 min-h-0">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span>${clusterIcons[cluster.type] || '📦'}</span>
                                <div>
                                    <span class="font-medium text-sm">${cluster.type}</span>
                                    <p class="text-xs text-base-content/50">${clusterDescriptions[cluster.type] || ''}</p>
                                </div>
                            </div>
                            <span class="badge badge-${clusterColors[cluster.type] || 'ghost'} badge-sm">
                                ${cluster.percentage.toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <div class="collapse-content px-3 pb-2">
                        <p class="text-xs text-base-content/60 mb-2">Categories in this cluster (${Utils.formatCurrency(cluster.total)} total):</p>
                        <div class="space-y-1 text-xs">
                            ${cluster.categories.slice(0, 5).map(cat => `
                                <div class="flex justify-between">
                                    <span class="text-base-content/70">${cat.category}</span>
                                    <span>${Utils.formatCurrency(cat.amount)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading spending clusters:', error);
        document.getElementById('clustersContainer').innerHTML = `
            <p class="text-sm text-base-content/60">Unable to load clusters</p>
        `;
    }
}

async function loadSpendingHeatmap() {
    try {
        const months = parseInt(document.getElementById('analysisMonths')?.value || '6');
        const data = await API.analytics.getSpendingHeatmap(months);
        analyticsData.heatmap = data;
        
        if (data.error) {
            document.getElementById('heatmapChart').parentElement.innerHTML = `
                <p class="text-sm text-base-content/60 text-center py-8">${data.error}</p>
            `;
            return;
        }
        
        const heatmapDescEl = document.getElementById('heatmapDescription');
        if (heatmapDescEl) {
            heatmapDescEl.innerHTML = `
                <p class="text-xs text-base-content/60">
                    You spend the most on <strong>${data.peak_day}s</strong> (avg ${Utils.formatCurrency(data.peak_amount)}) 
                    and the least on <strong>${data.low_day}s</strong> (avg ${Utils.formatCurrency(data.low_amount)}). 
                    ${data.peak_day === 'Saturday' || data.peak_day === 'Sunday' 
                        ? 'Weekend spending is elevated - consider setting weekend budgets.' 
                        : 'Your spending peaks on weekdays, likely from regular bills or work-related expenses.'}
                </p>
            `;
        }
        
        renderHeatmapChart(data);
        
    } catch (error) {
        console.error('Error loading spending heatmap:', error);
    }
}

function renderHeatmapChart(data) {
    const ctx = document.getElementById('heatmapChart').getContext('2d');
    
    if (heatmapChart) heatmapChart.destroy();
    
    const days = data.daily_data.map(d => d.day.substring(0, 3));
    const amounts = data.daily_data.map(d => d.average);
    const intensities = data.daily_data.map(d => d.intensity);
    
    const getColor = (intensity) => {
        const r = Math.round(59 + (239 - 59) * intensity);
        const g = Math.round(130 + (68 - 130) * intensity);
        const b = Math.round(246 + (68 - 246) * intensity);
        return `rgb(${r}, ${g}, ${b})`;
    };
    
    heatmapChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Average Spending',
                data: amounts,
                backgroundColor: intensities.map(getColor),
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `Avg: €${context.raw.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '€' + value
                    }
                }
            }
        }
    });
}

async function loadCashflowProjection() {
    try {
        const data = await API.analytics.getCashflowProjection(6);
        analyticsData.cashflow = data;
        
        const trendBadge = document.getElementById('projectionTrend');
        const trendColors = {
            positive: 'badge-success',
            negative: 'badge-error',
            stable: 'badge-info'
        };
        trendBadge.className = `badge badget-soft ${trendColors[data.summary.trend]}`;
        trendBadge.textContent = data.summary.trend === 'positive' ? 'Growing' : 
                                 data.summary.trend === 'negative' ? 'Declining' : 'Stable';
        
        const cashflowDescEl = document.getElementById('cashflowDescription');
        if (cashflowDescEl) {
            const monthlyNet = data.monthly_cashflow.net;
            let description = '';
            
            if (monthlyNet > 0) {
                description = `Based on your average monthly income (${Utils.formatCurrency(data.monthly_cashflow.income)}) 
                    and expenses (${Utils.formatCurrency(data.monthly_cashflow.expenses)}), 
                    you're saving approximately <strong>${Utils.formatCurrency(monthlyNet)}</strong> per month. 
                    Your balance is projected to reach <strong>${Utils.formatCurrency(data.summary.final_projected_balance)}</strong> in 6 months.`;
            } else if (monthlyNet < 0) {
                description = `Warning: You're spending more than you earn by <strong>${Utils.formatCurrency(Math.abs(monthlyNet))}</strong> monthly. 
                    ${data.warning || 'Review your expenses to prevent balance depletion.'}`;
            } else {
                description = `Your income and expenses are roughly balanced. Consider ways to increase your savings rate.`;
            }
            
            cashflowDescEl.innerHTML = `<p class="text-xs text-base-content/60">${description}</p>`;
        }
        
        renderCashflowChart(data);
        
    } catch (error) {
        console.error('Error loading cashflow projection:', error);
        document.getElementById('projectionTrend').textContent = 'Error';
    }
}

function renderCashflowChart(data) {
    const ctx = document.getElementById('cashflowChart').getContext('2d');
    
    if (cashflowChart) cashflowChart.destroy();
    
    const labels = ['Now', ...data.projections.map(p => {
        const [year, month] = p.month.split('-');
        return new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'short' });
    })];
    
    const balances = [data.current_balance, ...data.projections.map(p => p.projected_balance)];
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    
    cashflowChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Projected Balance',
                data: balances,
                borderColor: '#3B82F6',
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#3B82F6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `Balance: €${context.raw.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        callback: value => '€' + (value / 1000).toFixed(1) + 'k'
                    }
                }
            }
        }
    });
}

window.refreshAnalytics = refreshAnalytics;
window.loadSpendingForecast = loadSpendingForecast;
