/**
 * Budgets page controller
 */

// State (global for this module)
let budgets = [];
let categories = [];
let editingBudgetId = null;

// Global functions for onclick handlers
window.editBudget = async (id) => {
    const budget = budgets.find(b => b.id === id);
    if (!budget) {
        Utils.showToast('Budget not found', 'error');
        return;
    }
    
    editingBudgetId = id;
    
    document.getElementById('budgetName').value = budget.name;
    document.getElementById('budgetAmount').value = budget.amount;
    document.getElementById('budgetPeriod').value = budget.period;
    document.getElementById('startDate').value = budget.start_date ? budget.start_date.split('T')[0] : '';
    document.getElementById('endDate').value = budget.end_date ? budget.end_date.split('T')[0] : '';
    
    const categoryCheckboxes = document.querySelectorAll('input[name="categories"]');
    categoryCheckboxes.forEach(cb => {
        cb.checked = budget.category_ids && budget.category_ids.includes(parseInt(cb.value));
    });
    
    document.getElementById('budgetModalTitle').textContent = 'Edit Budget';
    document.getElementById('budgetSubmitButtonText').textContent = 'Update Budget';
    
    budgetModal.showModal();
};

window.resetBudgetModal = () => {
    editingBudgetId = null;
    document.getElementById('budgetForm').reset();
    document.getElementById('budgetModalTitle').textContent = 'Create Budget';
    document.getElementById('budgetSubmitButtonText').textContent = 'Create Budget';
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

window.viewBudgetDetails = async (id, year = null) => {
    try {
        const summary = await API.budgets.getSummary(id, year);
        const { budget, periods, year_total } = summary;
        const displayYear = summary.year;

        document.getElementById('budgetDetailsTitle').textContent = budget.name;

        // Determine which period is "current" so we can auto-expand it
        const today = new Date().toISOString().split('T')[0];
        const currentPeriodIdx = periods.findIndex(
            p => today >= p.period_start && today <= p.period_end
        );

        // Year navigation + overall summary
        const periodLabel = budget.period === 'monthly' ? '/month' : budget.period === 'yearly' ? '/year' : '';
        const yearProgressColor = year_total.percentage > 90 ? 'progress-error' : year_total.percentage > 75 ? 'progress-warning' : 'progress-primary';
        const infoContainer = document.getElementById('budgetDetailsInfo');
        infoContainer.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <button onclick="viewBudgetDetails(${budget.id}, ${displayYear - 1})" class="btn btn-sm btn-ghost gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                    <span class="hidden sm:inline">${displayYear - 1}</span>
                </button>
                <span class="text-lg sm:text-xl font-bold">${displayYear}</span>
                <button onclick="viewBudgetDetails(${budget.id}, ${displayYear + 1})" class="btn btn-sm btn-ghost gap-1">
                    <span class="hidden sm:inline">${displayYear + 1}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div class="bg-base-200 rounded-xl p-2.5">
                    <div class="text-xs text-base-content/60 mb-0.5">Budget ${periodLabel}</div>
                    <div class="font-bold text-sm sm:text-base">${Utils.formatCurrency(budget.amount)}</div>
                </div>
                <div class="bg-base-200 rounded-xl p-2.5">
                    <div class="text-xs text-base-content/60 mb-0.5">Year Budget</div>
                    <div class="font-bold text-sm sm:text-base">${Utils.formatCurrency(year_total.budget_amount)}</div>
                </div>
                <div class="bg-base-200 rounded-xl p-2.5">
                    <div class="text-xs text-base-content/60 mb-0.5">Year Spent</div>
                    <div class="font-bold text-sm sm:text-base text-error">${Utils.formatCurrency(year_total.spent)}</div>
                </div>
                <div class="bg-base-200 rounded-xl p-2.5">
                    <div class="text-xs text-base-content/60 mb-0.5">Year Remaining</div>
                    <div class="font-bold text-sm sm:text-base ${year_total.remaining < 0 ? 'text-error' : 'text-success'}">${year_total.remaining < 0 ? '-' : ''}${Utils.formatCurrency(Math.abs(year_total.remaining))}</div>
                </div>
            </div>
            <div class="w-full mb-1">
                <div class="flex justify-between text-xs text-base-content/60 mb-1">
                    <span>Year usage</span>
                    <span>${year_total.percentage}%</span>
                </div>
                <progress class="progress ${yearProgressColor} w-full" value="${year_total.percentage}" max="100"></progress>
            </div>
        `;

        // Period breakdown (collapsible accordions)
        const tableContainer = document.getElementById('budgetTransactionsTable');

        if (periods.length === 0) {
            tableContainer.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-base-content/60">No data for this year</p>
                </div>
            `;
        } else {
            tableContainer.innerHTML = `
                <div class="space-y-2">
                    ${periods.map((period, idx) => {
                        const isCurrent = idx === currentPeriodIdx;
                        const progressColor = period.percentage > 90 ? 'progress-error' : period.percentage > 75 ? 'progress-warning' : 'progress-primary';
                        const statusBadge = period.percentage > 100
                            ? '<span class="badge badge-error badge-xs">Over</span>'
                            : period.percentage > 90
                            ? '<span class="badge badge-warning badge-xs">Almost</span>'
                            : period.spent === 0
                            ? '<span class="badge badge-ghost badge-xs">No spending</span>'
                            : '';

                        return `
                            <div class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-lg ${isCurrent ? 'border-primary' : ''}">
                                <input type="checkbox" ${isCurrent ? 'checked' : ''} />
                                <div class="collapse-title py-3 pr-10 pl-3 sm:pl-4">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="flex items-center gap-1.5 min-w-0">
                                            <span class="font-semibold text-sm sm:text-base truncate">${period.label}</span>
                                            ${isCurrent ? '<span class="badge badge-primary badge-xs shrink-0">Current</span>' : ''}
                                            ${statusBadge ? `<span class="shrink-0">${statusBadge}</span>` : ''}
                                        </div>
                                        <div class="flex items-center gap-1.5 text-xs sm:text-sm shrink-0">
                                            <span class="font-semibold ${period.spent > period.budget_amount ? 'text-error' : ''}">${Utils.formatCurrency(period.spent)}</span>
                                            <span class="text-base-content/40">/</span>
                                            <span class="text-base-content/50">${Utils.formatCurrency(period.budget_amount)}</span>
                                        </div>
                                    </div>
                                    <progress class="progress ${progressColor} w-full mt-1.5 h-1" value="${Math.min(period.percentage, 100)}" max="100"></progress>
                                </div>
                                <div class="collapse-content px-2 sm:px-4">
                                    ${period.transactions.length === 0
                                        ? '<p class="text-sm text-base-content/50 py-2">No transactions in this period</p>'
                                        : `
                                            <div class="overflow-x-auto -mx-2 sm:mx-0">
                                                <table class="table table-xs w-full">
                                                    <thead>
                                                        <tr>
                                                            <th class="whitespace-nowrap">Date</th>
                                                            <th>Description</th>
                                                            <th class="hidden sm:table-cell">Category</th>
                                                            <th class="hidden md:table-cell">Account</th>
                                                            <th class="text-right whitespace-nowrap">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${period.transactions.map(tx => `
                                                            <tr class="hover">
                                                                <td class="whitespace-nowrap text-xs">${Utils.formatDate(tx.date)}</td>
                                                                <td class="max-w-[120px] sm:max-w-none">
                                                                    <div class="truncate">${tx.description}</div>
                                                                    <div class="sm:hidden mt-0.5">
                                                                        <span class="badge badge-xs" style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};">
                                                                            ${tx.category_name || 'Uncategorized'}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td class="hidden sm:table-cell">
                                                                    <span class="badge badge-xs" style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};">
                                                                        ${tx.category_name || 'Uncategorized'}
                                                                    </span>
                                                                </td>
                                                                <td class="hidden md:table-cell text-xs">${tx.account_name || '-'}</td>
                                                                <td class="text-right font-medium text-error whitespace-nowrap">-${Utils.formatCurrency(tx.amount)}</td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr class="font-semibold text-xs">
                                                            <td colspan="2" class="sm:hidden">Total (${period.transactions.length})</td>
                                                            <td colspan="3" class="hidden sm:table-cell">Total (${period.transactions.length} transaction${period.transactions.length !== 1 ? 's' : ''})</td>
                                                            <td class="hidden md:table-cell"></td>
                                                            <td class="text-right text-error">-${Utils.formatCurrency(period.spent)}</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                            <div class="flex justify-between items-center mt-2 pt-2 border-t border-base-200 text-xs">
                                                <span class="text-base-content/60">${Math.round(period.percentage)}% of budget used</span>
                                                <span class="font-medium ${period.remaining < 0 ? 'text-error' : 'text-success'}">${period.remaining < 0 ? '-' : ''}${Utils.formatCurrency(Math.abs(period.remaining))} ${period.remaining < 0 ? 'over' : 'left'}</span>
                                            </div>
                                        `
                                    }
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
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
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p class="text-sm text-base-content/60">Set spending limits for categories and periods. Monitor how much you've used and what's left before the budget resets.</p>
                <button onclick="resetBudgetModal(); budgetModal.showModal()" class="btn btn-primary shrink-0">
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
        
        container.innerHTML = budgets.map(budget => {
            const tint = budget.percentage > 100 ? 'oklch(62% 0.18 25)' : budget.percentage > 90 ? 'oklch(70% 0.15 70)' : 'var(--color-primary)';
            const trackFillClass = budget.percentage > 100 ? 'fin-track-fill-over' : '';
            const dateRange = budget.period_start || budget.period_end
                ? `${Utils.formatDate(budget.period_start)} - ${Utils.formatDate(budget.period_end)}`
                : `${Utils.formatDate(budget.start_date)} - ${Utils.formatDate(budget.end_date)}`;

            return `
            <div class="fin-card" style="--tint: ${tint};">
                <div class="fin-card-band">
                    <div class="min-w-0">
                        <h3 class="font-semibold text-sm sm:text-base truncate">${budget.name}</h3>
                        <p class="fin-hero-sub mt-0.5">${budget.period.charAt(0).toUpperCase() + budget.period.slice(1)} budget · ${dateRange}</p>
                    </div>
                    <div class="dropdown dropdown-end shrink-0">
                        <button tabindex="0" class="btn btn-ghost btn-sm btn-circle" aria-label="Budget actions">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                        </button>
                        <ul tabindex="0" class="dropdown-content menu menu-sm p-2 shadow-xl bg-base-100 rounded-box w-36 z-50 border border-base-300">
                            <li><a href="#" onclick="editBudget(${budget.id}); return false;">Edit</a></li>
                            <li><a href="#" onclick="deleteBudget(${budget.id}); return false;" class="text-error">Delete</a></li>
                        </ul>
                    </div>
                </div>

                <div class="fin-card-body">
                    <div class="flex items-baseline justify-between gap-2">
                        <span class="fin-hero-balance">${Utils.formatCurrency(budget.spent)}</span>
                        <span class="fin-hero-sub shrink-0">/ ${Utils.formatCurrency(budget.amount)}</span>
                    </div>

                    <div class="fin-track">
                        <div class="fin-track-fill ${trackFillClass}" style="width: ${Math.min(budget.percentage, 100)}%"></div>
                    </div>

                    <div class="flex justify-between items-center text-sm">
                        <span class="${budget.percentage > 100 ? 'text-error font-medium' : 'text-base-content/60'}">${budget.percentage}% used</span>
                        <span class="font-medium ${budget.remaining < 0 ? 'text-error' : 'text-success'}">${budget.remaining >= 0 ? '' : '-'}${Utils.formatCurrency(Math.abs(budget.remaining))} ${budget.remaining >= 0 ? 'left' : 'over'}</span>
                    </div>

                    ${budget.percentage > 100 ? `
                        <div class="alert alert-error alert-sm py-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <span class="text-xs">Budget exceeded!</span>
                        </div>
                    ` : (budget.percentage > 90 ? `
                        <div class="alert alert-warning alert-sm py-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <span class="text-xs">Budget almost exceeded!</span>
                        </div>
                    ` : '')}
                </div>

                <div class="fin-card-footer justify-end">
                    <a href="#" onclick="viewBudgetDetails(${budget.id}); return false;" class="btn btn-sm btn-ghost">
                        View Details
                    </a>
                </div>
            </div>
        `;
        }).join('');
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
            if (editingBudgetId) {
                await API.budgets.update(editingBudgetId, data);
                Utils.showToast('Budget updated successfully', 'success');
            } else {
                await API.budgets.create(data);
                Utils.showToast('Budget created successfully', 'success');
            }
            
            budgetModal.close();
            resetBudgetModal();
            
            // Reload budgets
            budgets = await API.budgets.list();
            renderBudgets();
            renderBudgetSummary();
            
        } catch (error) {
            Utils.showToast(editingBudgetId ? 'Error updating budget' : 'Error creating budget', 'error');
        }
    }

});