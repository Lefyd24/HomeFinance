/**
 * Dashboard page controller
 */

// Global date range state - accessible from layout.js
window.dashboardDateRange = {
    startDate: Utils.getFirstDayOfMonth(),
    endDate: Utils.getLastDayOfMonth()
};

// Aliases for convenience
const dashboardDateRange = window.dashboardDateRange;

// State for edit modal
let dashboardAccounts = [];
let dashboardCategories = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('dashboard');
    
    // Get main content container
    const mainContent = document.getElementById('main-content');
    
    // Show skeleton loading screen initially
    const skeletonTemplate = document.getElementById('dashboard-skeleton');
    if (skeletonTemplate) {
        mainContent.innerHTML = skeletonTemplate.innerHTML;
    }
    
    // Load dashboard data (this will replace the skeleton)
    await loadDashboardData();
});

// Helper function to fetch all transactions across all pages
async function fetchAllTransactions(params) {
    const allTransactions = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
        const response = await API.transactions.list({
            ...params,
            page: page,
            per_page: 100
        });
        
        if (response.items && response.items.length > 0) {
            allTransactions.push(...response.items);
            
            // Check if there are more pages
            const totalPages = Math.ceil(response.total / response.per_page);
            hasMore = page < totalPages;
            page++;
        } else {
            hasMore = false;
        }
    }
    
    return allTransactions;
}

// Helper function to calculate months between two dates (accepts Date objects or strings)
function calculateMonthsInRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + 
                   (end.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
}

// Populate transaction modal selects
function populateDashboardModalSelects() {
    const accountSelect = document.getElementById('accountId');
    const destinationSelect = document.getElementById('destinationAccountId');
    const categorySelect = document.getElementById('categoryId');
    
    if (!accountSelect || !destinationSelect || !categorySelect) return;

    // Clear existing options except the first one
    accountSelect.innerHTML = '<option value="">Select Account</option>';
    destinationSelect.innerHTML = '<option value="">Select Destination Account</option>';

    dashboardAccounts.forEach(acc => {
        accountSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
        destinationSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
    });

    // Build category select with optgroups
    let categoryHtml = '<option value="">Select Category</option>';
    
    // Group categories by type
    const incomeCats = dashboardCategories.filter(c => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name));
    const expenseCats = dashboardCategories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name));
    const transferCats = dashboardCategories.filter(c => c.type === 'transfer').sort((a, b) => a.name.localeCompare(b.name));
    
    if (incomeCats.length > 0) {
        categoryHtml += '<optgroup label="📥 Income">';
        incomeCats.forEach(cat => {
            categoryHtml += `<option value="${cat.id}">${cat.name}</option>`;
        });
        categoryHtml += '</optgroup>';
    }
    
    if (expenseCats.length > 0) {
        categoryHtml += '<optgroup label="📤 Expense">';
        expenseCats.forEach(cat => {
            categoryHtml += `<option value="${cat.id}">${cat.name}</option>`;
        });
        categoryHtml += '</optgroup>';
    }
    
    if (transferCats.length > 0) {
        categoryHtml += '<optgroup label="🔄 Transfer">';
        transferCats.forEach(cat => {
            categoryHtml += `<option value="${cat.id}">${cat.name}</option>`;
        });
        categoryHtml += '</optgroup>';
    }

    categorySelect.innerHTML = categoryHtml;
}

// Update form visibility based on transaction type
window.updateDashboardFormForTransactionType = function() {
    const type = document.getElementById('transactionType').value;
    const destContainer = document.getElementById('destinationAccountContainer');
    const categoryContainer = document.getElementById('categoryContainer');
    const sourceLabel = document.getElementById('sourceAccountLabel');
    const destSelect = document.getElementById('destinationAccountId');
    const categorySelect = document.getElementById('categoryId');
    
    if (type === 'transfer') {
        destContainer.classList.remove('hidden');
        categoryContainer.classList.add('hidden');
        sourceLabel.textContent = 'From Account';
        destSelect.required = true;
        categorySelect.required = false;
        categorySelect.value = '';
    } else {
        destContainer.classList.add('hidden');
        categoryContainer.classList.remove('hidden');
        sourceLabel.textContent = 'Account';
        destSelect.required = false;
        destSelect.value = '';
        categorySelect.required = true;
    }
};

// Open edit transaction modal
window.openEditTransactionModal = async function(tx) {
    try {
        // Load accounts and categories if not already loaded
        if (dashboardAccounts.length === 0) {
            dashboardAccounts = await API.accounts.list();
        }
        if (dashboardCategories.length === 0) {
            dashboardCategories = await API.categories.list();
        }
        
        populateDashboardModalSelects();
        
        // Format date for input
        let formattedDate = tx.date;
        if (tx.date && typeof tx.date === 'string') {
            formattedDate = tx.date.split('T')[0];
        }
        
        // Populate form
        document.getElementById('transactionId').value = tx.id;
        document.getElementById('transactionType').value = tx.type;
        document.getElementById('amount').value = tx.amount;
        document.getElementById('accountId').value = tx.account_id;
        document.getElementById('description').value = tx.description;
        document.getElementById('transactionDate').value = formattedDate;
        document.getElementById('notes').value = tx.notes || '';
        
        // Handle transfer-specific fields
        if (tx.type === 'transfer') {
            document.getElementById('destinationAccountId').value = tx.destination_account_id || '';
            document.getElementById('categoryId').value = '';
        } else {
            document.getElementById('categoryId').value = tx.category_id || '';
        }
        
        // Update modal title and visibility
        document.getElementById('modalTitle').textContent = 'Edit Transaction';
        window.updateDashboardFormForTransactionType();
        
        transactionModal.showModal();
    } catch (error) {
        console.error('Error opening edit modal:', error);
        Utils.showToast('Error opening edit modal', 'error');
    }
};

// Handle transaction form submission
window.handleDashboardTransactionSubmit = async function(e) {
    e.preventDefault();
    
    const transactionId = document.getElementById('transactionId').value;
    const type = document.getElementById('transactionType').value;
    const data = {
        type: type,
        amount: parseFloat(document.getElementById('amount').value),
        account_id: parseInt(document.getElementById('accountId').value),
        description: document.getElementById('description').value,
        date: document.getElementById('transactionDate').value,
        notes: document.getElementById('notes').value || null
    };
    
    // Add category for income/expense, destination_account_id for transfers
    if (type === 'transfer') {
        const destId = document.getElementById('destinationAccountId').value;
        if (!destId) {
            Utils.showToast('Please select a destination account', 'error');
            return;
        }
        data.destination_account_id = parseInt(destId);
        data.category_id = null;
    } else {
        const catId = document.getElementById('categoryId').value;
        if (!catId) {
            Utils.showToast('Please select a category', 'error');
            return;
        }
        data.category_id = parseInt(catId);
        data.destination_account_id = null;
    }
    
    try {
        await API.transactions.update(parseInt(transactionId), data);
        Utils.showToast('Transaction updated successfully', 'success');
        transactionModal.close();
        e.target.reset();
        
        // Reload dashboard data
        await loadDashboardData();
    } catch (error) {
        console.error('Error saving transaction:', error);
        Utils.showToast(error.message || 'Error saving transaction', 'error');
    }
};

async function loadDashboardData() {
    try {
        // First, render the main content structure
        const mainContent = document.getElementById('main-content');
        mainContent.innerHTML = `
            <div class="dash-root">
                <!-- Financial overview: balance + period metrics + accounts -->
                <div id="summary-cards" class="dash-section"></div>

                <!-- Main analysis grid -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 lg:gap-6 dash-section">
                    <!-- Charts column -->
                    <div class="md:col-span-2 flex flex-col gap-4 md:gap-5">
                        <div class="dash-panel">
                            <div class="dash-panel-header">
                                <div>
                                    <h2 class="dash-panel-title">Spending Overview</h2>
                                    <p class="dash-panel-sub">Total expenses by category for the selected period</p>
                                </div>
                            </div>
                            <div id="spending-kpis" class="fin-mini-kpis"></div>
                            <div class="h-64 sm:h-72 lg:h-80">
                                <canvas id="spendingChart"></canvas>
                            </div>

                            <div class="dash-panel-divider"></div>

                            <div class="dash-panel-header" style="padding-bottom:0.5rem;">
                                <h2 class="dash-panel-title">Income vs Spending</h2>
                                <div class="join">
                                    <button class="join-item btn btn-xs btn-ghost" id="breakdownMonthlyBtn" onclick="setIncomeSpendingMode('month')">Monthly</button>
                                    <button class="join-item btn btn-xs btn-ghost" id="breakdownWeeklyBtn" onclick="setIncomeSpendingMode('week')">Weekly</button>
                                </div>
                            </div>
                            <div style="height:9rem;">
                                <canvas id="incomeVsSpendingChart"></canvas>
                            </div>
                        </div>

                    </div>

                    <!-- Right column: upcoming payments first, budgets second -->
                    <div class="flex flex-col gap-4 md:gap-5 fin-stagger">
                        <div id="debts-overview"></div>
                        <div id="budget-overview"></div>
                    </div>
                </div>

                <!-- Goals - full width -->
                <div id="goals-overview" class="dash-section"></div>

                <!-- Recent Transactions -->
                <div class="dash-panel dash-section">
                    <div class="dash-panel-header">
                        <h2 class="dash-panel-title">Recent Transactions</h2>
                        <a href="transactions.html" class="btn btn-xs btn-ghost">View all</a>
                    </div>
                    <div id="recent-transactions"></div>
                </div>

                <!-- Quick Actions -->
                <div class="flex flex-wrap gap-3 dash-section">
                    <button onclick="window.location.href='transactions.html'" class="btn btn-primary btn-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Transaction
                    </button>
                    <button onclick="window.location.href='import.html'" class="btn btn-ghost btn-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Import Bank File
                    </button>
                    <button onclick="window.location.href='budgets.html'" class="btn btn-ghost btn-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Manage Budgets
                    </button>
                </div>
            </div>
        `;
        
        // Load accounts and calculate total balance
        const accounts = await API.accounts.list();
        const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
        
        // Use selected date range
        const startDate = dashboardDateRange.startDate;
        const endDate = dashboardDateRange.endDate;
        
        // Load ALL transactions for selected date range (across all pages)
        const allTransactions = await fetchAllTransactions({
            start_date: startDate,
            end_date: endDate
        });
        
        let totalIncome = 0;
        let totalExpenses = 0;
        
        allTransactions.forEach(tx => {
            const amount = parseFloat(tx.amount || 0);
            if (tx.type === 'income') {
                totalIncome += amount;
            } else if (tx.type === 'expense') {
                totalExpenses += amount;
            }
        });
         
        const netSavings = totalIncome - totalExpenses;
         
        // Format date range for display
        const dateRangeText = formatDateRangeForDisplay(startDate, endDate);
         
        // Update summary overview
        const summaryContainer = document.getElementById('summary-cards');
        summaryContainer.innerHTML = `
            <!-- Uniform 4-column metric grid -->
            <div class="dash-overview-row">
                <div class="dash-metric-cell">
                    <p class="dash-metric-label">Total Balance</p>
                    <p class="dash-metric-value text-primary">${Utils.formatCurrency(totalBalance)}</p>
                    <p class="dash-metric-hint">${accounts.length} account${accounts.length !== 1 ? 's' : ''}</p>
                </div>
                <div class="dash-metric-cell">
                    <p class="dash-metric-label">Income</p>
                    <p class="dash-metric-value text-success">${Utils.formatCurrency(totalIncome)}</p>
                    <p class="dash-metric-hint">${dateRangeText}</p>
                </div>
                <div class="dash-metric-cell">
                    <p class="dash-metric-label">Expenses</p>
                    <p class="dash-metric-value text-error">${Utils.formatCurrency(totalExpenses)}</p>
                    <p class="dash-metric-hint">${dateRangeText}</p>
                </div>
                <div class="dash-metric-cell">
                    <p class="dash-metric-label">Net Saved</p>
                    <p class="dash-metric-value ${netSavings >= 0 ? 'text-success' : 'text-error'}">${netSavings >= 0 ? '' : '−'}${Utils.formatCurrency(Math.abs(netSavings))}</p>
                    <p class="dash-metric-hint">${dateRangeText}</p>
                </div>
            </div>

            <!-- Account Balances strip -->
            <div class="dash-accounts-header">
                <p class="dash-section-heading">Accounts</p>
                <a href="accounts.html" class="btn btn-xs btn-ghost">View all</a>
            </div>
            <div class="dash-accounts-strip">
                ${accounts.map(acc => `
                    <div class="dash-account-chip">
                        ${acc.icon
                            ? `<img src="../assets/icons/banks/${acc.icon}" alt="${acc.name}" class="dash-account-icon object-contain">`
                            : `<div class="dash-account-icon-placeholder">
                                <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                                </svg>
                               </div>`
                        }
                        <div class="dash-account-info">
                            <p class="dash-account-name" title="${acc.name}">${acc.name}</p>
                            <p class="dash-account-type">${acc.type}</p>
                            <p class="dash-account-balance ${parseFloat(acc.balance) >= 0 ? 'text-success' : 'text-error'}">${Utils.formatCurrency(acc.balance)}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Load spending chart
        await loadSpendingChart();
        
        // Load income vs spending chart
        await loadIncomeVsSpendingChart();

        // Load budget overview
        await loadBudgetOverview();

        // Load goals overview
        await loadGoalsOverview();

        // Load debts overview
        await loadDebtsOverview();

        // Load recent transactions
        await loadRecentTransactions();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        Utils.showToast('Error loading dashboard data', 'error');
    }
}

// Store chart instance globally
let spendingChartInstance = null;

function getCategoryRamp() {
    const root = getComputedStyle(document.documentElement);
    const ramp = [];
    for (let i = 1; i <= 6; i += 1) {
        const v = root.getPropertyValue(`--cat-${i}`).trim();
        if (v) ramp.push(v);
    }
    return ramp.length ? ramp : ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'];
}

function gridLineColor(opacity = 0.08) {
    const root = getComputedStyle(document.documentElement);
    const baseContent = root.getPropertyValue('--color-base-content').trim() || '#000';
    return `color-mix(in oklch, ${baseContent} ${Math.round(opacity * 100)}%, transparent)`;
}

async function loadSpendingChart() {
    const ctx = document.getElementById('spendingChart');
    if (!ctx) return;

    try {
        const data = await API.reports.spending({
            start_date: dashboardDateRange.startDate,
            end_date: dashboardDateRange.endDate
        });

        const labels = data.labels || [];
        const values = (data.data || []).map(v => parseFloat(v) || 0);
        const total = values.reduce((s, v) => s + v, 0);

        // Populate KPI strip above the chart
        const kpiHost = document.getElementById('spending-kpis');
        if (kpiHost) {
            if (!labels.length) {
                kpiHost.innerHTML = '';
            } else {
                let topIdx = 0;
                values.forEach((v, i) => { if (v > values[topIdx]) topIdx = i; });
                const topShare = total > 0 ? (values[topIdx] / total * 100) : 0;
                const txCount = data.transaction_count;
                kpiHost.innerHTML = `
                    <div>
                        <div class="fin-mini-kpi-label">Total Spent</div>
                        <div class="fin-mini-kpi-value">${Utils.formatCurrency(total)}</div>
                    </div>
                    <div>
                        <div class="fin-mini-kpi-label">Top Category</div>
                        <div class="fin-mini-kpi-value" style="font-size:0.9375rem;">${labels[topIdx] || '—'}</div>
                        <div class="fin-mini-kpi-delta">${topShare.toFixed(0)}% of spend</div>
                    </div>
                    <div>
                        <div class="fin-mini-kpi-label">Categories</div>
                        <div class="fin-mini-kpi-value">${labels.length}</div>
                        ${typeof txCount === 'number' ? `<div class="fin-mini-kpi-delta">${txCount} transactions</div>` : ''}
                    </div>
                `;
            }
        }

        if (spendingChartInstance) {
            spendingChartInstance.destroy();
        }

        const ramp = getCategoryRamp();
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const tickColor = gridLineColor(0.5);

        spendingChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Spending',
                    data: values,
                    backgroundColor: values.map((_, i) => ramp[i % ramp.length]),
                    hoverBackgroundColor: values.map((_, i) =>
                        `color-mix(in oklch, ${ramp[i % ramp.length]} 80%, white)`),
                    borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
                    borderSkipped: false,
                    categoryPercentage: 0.65,
                    barPercentage: 0.85
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: reduceMotion ? false : { duration: 600, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(20,20,25,0.92)',
                        padding: 10,
                        titleFont: { size: 12, weight: '600' },
                        bodyFont: { size: 12 },
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: (item) => {
                                const v = item.parsed.y;
                                const share = total > 0 ? (v / total * 100).toFixed(1) : '0';
                                return `${Utils.formatCurrency(v)} · ${share}% of total`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: tickColor,
                            font: { size: 11, weight: '500' },
                            maxRotation: 0,
                            autoSkip: true
                        }
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: {
                            color: gridLineColor(0.06),
                            drawTicks: false,
                            lineWidth: 1
                        },
                        ticks: {
                            color: tickColor,
                            font: { size: 11 },
                            padding: 8,
                            callback: function(value) { return '€' + value; }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading spending chart:', error);
    }
}

async function loadBudgetOverview() {
    try {
        const budgets = await API.budgets.list();
        const container = document.getElementById('budget-overview');
        
        if (!budgets || budgets.length === 0) {
            container.innerHTML = `
                <div class="dash-panel">
                    <div class="dash-panel-header">
                        <h2 class="dash-panel-title">Budget Overview</h2>
                    </div>
                    <p class="text-base-content/60 text-sm">No budgets created yet.</p>
                    <div class="flex justify-end mt-3">
                        <a href="budgets.html" class="btn btn-xs btn-primary">Create Budget</a>
                    </div>
                </div>
            `;
            return;
        }
        
        // Filter budgets that are relevant to the selected date range
        const rangeStart = new Date(dashboardDateRange.startDate);
        const rangeEnd = new Date(dashboardDateRange.endDate);
        
        const relevantBudgets = budgets.filter(budget => {
            const budgetStart = budget.start_date ? new Date(budget.start_date) : null;
            const budgetEnd = budget.end_date ? new Date(budget.end_date) : null;
            
            // Budget is relevant if it overlaps with the selected date range
            // No dates set = always relevant
            if (!budgetStart && !budgetEnd) return true;
            
            // Only start date set: relevant if start is before or within range
            if (budgetStart && !budgetEnd) return budgetStart <= rangeEnd;
            
            // Only end date set: relevant if end is after or within range
            if (!budgetStart && budgetEnd) return budgetEnd >= rangeStart;
            
            // Both dates set: relevant if there's any overlap
            return budgetStart <= rangeEnd && budgetEnd >= rangeStart;
        });
        
        if (relevantBudgets.length === 0) {
            container.innerHTML = `
                <div class="dash-panel">
                    <div class="dash-panel-header">
                        <h2 class="dash-panel-title">Budget Overview</h2>
                    </div>
                    <p class="text-base-content/60 text-sm">No budgets for the selected date range.</p>
                    <div class="flex justify-end mt-3">
                        <a href="budgets.html" class="btn btn-xs btn-primary">Manage Budgets</a>
                    </div>
                </div>
            `;
            return;
        }
        
        // Get ALL transactions for the selected date range to calculate budget spending
        const transactions = await fetchAllTransactions({
            start_date: dashboardDateRange.startDate,
            end_date: dashboardDateRange.endDate,
            type: 'expense'
        });
        
        // Calculate spending for each budget based on the date range (4 most relevant budgets for display purposes)
        const budgetsWithSpending = relevantBudgets.slice(0, 4).map(budget => {
            // Get category IDs for this budget
            const categoryIds = budget.category_ids || [];
            
            // Calculate effective date range (intersection of dashboard range and budget dates)
            // Use date-only strings for consistent comparison (avoid timezone issues)
            const budgetStartStr = budget.start_date ? budget.start_date.split('T')[0] : null;
            const budgetEndStr = budget.end_date ? budget.end_date.split('T')[0] : null;
            const rangeStartStr = dashboardDateRange.startDate;
            const rangeEndStr = dashboardDateRange.endDate;
            
            // Determine effective date range
            let effectiveStartStr = rangeStartStr;
            let effectiveEndStr = rangeEndStr;
            
            if (budgetStartStr && budgetStartStr > rangeStartStr) {
                effectiveStartStr = budgetStartStr;
            }
            if (budgetEndStr && budgetEndStr < rangeEndStr) {
                effectiveEndStr = budgetEndStr;
            }
            
            const matchingTransactions = transactions.filter(tx => {
                const txDateStr = tx.date ? tx.date.split('T')[0] : null;
                const categoryMatch = categoryIds.length === 0 || categoryIds.includes(tx.category_id);
                const dateMatch = txDateStr >= effectiveStartStr && txDateStr <= effectiveEndStr;
                const isExpense = tx.type === 'expense';
                return categoryMatch && dateMatch && isExpense;
            });
            
            const spent = matchingTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
            
            // Calculate months in effective range for budget amount adjustment
            const monthsInRange = calculateMonthsInRange(effectiveStartStr, effectiveEndStr);
            
            // Adjust budget amount based on frequency
            let adjustedBudgetAmount = budget.amount;
            let periodLabel = '';
            
            if (budget.period === 'monthly') {
                adjustedBudgetAmount = budget.amount * monthsInRange;
                periodLabel = monthsInRange === 1 ? '/month' : `/${monthsInRange} months`;
            } else if (budget.period === 'yearly') {
                const yearsInRange = monthsInRange / 12;
                adjustedBudgetAmount = budget.amount * yearsInRange;
                periodLabel = yearsInRange === 1 ? '/year' : `/${yearsInRange.toFixed(1)} years`;
            }
            
            const remaining = adjustedBudgetAmount - spent;
            const percentage = adjustedBudgetAmount > 0 ? (spent / adjustedBudgetAmount * 100) : 0;
            
            return {
                ...budget,
                spent,
                remaining,
                percentage,
                adjustedAmount: adjustedBudgetAmount,
                periodLabel,
                monthsInRange
            };
        });
        
        // Aggregate
        const totalBudget = budgetsWithSpending.reduce((sum, b) => sum + (b.adjustedAmount || 0), 0);
        const totalSpent = budgetsWithSpending.reduce((sum, b) => sum + (b.spent || 0), 0);
        const onTrackCount = budgetsWithSpending.filter(b => (b.percentage || 0) < 100).length;

        const tintForIndex = (i) => `var(--cat-${(i % 6) + 1})`;

        container.innerHTML = `
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div>
                        <h2 class="dash-panel-title">Budget Overview</h2>
                        <p class="dash-panel-sub fin-numeric">${Utils.formatCurrency(totalSpent)} of ${Utils.formatCurrency(totalBudget)}</p>
                    </div>
                    <a href="budgets.html" class="btn btn-xs btn-ghost">All</a>
                </div>
                <div>
                    ${budgetsWithSpending.map((budget, i) => {
                        const pct = Math.max(0, Math.min(100, budget.percentage || 0));
                        const over = (budget.percentage || 0) >= 100;
                        const tint = tintForIndex(i);
                        return `
                            <div class="fin-row">
                                <div class="fin-row-name" title="${budget.name}">${budget.name}</div>
                                <div class="fin-row-value">${Math.round(budget.percentage || 0)}%</div>
                                <div class="grid-cols-1" style="grid-column: 1 / -1;">
                                    <div class="fin-track" style="margin-top:0.375rem;">
                                        <div class="fin-track-fill ${over ? 'fin-track-fill-over' : ''}"
                                             style="width:${pct}%; ${over ? '' : `background:${tint};`}"></div>
                                    </div>
                                </div>
                                <div class="fin-row-meta">
                                    <span class="fin-numeric">${Utils.formatCurrency(budget.spent || 0)} / ${Utils.formatCurrency(budget.adjustedAmount)}</span>
                                    <span class="${budget.remaining < 0 ? 'text-error' : ''} fin-numeric">${budget.remaining < 0 ? '−' : ''}${Utils.formatCurrency(Math.abs(budget.remaining || 0))} ${budget.remaining < 0 ? 'over' : 'left'}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="flex justify-between items-center mt-3 pt-3" style="border-top: 1px solid color-mix(in oklch, var(--color-base-content) 6%, transparent);">
                    <span class="text-xs text-base-content/60">${onTrackCount} of ${budgetsWithSpending.length} on track</span>
                    <a href="budgets.html" class="text-xs font-medium text-primary hover:underline">Manage →</a>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading budget overview:', error);
    }
}

let incomeVsSpendingChart = null;
let incomeSpendingMode = 'month';

async function loadIncomeVsSpendingChart() {
    try {
        const canvas = document.getElementById('incomeVsSpendingChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        const data = await API.transactions.incomeVsSpending(
            dashboardDateRange.startDate,
            dashboardDateRange.endDate,
            incomeSpendingMode
        );
        
        if (incomeVsSpendingChart) {
            incomeVsSpendingChart.destroy();
        }
        
        incomeVsSpendingChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Income',
                        data: data.income,
                        fill: true,
                        backgroundColor: 'rgba(34, 197, 94, 0.2)',
                        borderColor: '#22C55E',
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#22C55E',
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#22C55E'
                    },
                    {
                        label: 'Spending',
                        data: data.spending,
                        fill: true,
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        borderColor: '#EF4444',
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#EF4444',
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#EF4444'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return '€' + value;
                            }
                        }
                    }
                }
            },
        });
    } catch (error) {
        console.error('Error loading income vs spending chart:', error);
    }
}

function setIncomeSpendingMode(mode) {
    incomeSpendingMode = mode;
    
    const monthlyBtn = document.getElementById('breakdownMonthlyBtn');
    const weeklyBtn = document.getElementById('breakdownWeeklyBtn');
    
    if (mode === 'month') {
        monthlyBtn.classList.remove('btn-ghost');
        weeklyBtn.classList.add('btn-ghost');
    } else {
        monthlyBtn.classList.add('btn-ghost');
        weeklyBtn.classList.remove('btn-ghost');
    }
    
    loadIncomeVsSpendingChart();
}



// Store active goals globally for modal access
let activeGoalsData = [];
let goalsCarouselInterval = null;
let countdownIntervals = [];

async function loadGoalsOverview() {
    try {
        const container = document.getElementById('goals-overview');
        if (!container) return;

        const goals = await API.goals.list();
        const activeGoals = goals.filter(g => g.status === 'active');
        activeGoalsData = activeGoals;

        if (!activeGoals || activeGoals.length === 0) {;
            container.innerHTML = `
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title mb-4 flex items-center gap-2">
                            <span class="text-xl">🎯</span> Financial Goals
                        </h2>
                        <p class="text-base-content/60 mb-4">No active goals. Create your first goal to start saving!</p>
                        <div class="card-actions justify-end">
                            <a href="goals.html" class="btn btn-sm btn-primary">Create Goal</a>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // Calculate countdown for each goal (days until target date)
        const goalsWithCountdown = activeGoals.map(goal => {
            const targetDate = goal.target_date ? new Date(goal.target_date) : null;
            const today = new Date();
            const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;
            return { ...goal, daysLeft };
        });

        container.innerHTML = `
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body p-4 lg:p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="card-title text-lg lg:text-xl flex items-center gap-2">
                            <span class="text-2xl">🎯</span> Financial Goals
                        </h2>
                        <a href="goals.html" class="btn btn-sm btn-ghost">
                            View All
                        </a>
                    </div>
                    
                    <!-- Goals Carousel -->
                    <div class="carousel carousel-center w-full rounded-box" id="goalsCarousel">
                        ${goalsWithCountdown.map((goal, index) => `
                            <div id="goal${index}" class="carousel-item w-10/12 snap-start mx-2" onclick="showGoalDetailModal(${goal.id})" style="cursor: pointer;">
                                <div class="w-full bg-gradient-to-br from-primary/10 to-secondary/40 rounded-lg p-6 hover:shadow-lg transition-shadow">
                                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <!-- Goal Info -->
                                        <div class="flex-1">
                                            <div class="flex items-center gap-3 mb-3">
                                                <span class="text-4xl">${goal.icon || '🎯'}</span>
                                                <div>
                                                    <h3 class="text-xl font-bold">${goal.name}</h3>
                                                    ${goal.description ? `<p class="text-sm text-base-content/60">${goal.description}</p>` : ''}
                                                </div>
                                            </div>
                                            
                                            <!-- Progress Bar -->
                                            <div class="mb-2">
                                                <div class="flex justify-between text-sm mb-1">
                                                    <span class="font-semibold">Progress</span>
                                                    <span class="font-bold text-primary">${Math.round(goal.progress_percentage || 0)}%</span>
                                                </div>
                                                <progress class="progress progress-primary w-full h-3" value="${goal.progress_percentage || 0}" max="100"></progress>
                                                <div class="flex justify-between text-xs text-base-content/60 mt-1">
                                                    <span>${Utils.formatCurrency(goal.current_amount || 0)}</span>
                                                    <span>${Utils.formatCurrency(goal.target_amount || 0)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Countdown -->
                                        ${goal.daysLeft !== null && goal.daysLeft >= 0 ? `
                                            <div class="p-4">
                                                <div class="text-center">
                                                    <div class="text-xs text-base-content/60 mb-2 uppercase tracking-wide">Time Remaining</div>
                                                    <div class="bg-secondary rounded-box p-3 text-neutral-content">
                                                        <span class="countdown font-mono text-2xl" id="countdown-${goal.id}" data-target-date="${goal.target_date}">
                                                            <span style="--value:0;" data-unit="days">0</span>
                                                            :
                                                            <span style="--value:0; --digits: 2;" data-unit="hours">0</span>
                                                            :
                                                            <span style="--value:0; --digits: 2;" data-unit="minutes">0</span>
                                                            :
                                                            <span style="--value:0; --digits: 2;" data-unit="seconds">0</span>
                                                        </span>
                                                        <div class="text-xs mt-2 opacity-70">Days : Hours : Min : Sec</div>
                                                    </div>
                                                    <div class="text-xs text-base-content/60 mt-2">
                                                        Target: ${Utils.formatDate(goal.target_date)}
                                                    </div>
                                                </div>
                                            </div>
                                        ` : goal.daysLeft !== null ? `
                                            <div class="bg-base-100 rounded-lg p-4 shadow-md text-center">
                                                <div class="text-xs text-base-content/60 mb-1">Target date passed</div>
                                                <div class="text-sm text-error font-bold">Overdue</div>
                                            </div>
                                        ` : `
                                            <div class="bg-base-100 rounded-lg p-4 shadow-md text-center">
                                                <div class="text-xs text-base-content/60 mb-1">No target date set</div>
                                                <div class="text-sm text-info">Open goal</div>
                                            </div>
                                        `}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- Carousel Indicators -->
                    ${goalsWithCountdown.length > 1 ? `
                        <div class="flex w-full justify-center gap-2 py-4">
                            ${goalsWithCountdown.map((_, index) => `
                                <button class="btn btn-xs" onclick="navigateToGoalSlide(${index}); resetCarouselAutoSlide(); return false;">${index + 1}</button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Start auto-slide carousel if more than 1 goal
        if (goalsWithCountdown.length > 1) {
            startGoalsCarouselAutoSlide(goalsWithCountdown.length);
        }
        
        // Start live countdowns
        startLiveCountdowns();
    } catch (error) {
        console.error('Error loading goals overview:', error);
        const container = document.getElementById('goals-overview');
        if (container) {
            container.innerHTML = `
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title mb-4 flex items-center gap-2">
                            <span class="text-xl">🎯</span> Financial Goals
                        </h2>
                        <div class="alert alert-error">
                            <span>Error loading goals: ${error.message || 'Unknown error'}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

// Navigate to goal slide without scrolling the page
window.navigateToGoalSlide = function(index) {
    const carousel = document.getElementById('goalsCarousel');
    const element = document.getElementById(`goal${index}`);
    if (!carousel || !element) return;

    // Calculate horizontal offset of the target item relative to the carousel
    const carouselRect = carousel.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    const offsetLeft = itemRect.left - carouselRect.left + carousel.scrollLeft;

    // Smooth-scroll only the carousel container horizontally to the target item
    try {
        carousel.scrollTo({ left: offsetLeft, behavior: 'smooth' });
    } catch (e) {
        // Fallback if smooth option not supported
        carousel.scrollLeft = offsetLeft;
    }
};

// Auto-slide carousel
function startGoalsCarouselAutoSlide(totalGoals) {
    // Clear existing interval
    if (goalsCarouselInterval) {
        clearInterval(goalsCarouselInterval);
    }
    
    let currentIndex = 0;
    goalsCarouselInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % totalGoals;
        navigateToGoalSlide(currentIndex);
    }, 7000); // Change slide every 7 seconds
}

// Reset auto-slide when user manually navigates
window.resetCarouselAutoSlide = function() {
    if (goalsCarouselInterval) {
        clearInterval(goalsCarouselInterval);
        // Restart auto-slide after manual navigation
        setTimeout(() => {
            const totalGoals = activeGoalsData.length;
            if (totalGoals > 1) {
                startGoalsCarouselAutoSlide(totalGoals);
            }
        }, 10000); // Wait 10 seconds before resuming auto-slide
    }
};

// Start live countdowns for all goals
function startLiveCountdowns() {
    // Clear existing intervals
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals = [];
    
    // Find all countdown elements
    const countdownElements = document.querySelectorAll('[id^="countdown-"]');
    
    countdownElements.forEach(element => {
        const targetDate = new Date(element.dataset.targetDate);
        
        // Update function
        const updateCountdown = () => {
            const now = new Date();
            const diff = targetDate - now;
            
            if (diff <= 0) {
                // Time's up
                const spans = element.querySelectorAll('span[data-unit]');
                spans.forEach(span => span.style.setProperty('--value', '0'));
                return;
            }
            
            // Calculate time units
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            // Update each span
            const daysSpan = element.querySelector('[data-unit="days"]');
            const hoursSpan = element.querySelector('[data-unit="hours"]');
            const minutesSpan = element.querySelector('[data-unit="minutes"]');
            const secondsSpan = element.querySelector('[data-unit="seconds"]');
            
            if (daysSpan) daysSpan.style.setProperty('--value', days);
            if (hoursSpan) hoursSpan.style.setProperty('--value', hours);
            if (minutesSpan) minutesSpan.style.setProperty('--value', minutes);
            if (secondsSpan) secondsSpan.style.setProperty('--value', seconds);
        };
        
        // Initial update
        updateCountdown();
        
        // Update every second
        const interval = setInterval(updateCountdown, 1000);
        countdownIntervals.push(interval);
    });
}

// Show goal detail modal
window.showGoalDetailModal = async function(goalId) {
    try {
        const goal = await API.goals.get(goalId);
        
        // Create modal if it doesn't exist
        let modal = document.getElementById('goalDetailModal');
        if (!modal) {
            modal = document.createElement('dialog');
            modal.id = 'goalDetailModal';
            modal.className = 'modal modal-middle';
            document.body.appendChild(modal);
        }
        
        const targetDate = goal.target_date ? new Date(goal.target_date) : null;
        const today = new Date();
        const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;
        const remaining = (goal.target_amount || 0) - (goal.current_amount || 0);
        
        modal.innerHTML = `
            <div class="modal-box max-w-2xl">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-3">
                        <span class="text-5xl">${goal.icon || '🎯'}</span>
                        <div>
                            <h3 class="text-2xl font-bold">${goal.name}</h3>
                            ${goal.description ? `<p class="text-sm text-base-content/60 mt-1">${goal.description}</p>` : ''}
                        </div>
                    </div>
                    <button onclick="goalDetailModal.close()" class="btn btn-ghost btn-circle btn-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <!-- Progress Section -->
                <div class="bg-base-200 rounded-lg p-4 mb-4">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-semibold">Progress</span>
                        <span class="text-2xl font-bold text-primary">${Math.round(goal.progress_percentage || 0)}%</span>
                    </div>
                    <progress class="progress progress-primary w-full h-4 mb-2" value="${goal.progress_percentage || 0}" max="100"></progress>
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <div>
                            <div class="text-xs text-base-content/60">Current</div>
                            <div class="font-bold text-success">${Utils.formatCurrency(goal.current_amount || 0)}</div>
                        </div>
                        <div>
                            <div class="text-xs text-base-content/60">Remaining</div>
                            <div class="font-bold text-warning">${Utils.formatCurrency(remaining)}</div>
                        </div>
                        <div>
                            <div class="text-xs text-base-content/60">Target</div>
                            <div class="font-bold text-info">${Utils.formatCurrency(goal.target_amount || 0)}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Details Grid -->
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-base-200 rounded-lg p-3">
                        <div class="text-xs text-base-content/60 mb-1">Status</div>
                        <div class="badge ${goal.status === 'active' ? 'badge-success' : goal.status === 'completed' ? 'badge-info' : 'badge-warning'}">
                            ${goal.status}
                        </div>
                    </div>
                    <div class="bg-base-200 rounded-lg p-3">
                        <div class="text-xs text-base-content/60 mb-1">Category</div>
                        <div class="font-medium capitalize">${goal.category || 'General'}</div>
                    </div>
                    ${goal.target_date ? `
                        <div class="bg-base-200 rounded-lg p-3">
                            <div class="text-xs text-base-content/60 mb-1">Target Date</div>
                            <div class="font-medium">${Utils.formatDate(goal.target_date)}</div>
                        </div>
                        <div class="bg-base-200 rounded-lg p-3">
                            <div class="text-xs text-base-content/60 mb-1">Days Left</div>
                            <div class="font-bold ${daysLeft < 0 ? 'text-error' : daysLeft < 30 ? 'text-warning' : 'text-success'}">
                                ${daysLeft !== null ? (daysLeft >= 0 ? `${daysLeft} days` : 'Overdue') : 'N/A'}
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                ${goal.notes ? `
                    <div class="bg-base-200 rounded-lg p-3 mb-4">
                        <div class="text-xs text-base-content/60 mb-1">Notes</div>
                        <div class="text-sm">${goal.notes}</div>
                    </div>
                ` : ''}
                
                <div class="modal-action">
                    <a href="goals.html" class="btn btn-primary">Manage Goals</a>
                    <button onclick="goalDetailModal.close()" class="btn">Close</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button>close</button>
            </form>
        `;
        
        modal.showModal();
    } catch (error) {
        console.error('Error loading goal details:', error);
        Utils.showToast('Error loading goal details', 'error');
    }
};

async function loadDebtsOverview() {
    try {
        const container = document.getElementById('debts-overview');
        if (!container) return;

        // Get all debts to calculate payment progress
        const debts = await API.debts.list();

        // Get upcoming payments for the next 30 days (recurring debts)
        const upcomingPayments = await API.debts.getUpcomingPayments(30);

        // Get upcoming recurring expenses for the next 15 days
        const upcomingRecurring = await API.recurringExpenses.getUpcoming(15);
        
        // Also include non-recurring debts whose next_payment_date falls within the selected date range
        const rangeStart = dashboardDateRange.startDate;
        const rangeEnd = dashboardDateRange.endDate;
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const nonRecurringPayments = debts
            .filter(d => {
                // Non-recurring: no recurrence_unit (recurrence_unit is null/empty)
                const isNonRecurring = !d.recurrence_unit;
                // Must be active, not paid off, and have a payment date
                return isNonRecurring && d.is_active && !d.is_paid_off && d.current_balance > 0 && d.next_payment_date;
            })
            .filter(d => {
                // Payment date must fall within the selected dashboard date range
                const payDate = d.next_payment_date.split('T')[0];
                return payDate >= rangeStart && payDate <= rangeEnd;
            })
            .map(d => {
                const payDate = d.next_payment_date.split('T')[0];
                const daysUntil = Math.round((new Date(payDate) - today) / (1000 * 60 * 60 * 24));
                return {
                    debt_id: d.id,
                    debt_name: d.name,
                    creditor: d.creditor,
                    amount: d.minimum_payment || d.current_balance,
                    due_date: d.next_payment_date,
                    days_until_due: daysUntil,
                    is_overdue: daysUntil < 0,
                    debt_type: d.type,
                    is_one_time: true
                };
            });
        
        // Merge recurring upcoming payments with non-recurring ones, avoiding duplicates
        const recurringDebtIds = new Set(upcomingPayments.map(p => p.debt_id));
        const uniqueNonRecurring = nonRecurringPayments.filter(p => !recurringDebtIds.has(p.debt_id));
        let allUpcomingPayments = [...upcomingPayments, ...uniqueNonRecurring]
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

        if (!allUpcomingPayments || allUpcomingPayments.length === 0) {
            if (upcomingRecurring.length === 0) {
                container.innerHTML = `
                    <div class="dash-panel">
                        <div class="dash-panel-header">
                            <h2 class="dash-panel-title">Upcoming Payments</h2>
                        </div>
                        <p class="text-base-content/60 text-sm">Nothing due in the selected window.</p>
                        <div class="flex justify-end mt-3">
                            <a href="debts.html" class="text-xs font-medium text-primary hover:underline">Manage debts →</a>
                        </div>
                    </div>
                `;
                return;
            }
            allUpcomingPayments = [];
        }
        
        const overdueCount = allUpcomingPayments.filter(p => p.is_overdue).length;

        // Combine debts + recurring expenses into a single list, then split by horizon
        const recurringRows = (upcomingRecurring || []).map(r => ({
            __type: 'recurring',
            name: r.name,
            secondary: r.category_name || 'Recurring',
            amount: r.amount,
            due_date: r.due_date,
            days_until_due: r.days_until_due,
            is_overdue: r.is_overdue,
            is_one_time: false
        }));
        const debtRows = allUpcomingPayments.map(p => ({
            __type: 'debt',
            name: p.debt_name,
            secondary: p.creditor || '—',
            amount: p.amount,
            due_date: p.due_date,
            days_until_due: p.days_until_due,
            is_overdue: p.is_overdue,
            is_one_time: !!p.is_one_time
        }));
        const merged = [...debtRows, ...recurringRows].sort((a, b) =>
            new Date(a.due_date) - new Date(b.due_date));

        const dueThisWeek = merged.filter(p => p.is_overdue || p.days_until_due <= 7);
        const dueLater    = merged.filter(p => !p.is_overdue && p.days_until_due > 7);

        const renderRow = (p) => {
            let statusClass = 'fin-status-future';
            let statusText  = `In ${p.days_until_due}d`;
            if (p.is_overdue) {
                statusClass = 'fin-status-overdue';
                statusText  = `Overdue · ${Math.abs(p.days_until_due)}d`;
            } else if (p.days_until_due === 0) {
                statusClass = 'fin-status-soon';
                statusText  = 'Due today';
            } else if (p.days_until_due <= 3) {
                statusClass = 'fin-status-soon';
                statusText  = `In ${p.days_until_due}d`;
            }
            const oneTime = p.is_one_time ? ' · One-time' : '';
            return `
                <div class="fin-row" style="grid-template-columns: 1fr auto;">
                    <div class="min-w-0">
                        <div class="fin-row-name" title="${p.name}">${p.name}</div>
                        <div class="text-xs text-base-content/60 truncate">${p.secondary}${oneTime}</div>
                    </div>
                    <div class="text-right">
                        <div class="fin-row-value fin-numeric">${Utils.formatCurrency(p.amount)}</div>
                        <div class="fin-status ${statusClass}">${statusText}</div>
                    </div>
                </div>
            `;
        };

        const sectionHeader = (title, count) => `
            <div class="flex items-baseline justify-between mt-1 mb-1">
                <span class="text-xs font-semibold uppercase tracking-wider text-base-content/55">${title}</span>
                <span class="text-xs text-base-content/45 fin-numeric">${count}</span>
            </div>
        `;

        const visibleThisWeek = dueThisWeek.slice(0, 5);
        const visibleLater    = dueLater.slice(0, 3);
        const hiddenCount     = (dueThisWeek.length - visibleThisWeek.length) + (dueLater.length - visibleLater.length);

        container.innerHTML = `
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div>
                        <h2 class="dash-panel-title">Upcoming Payments</h2>
                        ${overdueCount > 0
                            ? `<p class="dash-panel-sub" style="color: oklch(58% 0.18 25);">${overdueCount} overdue</p>`
                            : `<p class="dash-panel-sub">${merged.length} scheduled</p>`}
                    </div>
                    <a href="debts.html" class="btn btn-xs btn-ghost">All</a>
                </div>

                ${visibleThisWeek.length > 0 ? `
                    ${sectionHeader('Due this week', dueThisWeek.length)}
                    <div>${visibleThisWeek.map(renderRow).join('')}</div>
                ` : ''}

                ${visibleLater.length > 0 ? `
                    ${sectionHeader('Later this month', dueLater.length)}
                    <div>${visibleLater.map(renderRow).join('')}</div>
                ` : ''}

                ${visibleThisWeek.length === 0 && visibleLater.length === 0 ? `
                    <p class="text-base-content/60 text-sm py-2">Nothing due soon.</p>
                ` : ''}

                <div class="flex justify-between items-center mt-3 pt-3" style="border-top: 1px solid color-mix(in oklch, var(--color-base-content) 6%, transparent);">
                    <span class="text-xs text-base-content/60">${hiddenCount > 0 ? `+${hiddenCount} more` : ' '}</span>
                    <a href="debts.html" class="text-xs font-medium text-primary hover:underline">View all →</a>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading debts overview:', error);
        const container = document.getElementById('debts-overview');
        if (container) {
            container.innerHTML = `
                <div class="dash-panel">
                    <div class="dash-panel-header">
                        <h2 class="dash-panel-title">Upcoming Payments</h2>
                    </div>
                    <p class="text-error text-sm">Error loading: ${error.message || 'Unknown error'}</p>
                </div>
            `;
        }
    }
}

async function loadRecentTransactions() {
    try {
        const response = await API.transactions.list({ 
            limit: 5,
            start_date: dashboardDateRange.startDate,
            end_date: dashboardDateRange.endDate
        });
        const container = document.getElementById('recent-transactions');
        
        if (!response.items || response.items.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-base-content/60">No transactions yet.</p>
                    <button onclick="window.location.href='transactions.html'" class="btn btn-primary mt-4">Add Transaction</button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="table w-full">
                    <thead>
                        <tr>
                            <th class="text-xs md:text-sm">Date</th>
                            <th class="text-xs md:text-sm">Description</th>
                            <th class="hidden md:table-cell text-xs md:text-sm">Category</th>
                            <th class="hidden md:table-cell text-xs md:text-sm">Account</th>
                            <th class="text-right text-xs md:text-sm">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${response.items.map(tx => `
                            <tr class="hover cursor-pointer transition-colors" onclick="showTransactionDetailModal(${tx.id})">
                                <td class="text-xs md:text-sm whitespace-nowrap">${Utils.formatDate(tx.date)}</td>
                                <td class="text-xs md:text-sm max-w-[120px] md:max-w-none truncate" title="${tx.description}">${tx.description}</td>
                                <td class="hidden md:table-cell">
                                    <span class="badge badge-sm" style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};">
                                        ${tx.category_name || 'Uncategorized'}
                                    </span>
                                </td>
                                <td class="hidden md:table-cell text-xs md:text-sm">${tx.account_name || 'Unknown'}</td>
                                <td class="text-right text-xs md:text-sm font-semibold ${tx.type === 'income' ? 'text-success' : tx.type === 'transfer' ? 'text-info' : 'text-error'}">
                                    ${tx.type === 'income' ? '+' : tx.type === 'transfer' ? '⇄' : '-'}${Utils.formatCurrency(tx.amount)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading recent transactions:', error);
        document.getElementById('recent-transactions').innerHTML = `
            <div class="alert alert-error">
                <span>Error loading transactions. Please try again.</span>
            </div>
        `;
    }
}

// Show transaction detail modal
window.showTransactionDetailModal = async (transactionId) => {
    try {
        const tx = await API.transactions.get(transactionId);
        
        // Create modal if it doesn't exist
        let modal = document.getElementById('transactionDetailModal');
        if (!modal) {
            modal = document.createElement('dialog');
            modal.id = 'transactionDetailModal';
            modal.className = 'modal modal-middle sm:modal-middle';
            document.body.appendChild(modal);
        }
        
        const isTransfer = tx.type === 'transfer';
        const amountColor = tx.type === 'income' ? 'text-success' : isTransfer ? 'text-info' : 'text-error';
        const amountPrefix = tx.type === 'income' ? '+' : isTransfer ? '⇄' : '-';
        
        modal.innerHTML = `
            <div class="modal-box p-0">
                <div class="bg-primary/5 p-4 border-b border-base-300">
                    <div class="flex justify-between items-start">
                        <div class="flex-1 pr-2">
                            <p class="text-xs uppercase tracking-wide text-base-content/60 mb-1">${tx.type}</p>
                            <h3 class="text-lg font-bold line-clamp-2">${tx.description}</h3>
                        </div>
                        <button onclick="transactionDetailModal.close()" class="btn btn-ghost btn-circle btn-sm shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <p class="text-2xl font-bold ${amountColor} mt-3">
                        ${amountPrefix}${Utils.formatCurrency(tx.amount)}
                    </p>
                </div>
                
                <div class="p-4 space-y-3">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-base-200 rounded-lg p-3">
                            <p class="text-xs text-base-content/60 mb-1">Date</p>
                            <p class="font-medium text-sm flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                ${Utils.formatDate(tx.date)}
                            </p>
                        </div>
                        <div class="bg-base-200 rounded-lg p-3">
                            <p class="text-xs text-base-content/60 mb-1">Category</p>
                            <p class="font-medium text-sm">
                                ${isTransfer 
                                    ? '<span class="badge badge-info badge-sm">Transfer</span>'
                                    : `<span class="badge badge-sm" style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};">${tx.category_name || 'Uncategorized'}</span>`
                                }
                            </p>
                        </div>
                    </div>
                    
                    <div class="bg-base-200 rounded-lg p-3">
                        <p class="text-xs text-base-content/60 mb-1">${isTransfer ? 'From Account' : 'Account'}</p>
                        <p class="font-medium text-sm flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            <span class="truncate">${tx.account_name || 'Unknown'}</span>
                        </p>
                    </div>
                    
                    ${isTransfer && tx.destination_account_name ? `
                        <div class="bg-base-200 rounded-lg p-3">
                            <p class="text-xs text-base-content/60 mb-1">To Account</p>
                            <p class="font-medium text-sm flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V9" />
                                </svg>
                                <span class="truncate">${tx.destination_account_name}</span>
                            </p>
                        </div>
                    ` : ''}
                    
                    ${tx.notes ? `
                        <div class="bg-base-200 rounded-lg p-3">
                            <p class="text-xs text-base-content/60 mb-1">Notes</p>
                            <p class="text-sm">${tx.notes}</p>
                        </div>
                    ` : ''}
                    
                    <!-- Action Buttons - Always visible in modal -->
                    <div class="flex gap-2 pt-3 border-t border-base-300 mt-3">
                        <button onclick="openEditTransactionModal(${JSON.stringify(tx).replace(/"/g, '&quot;')}); transactionDetailModal.close();" class="btn btn-sm btn-ghost flex-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                        </button>
                        <button onclick="if(confirm('Delete this transaction?')) { /* delete logic */ transactionDetailModal.close(); Utils.showToast('Go to Transactions page to delete', 'info'); }" class="btn btn-sm btn-ghost text-error flex-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button>close</button>
            </form>
        `;
        
        modal.showModal();
    } catch (error) {
        console.error('Error loading transaction details:', error);
        Utils.showToast('Error loading transaction details:', 'error');
    }
};

// Helper function to format date range for display
function formatDateRangeForDisplay(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    
    // Check if it's today
    if (startDate === endDate && startDate === today.toISOString().split('T')[0]) {
        return '(Today)';
    }
    
    // Check if it's current month
    const currentMonthStart = Utils.getFirstDayOfMonth();
    const currentMonthEnd = Utils.getLastDayOfMonth();
    if (startDate === currentMonthStart && endDate === currentMonthEnd) {
        return '(This Month)';
    }
    
    // Check if it's current week
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
    if (startDate === currentWeekStart.toISOString().split('T')[0] && 
        endDate === currentWeekEnd.toISOString().split('T')[0]) {
        return '(This Week)';
    }
    
    // Check if it's current year
    const currentYearStart = `${today.getFullYear()}-01-01`;
    const currentYearEnd = `${today.getFullYear()}-12-31`;
    if (startDate === currentYearStart && endDate === currentYearEnd) {
        return '(This Year)';
    }
    
    // Default: show date range
    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    return `(${formatDate(start)} - ${formatDate(end)})`;
}

window.applyDashboardDateRange = function() {};

// Set date range from navbar or preset buttons
window.setDashboardDateRange = function(startDate, endDate) {
    if (!startDate || !endDate) return;
    
    if (new Date(startDate) > new Date(endDate)) {
        Utils.showToast('Start date cannot be after end date', 'error');
        return;
    }
    
    dashboardDateRange.startDate = startDate;
    dashboardDateRange.endDate = endDate;
    
    // Update navbar inputs
    if (Layout.updateNavbarDateInputs) {
        Layout.updateNavbarDateInputs(startDate, endDate);
    }
    
    Utils.showToast('Date range updated', 'success');
    loadDashboardData();
};

// Set date range preset
window.setDashboardDatePreset = function(preset) {
    const today = new Date();
    let startDate, endDate;
    
    switch (preset) {
        case 'today':
            startDate = today.toISOString().split('T')[0];
            endDate = startDate;
            break;
        case 'week':
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            startDate = weekStart.toISOString().split('T')[0];
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            endDate = weekEnd.toISOString().split('T')[0];
            break;
        case 'month':
            startDate = Utils.getFirstDayOfMonth();
            endDate = Utils.getLastDayOfMonth();
            break;
        case 'year':
            startDate = `${today.getFullYear()}-01-01`;
            endDate = `${today.getFullYear()}-12-31`;
            break;
        default:
            return;
    }
    
    // Update navbar inputs
    if (Layout.updateNavbarDateInputs) {
        Layout.updateNavbarDateInputs(startDate, endDate);
    }
    
    dashboardDateRange.startDate = startDate;
    dashboardDateRange.endDate = endDate;
    
    Utils.showToast(`Date range set to ${preset}`, 'success');
    loadDashboardData();
};

// Setup event listeners for transaction form
document.addEventListener('DOMContentLoaded', () => {
    // Setup form submission
    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', window.handleDashboardTransactionSubmit);
    }
    
    // Setup type change handler
    const transactionType = document.getElementById('transactionType');
    if (transactionType) {
        transactionType.addEventListener('change', window.updateDashboardFormForTransactionType);
    }
});