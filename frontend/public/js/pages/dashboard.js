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
    
    // Render dashboard content
    mainContent.innerHTML = `
        <div class="space-y-6">
            <!-- Summary Cards -->
            <div id="summary-cards"></div>
            
            <!-- Main Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                <!-- Spending Chart -->
                <div class="lg:col-span-2">
                    <div class="card bg-base-100 shadow-lg lg:shadow-xl">
                        <div class="card-body p-4 lg:p-6">
                            <h2 class="card-title text-lg lg:text-xl">Spending Overview</h2>
                            <div class="h-64 lg:h-80">
                                <canvas id="spendingChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Budget Overview -->
                <div>
                    <div id="budget-overview"></div>
                </div>
            </div>
            
            <!-- Recent Transactions -->
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="card-title">Recent Transactions</h2>
                        <a href="transactions.html" class="btn btn-sm btn-ghost">View All</a>
                    </div>
                    <div id="recent-transactions"></div>
                </div>
            </div>
            
            <!-- Quick Actions -->
            <div class="flex flex-wrap gap-4">
                <button onclick="window.location.href='transactions.html'" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Transaction
                </button>
                <button onclick="window.location.href='import.html'" class="btn btn-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Import Bank File
                </button>
                <button onclick="window.location.href='budgets.html'" class="btn btn-accent">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Manage Budgets
                </button>
            </div>
        </div>
    `;
    
    // Load dashboard data
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
        
        // Update summary cards
        const summaryContainer = document.getElementById('summary-cards');
        summaryContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <!-- Today's Balance Card -->
                <div class="card bg-base-100 shadow-sm border border-primary">
                    <div class="card-body">
                        <div class="flex items-center gap-3">
                            <div class="p-3 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-base-content/60">Today's Balance</p>
                                <p class="text-2xl font-bold text-primary">${Utils.formatCurrency(totalBalance)}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <div class="flex items-center gap-3">
                            <div class="p-3 bg-success/10 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-base-content/60">Income ${dateRangeText}</p>
                                <p class="text-2xl font-bold text-success">${Utils.formatCurrency(totalIncome)}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <div class="flex items-center gap-3">
                            <div class="p-3 bg-error/10 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-base-content/60">Expenses ${dateRangeText}</p>
                                <p class="text-2xl font-bold text-error">${Utils.formatCurrency(totalExpenses)}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <div class="flex items-center gap-3">
                            <div class="p-3 bg-info/10 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-base-content/60">Net Savings</p>
                                <p class="text-2xl font-bold ${netSavings >= 0 ? 'text-info' : 'text-error'}">${netSavings >= 0 ? '' : '-'}${Utils.formatCurrency(Math.abs(netSavings))}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Account Balances Section -->
            <div class="card bg-base-100 shadow-sm mb-6">
                <div class="card-body">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-lg flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            Account Balances
                        </h3>
                        <a href="accounts.html" class="btn btn-sm btn-ghost">View All</a>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        ${accounts.map(acc => `
                            <div class="bg-base-200 rounded-lg p-3">
                                <div class="flex items-center gap-3">
                                    ${acc.icon 
                                        ? `<img src="../assets/icons/banks/${acc.icon}" alt="${acc.name}" class="h-10 w-10 object-contain rounded shrink-0">`
                                        : `<div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                            </svg>
                                           </div>`
                                    }
                                    <div class="flex flex-col min-w-0">
                                        <p class="font-medium text-sm truncate" title="${acc.name}">${acc.name}</p>
                                        <p class="text-xs text-base-content/60 capitalize">${acc.type}</p>
                                        <p class="font-bold text-sm ${parseFloat(acc.balance) >= 0 ? 'text-success' : 'text-error'}">${Utils.formatCurrency(acc.balance)}</p>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
        `;
        
        // Load spending chart
        loadSpendingChart();
        
        // Load budget overview
        loadBudgetOverview();
        
        // Load recent transactions
        loadRecentTransactions();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        Utils.showToast('Error loading dashboard data', 'error');
    }
}

// Store chart instance globally
let spendingChartInstance = null;

async function loadSpendingChart() {
    const ctx = document.getElementById('spendingChart');
    if (!ctx) return;
    
    try {
        const data = await API.reports.spending({
            start_date: dashboardDateRange.startDate,
            end_date: dashboardDateRange.endDate
        });
        
        // Destroy existing chart if it exists
        if (spendingChartInstance) {
            spendingChartInstance.destroy();
        }
        
        spendingChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Spending',
                    data: data.data || [],
                    backgroundColor: [
                        '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '€' + value;
                            }
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
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title mb-4">Budget Overview</h2>
                        <p class="text-base-content/60">No budgets created yet.</p>
                        <div class="card-actions justify-end mt-4">
                            <a href="budgets.html" class="btn btn-sm btn-primary">Create Budget</a>
                        </div>
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
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title mb-4">Budget Overview</h2>
                        <p class="text-base-content/60">No budgets for the selected date range.</p>
                        <div class="card-actions justify-end mt-4">
                            <a href="budgets.html" class="btn btn-sm btn-primary">Manage Budgets</a>
                        </div>
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
        
        // Calculate spending for each budget based on the date range
        const budgetsWithSpending = relevantBudgets.slice(0, 3).map(budget => {
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
            
            // Calculate spent amount from transactions within the effective date range
            const matchingTransactions = transactions.filter(tx => {
                const txDateStr = tx.date ? tx.date.split('T')[0] : null;
                const categoryMatch = categoryIds.includes(tx.category_id);
                const dateMatch = txDateStr >= effectiveStartStr && txDateStr <= effectiveEndStr;
                return categoryMatch && dateMatch;
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
        
        container.innerHTML = `
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h2 class="card-title mb-4">Budget Overview</h2>
                    <div class="space-y-4">
                        ${budgetsWithSpending.map(budget => `
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="font-medium">${budget.name}</span>
                                    <span class="text-sm">${Utils.formatCurrency(budget.spent || 0)} / ${Utils.formatCurrency(budget.adjustedAmount)}</span>
                                </div>
                                <progress class="progress ${(budget.percentage || 0) > 90 ? 'progress-error' : (budget.percentage || 0) > 75 ? 'progress-warning' : 'progress-primary'} w-full" 
                                          value="${budget.percentage || 0}" max="100"></progress>
                                <div class="flex justify-between mt-1 text-xs text-base-content/60">
                                    <span>${Math.round(budget.percentage || 0)}% used ${budget.periodLabel}</span>
                                    <span class="${budget.remaining < 0 ? 'text-error' : ''}">${Utils.formatCurrency(Math.abs(budget.remaining || 0))} ${budget.remaining < 0 ? 'over' : 'left'}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="card-actions justify-end mt-4">
                        <a href="budgets.html" class="btn btn-sm btn-ghost">Manage Budgets</a>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading budget overview:', error);
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

// Apply date range from picker (deprecated, use navbar instead)
window.applyDashboardDateRange = function() {
    // This function is kept for compatibility, but date picker is now in navbar
    // Use setDashboardDateRange or navbar apply button instead
    console.log('applyDashboardDateRange is deprecated, use navbar date picker');
};

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