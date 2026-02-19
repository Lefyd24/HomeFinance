/**
 * Insights page controller
 */

let currentInsights = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    Layout.render('insights');
    
    const template = document.getElementById('insights-template');
    const mainContent = document.getElementById('main-content');
    if (template && mainContent) {
        mainContent.innerHTML = '';
        mainContent.appendChild(template.content.cloneNode(true));
    }
    
    await loadInsightsPage();
});

async function loadInsightsPage() {
    try {
        await Promise.all([
            loadInsights(),
            loadInsightsSummary(),
            loadTrendAnalysis(),
            loadStatistics()
        ]);
    } catch (error) {
        console.error('Error loading insights page:', error);
        Utils.showToast('Error loading insights', 'error');
    }
}

async function loadInsights() {
    try {
        const container = document.getElementById('insights-list');
        container.innerHTML = '<div class="loading loading-spinner loading-lg mx-auto block"></div>';
        
        const insights = await API.insights.list(30, true, false);
        currentInsights = insights;
        
        renderInsights();
    } catch (error) {
        console.error('Error loading insights:', error);
        document.getElementById('insights-list').innerHTML = `
            <div class="alert alert-error">
                <span>Failed to load insights: ${error.message}</span>
            </div>
        `;
    }
}

function renderInsights() {
    const container = document.getElementById('insights-list');
    
    if (currentInsights.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-base-content/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p class="text-base-content/60">No insights found</p>
            </div>
        `;
        return;
    }
    
    const categorized = {
        alerts: currentInsights.filter(i => i.severity === 'alert' || i.severity === 'warning'),
        seasonal: currentInsights.filter(i => i.type === 'seasonal_pattern'),
        general: currentInsights.filter(i => 
            i.severity !== 'alert' && 
            i.severity !== 'warning' && 
            i.type !== 'seasonal_pattern'
        )
    };
    
    let html = '';
    
    if (categorized.alerts.length > 0) {
        html += renderInsightCategory('⚠️ Alerts & Warnings', categorized.alerts, 'alert');
    }
    
    if (categorized.seasonal.length > 0) {
        html += renderInsightCategory('📅 Seasonal Patterns', categorized.seasonal, 'seasonal');
    }
    
    if (categorized.general.length > 0) {
        html += renderInsightCategory('💡 General Insights', categorized.general, 'general');
    }
    
    container.innerHTML = html;
}

function renderInsightCategory(title, insights, categoryType) {
    const bgClass = {
        alert: 'bg-error/5 border-error/20',
        seasonal: 'bg-info/5 border-info/20',
        general: 'bg-base-200 border-base-300'
    };
    
    return `
        <div class="border rounded-lg ${bgClass[categoryType] || bgClass.general}">
            <div class="px-4 py-2 border-b border-base-300/50">
                <h3 class="font-semibold text-sm">${title} <span class="badge badge-ghost badge-sm">${insights.length}</span></h3>
            </div>
            <div class="divide-y divide-base-300/30 max-h-64 overflow-y-auto">
                ${insights.map(insight => renderInsightItem(insight)).join('')}
            </div>
        </div>
    `;
}

function renderInsightItem(insight) {
    const severityColors = {
        alert: 'text-error',
        warning: 'text-warning',
        info: 'text-info',
        success: 'text-success'
    };
    
    const severityIcons = {
        alert: '⚠️',
        warning: '⚡',
        info: '💡',
        success: '✅'
    };
    
    return `
        <div class="p-3 hover:bg-base-200/50 cursor-pointer transition-colors ${insight.is_read ? 'opacity-60' : ''}" 
             onclick="toggleInsightDetails(${insight.id})">
            <div class="flex items-start gap-3">
                <span class="text-lg mt-0.5">${severityIcons[insight.severity] || '💡'}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-medium text-sm ${severityColors[insight.severity] || ''}">${insight.title}</span>
                        ${!insight.is_read ? '<span class="w-2 h-2 bg-primary rounded-full"></span>' : ''}
                    </div>
                    <p class="text-xs text-base-content/70 mt-1 line-clamp-2">${insight.description}</p>
                    <div class="flex items-center gap-3 mt-2 flex-wrap">
                        ${insight.category ? `<span class="text-xs text-base-content/50">${insight.category}</span>` : ''}
                        ${insight.metric_value ? `<span class="text-xs font-medium">${Utils.formatCurrency(insight.metric_value)}</span>` : ''}
                        ${insight.percentage_change ? 
                            `<span class="badge badge-xs ${insight.percentage_change > 0 ? 'badge-error' : 'badge-success'}">
                                ${insight.percentage_change > 0 ? '+' : ''}${insight.percentage_change.toFixed(1)}%
                            </span>` : ''}
                    </div>
                </div>
                <div class="flex gap-1 shrink-0">
                    ${!insight.is_read ? `
                        <button onclick="event.stopPropagation(); markAsRead(${insight.id})" 
                                class="btn btn-ghost btn-xs btn-circle" title="Mark as read">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                    ` : ''}
                    <button onclick="event.stopPropagation(); dismissInsight(${insight.id})" 
                            class="btn btn-ghost btn-xs btn-circle" title="Dismiss">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function markAsRead(id) {
    try {
        await API.insights.markRead(id);
        const insight = currentInsights.find(i => i.id === id);
        if (insight) insight.is_read = true;
        renderInsights();
        Utils.showToast('Marked as read', 'success');
    } catch (error) {
        console.error('Error marking insight as read:', error);
        Utils.showToast('Failed to mark as read', 'error');
    }
}

async function markAllAsRead() {
    try {
        await API.insights.markAllRead();
        currentInsights.forEach(i => i.is_read = true);
        renderInsights();
        Utils.showToast('All insights marked as read', 'success');
    } catch (error) {
        console.error('Error marking all as read:', error);
        Utils.showToast('Failed to mark all as read', 'error');
    }
}

async function dismissInsight(id) {
    try {
        await API.insights.dismiss(id);
        currentInsights = currentInsights.filter(i => i.id !== id);
        renderInsights();
        Utils.showToast('Insight dismissed', 'success');
    } catch (error) {
        console.error('Error dismissing insight:', error);
        Utils.showToast('Failed to dismiss insight', 'error');
    }
}

async function loadInsightsSummary() {
    try {
        const summary = await API.insights.getSummary();
        
        document.getElementById('insights-summary').innerHTML = `
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body p-4">
                    <p class="text-sm text-base-content/60">Total Insights</p>
                    <p class="text-2xl font-bold">${summary.total_count}</p>
                </div>
            </div>
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body p-4">
                    <p class="text-sm text-base-content/60">Unread</p>
                    <p class="text-2xl font-bold ${summary.unread_count > 0 ? 'text-primary' : ''}">${summary.unread_count}</p>
                </div>
            </div>
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body p-4">
                    <p class="text-sm text-base-content/60">Warnings</p>
                    <p class="text-2xl font-bold ${summary.warning_count > 0 ? 'text-warning' : ''}">${summary.warning_count}</p>
                </div>
            </div>
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body p-4">
                    <p class="text-sm text-base-content/60">Alerts</p>
                    <p class="text-2xl font-bold ${summary.alert_count > 0 ? 'text-error' : ''}">${summary.alert_count}</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading insights summary:', error);
    }
}

async function refreshInsights() {
    try {
        Utils.showToast('Generating insights...', 'info');
        await API.insights.generate(30);
        await loadInsightsPage();
        Utils.showToast('Insights refreshed', 'success');
    } catch (error) {
        console.error('Error refreshing insights:', error);
        Utils.showToast('Failed to refresh insights', 'error');
    }
}

async function loadTrendAnalysis() {
    try {
        const container = document.getElementById('trend-container');
        
        const trends = await API.insights.getTrends(6);
        
        if (trends.error) {
            container.innerHTML = `<div class="alert alert-info text-sm"><span>${trends.error}</span></div>`;
            return;
        }
        
        const trendIcon = trends.trend_direction === 'increasing' ? '📈' : 
                         trends.trend_direction === 'decreasing' ? '📉' : '➡️';
        const trendColor = trends.trend_direction === 'increasing' ? 'text-error' : 
                          trends.trend_direction === 'decreasing' ? 'text-success' : 'text-info';
        
        container.innerHTML = `
            <div class="space-y-3">
                <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${trendIcon}</span>
                        <div>
                            <p class="font-bold ${trendColor}">${trends.trend_direction === 'increasing' ? 'Increasing' : trends.trend_direction === 'decreasing' ? 'Decreasing' : 'Stable'}</p>
                            <p class="text-xs text-base-content/60">Trend Direction</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold ${trendColor}">${trends.trend_percentage > 0 ? '+' : ''}${trends.trend_percentage.toFixed(1)}%</p>
                        <p class="text-xs text-base-content/60">Change</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-2">
                    <div class="p-2 bg-base-200 rounded-lg text-center">
                        <p class="text-xs text-base-content/60">R² Value</p>
                        <p class="font-bold">${trends.r_squared.toFixed(3)}</p>
                        <p class="text-xs ${trends.is_significant ? 'text-success' : 'text-base-content/50'}">
                            ${trends.is_significant ? '✓ Significant' : 'Not significant'}
                        </p>
                    </div>
                    <div class="p-2 bg-base-200 rounded-lg text-center">
                        <p class="text-xs text-base-content/60">Data Points</p>
                        <p class="font-bold">${trends.months_analyzed} months</p>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading trend analysis:', error);
        document.getElementById('trend-container').innerHTML = `
            <div class="alert alert-error text-sm"><span>Failed to load trends</span></div>
        `;
    }
}

async function loadStatistics() {
    try {
        const container = document.getElementById('statistics-container');
        
        const stats = await API.insights.getStatistics(6);
        
        if (stats.error) {
            container.innerHTML = `<div class="alert alert-info text-sm"><span>${stats.error}</span></div>`;
            return;
        }
        
        container.innerHTML = `
            <div class="space-y-3">
                <div class="grid grid-cols-2 gap-2">
                    <div class="p-2 bg-base-200 rounded-lg text-center">
                        <p class="text-xs text-base-content/60">Total Spent</p>
                        <p class="font-bold">${Utils.formatCurrency(stats.total_spent)}</p>
                    </div>
                    <div class="p-2 bg-base-200 rounded-lg text-center">
                        <p class="text-xs text-base-content/60">Transactions</p>
                        <p class="font-bold">${stats.total_transactions}</p>
                    </div>
                </div>
                
                <div class="space-y-1 text-sm">
                    <div class="flex justify-between">
                        <span class="text-base-content/60">Avg Transaction</span>
                        <span class="font-medium">${Utils.formatCurrency(stats.transaction_statistics.mean)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/60">Median</span>
                        <span class="font-medium">${Utils.formatCurrency(stats.transaction_statistics.median)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/60">Monthly Avg</span>
                        <span class="font-medium">${Utils.formatCurrency(stats.average_monthly_spending)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/60">Volatility</span>
                        <span class="font-medium ${stats.spending_volatility > 0.3 ? 'text-warning' : 'text-success'}">
                            ${(stats.spending_volatility * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading statistics:', error);
        document.getElementById('statistics-container').innerHTML = `
            <div class="alert alert-error text-sm"><span>Failed to load statistics</span></div>
        `;
    }
}

async function detectPatterns() {
    try {
        const container = document.getElementById('patterns-container');
        container.innerHTML = '<div class="loading loading-spinner loading-lg mx-auto block"></div>';
        
        Utils.showToast('Analyzing spending patterns...', 'info');
        await API.insights.detectPatterns();
        const patterns = await API.insights.getPatterns();
        
        if (patterns.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <span>No patterns detected yet. Continue using the app to build transaction history.</span>
                </div>
            `;
            return;
        }
        
        const patternTypeLabels = {
            recurring: 'Recurring',
            weekend: 'Weekend',
            seasonal: 'Seasonal',
            weekly: 'Weekly'
        };
        
        container.innerHTML = `
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Description</th>
                        <th class="text-right">Avg Amount</th>
                        <th class="text-center">Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    ${patterns.map(pattern => `
                        <tr class="hover:bg-base-200">
                            <td>
                                <span class="badge badge-ghost badge-sm">
                                    ${patternTypeLabels[pattern.pattern_type] || pattern.pattern_type}
                                </span>
                            </td>
                            <td>
                                <p class="text-sm truncate max-w-[200px]" title="${pattern.description}">${pattern.description}</p>
                            </td>
                            <td class="text-right">
                                ${pattern.average_amount ? Utils.formatCurrency(pattern.average_amount) : '-'}
                            </td>
                            <td class="text-center">
                                <span class="badge badge-sm ${pattern.confidence_score > 0.8 ? 'badge-success' : 'badge-warning'}">
                                    ${(pattern.confidence_score * 100).toFixed(0)}%
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        Utils.showToast(`Detected ${patterns.length} patterns`, 'success');
    } catch (error) {
        console.error('Error detecting patterns:', error);
        document.getElementById('patterns-container').innerHTML = `
            <div class="alert alert-error"><span>Failed to detect patterns</span></div>
        `;
    }
}

async function detectAnomalies() {
    try {
        const container = document.getElementById('anomalies-container');
        container.innerHTML = '<div class="loading loading-spinner loading-lg mx-auto block"></div>';
        
        Utils.showToast('Checking for anomalies...', 'info');
        const result = await API.insights.getAnomalies(30, 2.5);
        
        if (result.total_anomalies === 0) {
            container.innerHTML = `
                <div class="alert alert-success">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>No anomalies detected!</span>
                </div>
                <button onclick="detectAnomalies()" class="btn btn-sm btn-primary w-full mt-3">Check Again</button>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="mb-2 flex items-center justify-between">
                <span class="text-sm text-base-content/60">${result.total_anomalies} unusual transactions</span>
                <span class="text-xs text-base-content/50">vs category avg</span>
            </div>
            <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
                ${result.anomalies.map(anomaly => `
                    <div class="p-3 rounded-lg ${anomaly.severity === 'high' ? 'bg-error/10 border border-error/20' : 'bg-warning/10 border border-warning/20'}">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium truncate" title="${anomaly.description}">${anomaly.description}</p>
                                <p class="text-xs text-base-content/50 mt-1">${anomaly.date}</p>
                            </div>
                            <span class="badge badge-sm ${anomaly.severity === 'high' ? 'badge-error' : 'badge-warning'} shrink-0">
                                ${anomaly.severity}
                            </span>
                        </div>
                        <div class="flex items-center justify-between mt-2 pt-2 border-t border-base-300/30">
                            <span class="font-bold">${Utils.formatCurrency(anomaly.amount)}</span>
                            <span class="text-xs ${anomaly.severity === 'high' ? 'text-error' : 'text-warning'}">
                                ${anomaly.deviation_percentage > 0 ? '+' : ''}${anomaly.deviation_percentage.toFixed(0)}% above avg
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button onclick="detectAnomalies()" class="btn btn-sm btn-primary w-full mt-3">Check Again</button>
        `;
        
        Utils.showToast(`Found ${result.total_anomalies} anomalies`, result.total_anomalies > 5 ? 'warning' : 'info');
    } catch (error) {
        console.error('Error detecting anomalies:', error);
        document.getElementById('anomalies-container').innerHTML = `
            <div class="alert alert-error"><span>Failed to detect anomalies</span></div>
            <button onclick="detectAnomalies()" class="btn btn-sm btn-primary w-full mt-3">Try Again</button>
        `;
    }
}

function toggleInsightDetails(id) {
    const insight = currentInsights.find(i => i.id === id);
    if (insight && !insight.is_read) {
        markAsRead(id);
    }
}
