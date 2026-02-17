/**
 * Budgets page controller
 */

// State (global for this module)
let budgets = [];
let categories = [];

// Global functions for onclick handlers
window.editBudget = (id) => {
    Utils.showToast('Edit functionality coming soon!', 'info');
};

window.deleteBudget = async (id) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;
    
    try {
        await API.budgets.delete(id);
        Utils.showToast('Budget deleted', 'success');
        budgets = budgets.filter(b => b.id !== id);
        renderBudgets();
        renderBudgetSummary();
    } catch (error) {
        Utils.showToast('Error deleting budget', 'error');
    }
};

window.viewBudgetDetails = async (id) => {
    try {
        const response = await API.budgets.getTransactions(id);
        const budget = response.budget;
        const transactions = response.items;
        const total = response.total;
        
        // Get full budget details for progress
        const budgetDetails = await API.budgets.get(id);
        
        // Update modal title
        document.getElementById('budgetDetailsTitle').textContent = budget.name;
        
        // Render budget info
        const infoContainer = document.getElementById('budgetDetailsInfo');
        infoContainer.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Budget Amount</div>
                    <div class="stat-value text-lg">${Utils.formatCurrency(budgetDetails.amount)}</div>
                </div>
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Spent</div>
                    <div class="stat-value text-lg text-error">${Utils.formatCurrency(budgetDetails.spent)}</div>
                </div>
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Remaining</div>
                    <div class="stat-value text-lg ${budgetDetails.remaining < 0 ? 'text-error' : 'text-success'}">${Utils.formatCurrency(Math.abs(budgetDetails.remaining))}${budgetDetails.remaining < 0 ? ' over' : ''}</div>
                </div>
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Usage</div>
                    <div class="stat-value text-lg">${budgetDetails.percentage}%</div>
                    <progress class="progress ${budgetDetails.percentage > 90 ? 'progress-error' : budgetDetails.percentage > 75 ? 'progress-warning' : 'progress-primary'} w-full" value="${budgetDetails.percentage}" max="100"></progress>
                </div>
            </div>
            <div class="mt-4 text-sm text-base-content/60">
                <span class="font-medium">Period:</span> ${Utils.formatDate(budget.start_date)} - ${Utils.formatDate(budget.end_date)}
            </div>
        `;
        
        // Render transactions table
        const tableContainer = document.getElementById('budgetTransactionsTable');
        
        if (transactions.length === 0) {
            tableContainer.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-base-content/60">No transactions found for this budget period</p>
                </div>
            `;
        } else {
            tableContainer.innerHTML = `
                <div class="overflow-x-auto">
                    <table class="table table-sm">
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
                            ${transactions.map(tx => `
                                <tr class="hover">
                                    <td>${Utils.formatDate(tx.date)}</td>
                                    <td>${tx.description}</td>
                                    <td>
                                        <span class="badge badge-sm" style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};">
                                            ${tx.category_name || 'Uncategorized'}
                                        </span>
                                    </td>
                                    <td>${tx.account_name || '-'}</td>
                                    <td class="text-right font-medium text-error">-${Utils.formatCurrency(tx.amount)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${total > transactions.length ? `
                    <div class="text-center mt-4 text-sm text-base-content/60">
                        Showing ${transactions.length} of ${total} transactions
                    </div>
                ` : ''}
            `;
        }
        
        budgetDetailsModal.showModal();
    } catch (error) {
        console.error('Error loading budget details:', error);
        Utils.showToast('Error loading budget details', 'error');
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('budgets');
    
    // Get main content container
    const mainContent = document.getElementById('main-content');
    
    // Render page content
    mainContent.innerHTML = `
        <div class="space-y-6">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 class="text-2xl font-bold">Budgets</h2>
                    <p class="text-base-content/60">Track your spending against budgets</p>
                </div>
                <button onclick="budgetModal.showModal()" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Create Budget
                </button>
            </div>
            
            <!-- Budget Summary -->
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body">
                    <h3 class="card-title">Budget Summary</h3>
                    <div id="budgetSummary"></div>
                </div>
            </div>
            
            <!-- Active Budgets -->
            <div>
                <h3 class="text-lg font-semibold mb-4">Active Budgets</h3>
                <div id="budgetsGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <!-- Budget cards will be inserted here -->
                </div>
            </div>
        </div>
    `;
    
    // Initialize
    await initialize();
    
    // Setup form submission
    document.getElementById('budgetForm').addEventListener('submit', handleBudgetSubmit);
    
    async function initialize() {
        try {
            budgets = await API.budgets.list();
            categories = await API.categories.list();
            
            populateCategorySelection();
            renderBudgets();
            renderBudgetSummary();
            
        } catch (error) {
            console.error('Error initializing:', error);
            Utils.showToast('Error loading budgets', 'error');
        }
    }
    
    function populateCategorySelection() {
        const container = document.getElementById('categorySelection');
        const expenseCategories = categories.filter(c => c.type === 'expense');
        
        container.innerHTML = expenseCategories.map(cat => `
            <label class="flex items-center gap-2 cursor-pointer p-2 hover:bg-base-300 rounded">
                <input type="checkbox" name="categories" value="${cat.id}" class="checkbox checkbox-sm">
                <span>${cat.name}</span>
            </label>
        `).join('');
    }
    
    function renderBudgets() {
        const container = document.getElementById('budgetsGrid');
        
        if (budgets.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <p class="text-base-content/60">No budgets created yet</p>
                    <button onclick="budgetModal.showModal()" class="btn btn-primary mt-4">
                        Create your first budget
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = budgets.map(budget => `
            <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
                <div class="card-body">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="card-title">${budget.name}</h3>
                            <p class="text-sm text-base-content/60">${budget.period.charAt(0).toUpperCase() + budget.period.slice(1)} Budget</p>
                        </div>
                        <div class="dropdown dropdown-end">
                            <label tabindex="0" class="btn btn-ghost btn-sm btn-circle">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                            </label>
                            <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-32 z-50">
                                <li><a href="#" onclick="editBudget(${budget.id}); return false;">Edit</a></li>
                                <li><a href="#" onclick="deleteBudget(${budget.id}); return false;" class="text-error">Delete</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="text-xs text-base-content/50 mb-3">
                        ${Utils.formatDate(budget.start_date)} - ${Utils.formatDate(budget.end_date)}
                    </div>
                    
                    <div class="mb-4">
                        <div class="flex justify-between mb-2">
                            <span class="text-2xl font-bold">${Utils.formatCurrency(budget.spent)}</span>
                            <span class="text-base-content/60">/ ${Utils.formatCurrency(budget.amount)}</span>
                        </div>
                        <progress class="progress ${getProgressColor(budget.percentage)} w-full" 
                                  value="${budget.percentage}" max="100"></progress>
                        <div class="flex justify-between mt-2 text-sm">
                            <span class="${budget.percentage > 100 ? 'text-error' : ''}">${budget.percentage}% used</span>
                            <span class="${budget.remaining < 0 ? 'text-error' : 'text-success'}">${budget.remaining >= 0 ? '' : '-'}${Utils.formatCurrency(Math.abs(budget.remaining))} ${budget.remaining >= 0 ? 'left' : 'over'}</span>
                        </div>
                    </div>
                    
                    ${budget.percentage > 100 ? `
                        <div class="alert alert-error alert-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <span class="text-xs">Budget exceeded!</span>
                        </div>
                    ` : (budget.percentage > 90 ? `
                        <div class="alert alert-warning alert-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <span class="text-xs">Budget almost exceeded!</span>
                        </div>
                    ` : '')}
                    
                    <div class="card-actions justify-end mt-4">
                        <a href="#" onclick="viewBudgetDetails(${budget.id}); return false;" class="btn btn-sm btn-ghost">
                            View Details
                        </a>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    function renderBudgetSummary() {
        const container = document.getElementById('budgetSummary');
        const totalBudgeted = budgets.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        const totalSpent = budgets.reduce((sum, b) => sum + parseFloat(b.spent), 0);
        const totalRemaining = totalBudgeted - totalSpent;
        const avgUsage = budgets.length > 0 ? budgets.reduce((sum, b) => sum + parseFloat(b.percentage), 0) / budgets.length : 0;
        
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Total Budgeted</div>
                    <div class="stat-value text-lg">${Utils.formatCurrency(totalBudgeted)}</div>
                </div>
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Total Spent</div>
                    <div class="stat-value text-lg ${totalSpent > totalBudgeted ? 'text-error' : ''}">${Utils.formatCurrency(totalSpent)}</div>
                </div>
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Remaining</div>
                    <div class="stat-value text-lg ${totalRemaining < 0 ? 'text-error' : 'text-success'}">${totalRemaining < 0 ? '-' : ''}${Utils.formatCurrency(Math.abs(totalRemaining))}</div>
                </div>
                <div class="stat bg-base-200 rounded-box">
                    <div class="stat-title">Average Usage</div>
                    <div class="stat-value text-lg">${avgUsage.toFixed(1)}%</div>
                    <div class="stat-desc">
                        <progress class="progress ${getProgressColor(avgUsage)} w-full" value="${avgUsage}" max="100"></progress>
                    </div>
                </div>
            </div>
        `;
    }
    
    function getProgressColor(percentage) {
        if (percentage > 90) return 'progress-error';
        if (percentage > 75) return 'progress-warning';
        return 'progress-primary';
    }
    
    async function handleBudgetSubmit(e) {
        e.preventDefault();
        
        const selectedCategories = Array.from(document.querySelectorAll('input[name="categories"]:checked'))
            .map(cb => parseInt(cb.value));
        
        const data = {
            name: document.getElementById('budgetName').value,
            amount: parseFloat(document.getElementById('budgetAmount').value),
            period: document.getElementById('budgetPeriod').value,
            start_date: document.getElementById('startDate').value || undefined,
            end_date: document.getElementById('endDate').value || undefined,
            category_ids: selectedCategories
        };
        
        try {
            await API.budgets.create(data);
            Utils.showToast('Budget created successfully', 'success');
            budgetModal.close();
            e.target.reset();
            
            // Reload budgets
            budgets = await API.budgets.list();
            renderBudgets();
            renderBudgetSummary();
            
        } catch (error) {
            Utils.showToast('Error creating budget', 'error');
        }
    }
});