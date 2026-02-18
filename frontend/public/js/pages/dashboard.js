/**
 * Dashboard page controller
 */

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

async function loadDashboardData() {
    try {
        // Load accounts and calculate total balance
        const accounts = await API.accounts.list();
        const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
        
        // Get current month's date range
        const startDate = Utils.getFirstDayOfMonth();
        const endDate = Utils.getLastDayOfMonth();
        
        // Load transactions for current month to calculate income/expenses
        const txResponse = await API.transactions.list({
            start_date: startDate,
            end_date: endDate,
            limit: 100
        });
        
        let totalIncome = 0;
        let totalExpenses = 0;
        
        if (txResponse.items) {
            txResponse.items.forEach(tx => {
                const amount = parseFloat(tx.amount || 0);
                if (tx.type === 'income') {
                    totalIncome += amount;
                } else if (tx.type === 'expense') {
                    totalExpenses += amount;
                }
            });
        }
        
        const netSavings = totalIncome - totalExpenses;
        
        // Update summary cards
        const summaryContainer = document.getElementById('summary-cards');
        summaryContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <!-- Total Balance Card -->
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <div class="flex items-center gap-3">
                            <div class="p-3 bg-primary/10 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-base-content/60">Total Balance</p>
                                <p class="text-2xl font-bold">${Utils.formatCurrency(totalBalance)}</p>
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
                                <p class="text-sm text-base-content/60">Income (Month)</p>
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
                                <p class="text-sm text-base-content/60">Expenses (Month)</p>
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
                                <div class="flex flex-col">
                                    <p class="font-medium text-sm truncate" title="${acc.name}">${acc.name}</p>
                                    <p class="text-xs text-base-content/60 capitalize">${acc.type}</p>
                                    <p class="font-bold text-sm mt-1 ${parseFloat(acc.balance) >= 0 ? 'text-success' : 'text-error'}">${Utils.formatCurrency(acc.balance)}</p>
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

async function loadSpendingChart() {
    const ctx = document.getElementById('spendingChart');
    if (!ctx) return;
    
    try {
        const data = await API.reports.spending({
            start_date: Utils.getFirstDayOfMonth(),
            end_date: Utils.getLastDayOfMonth()
        });
        
        new Chart(ctx, {
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
        
        container.innerHTML = `
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h2 class="card-title mb-4">Budget Overview</h2>
                    <div class="space-y-4">
                        ${budgets.slice(0, 3).map(budget => `
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="font-medium">${budget.name}</span>
                                    <span class="text-sm">${Utils.formatCurrency(budget.spent || 0)} / ${Utils.formatCurrency(budget.amount)}</span>
                                </div>
                                <progress class="progress ${(budget.percentage || 0) > 90 ? 'progress-error' : (budget.percentage || 0) > 75 ? 'progress-warning' : 'progress-primary'} w-full" 
                                          value="${budget.percentage || 0}" max="100"></progress>
                                <div class="flex justify-between mt-1 text-xs text-base-content/60">
                                    <span>${Math.round(budget.percentage || 0)}% used</span>
                                    <span>${Utils.formatCurrency(budget.remaining || 0)} left</span>
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
        const response = await API.transactions.list({ limit: 5 });
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
                <table class="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Category</th>
                            <th>Account</th>
                            <th class="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${response.items.map(tx => `
                            <tr class="hover">
                                <td>${Utils.formatDate(tx.date)}</td>
                                <td>${tx.description}</td>
                                <td>
                                    <span class="badge badge-sm" style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};">
                                        ${tx.category_name || 'Uncategorized'}
                                    </span>
                                </td>
                                <td>${tx.account_name || 'Unknown'}</td>
                                <td class="text-right ${tx.type === 'income' ? 'text-success' : 'text-error'}">
                                    ${tx.type === 'income' ? '+' : '-'}${Utils.formatCurrency(tx.amount)}
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