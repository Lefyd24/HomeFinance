/**
 * Debt Tracker page controller
 */

// State
let debts = [];
let editingDebtId = null;
let accounts = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('debts');
    
    // Load accounts for dropdowns
    await loadAccounts();
    
    // Load debts data
    await loadDebts();
    
    // Setup event listeners
    setupEventListeners();
});

async function loadAccounts() {
    try {
        accounts = await API.accounts.list();
        populateAccountSelects();
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

function populateAccountSelects() {
    const debtAccountSelect = document.getElementById('debtLinkedAccount');
    const paymentAccountSelect = document.getElementById('paymentAccount');
    
    const options = accounts.map(acc => 
        `<option value="${acc.id}">${acc.name} (${acc.type})</option>`
    ).join('');
    
    if (debtAccountSelect) {
        debtAccountSelect.innerHTML = '<option value="">Select account...</option>' + options;
    }
    
    if (paymentAccountSelect) {
        paymentAccountSelect.innerHTML = '<option value="">Select account (creates transaction)...</option>' + options;
    }
}

window.togglePaidOffDate = () => {
    const checked = document.getElementById('debtIsPaidOff').checked;
    document.getElementById('paidOffDateContainer').classList.toggle('hidden', !checked);
    if (checked && !document.getElementById('debtPaidOffDate').value) {
        document.getElementById('debtPaidOffDate').value = new Date().toISOString().split('T')[0];
    }
};

window.toggleCustomType = () => {
    const val = document.getElementById('debtType').value;
    document.getElementById('customTypeContainer').classList.toggle('hidden', val !== 'custom');
};

// Global functions for onclick handlers
window.showCreateDebtModal = () => {
    editingDebtId = null;
    document.getElementById('debtForm').reset();
    document.getElementById('customTypeContainer').classList.add('hidden');
    document.getElementById('paidOffDateContainer').classList.add('hidden');
    document.getElementById('modalTitle').textContent = 'Add Debt';
    document.getElementById('debtModal').showModal();
};

window.editDebt = async (id) => {
    const debt = debts.find(d => d.id === id);
    if (!debt) {
        Utils.showToast('Debt not found', 'error');
        return;
    }
    
    editingDebtId = id;
    
    // Populate form
    document.getElementById('debtName').value = debt.name;
    document.getElementById('debtCreditor').value = debt.creditor || '';
    document.getElementById('debtType').value = debt.type;
    document.getElementById('debtPriority').value = debt.priority || 0;
    document.getElementById('debtOriginalBalance').value = debt.original_balance;
    document.getElementById('debtCurrentBalance').value = debt.current_balance;
    document.getElementById('debtInterestRate').value = debt.interest_rate ? (debt.interest_rate * 100).toFixed(2) : '';
    document.getElementById('debtMinimumPayment').value = debt.minimum_payment || '';
    document.getElementById('debtOpenedDate').value = debt.opened_date || '';
    document.getElementById('debtMaturityDate').value = debt.maturity_date || '';
    document.getElementById('debtNotes').value = debt.notes || '';

    // Custom type
    const customTypeContainer = document.getElementById('customTypeContainer');
    if (debt.type === 'custom') {
        customTypeContainer.classList.remove('hidden');
        document.getElementById('debtCustomType').value = debt.custom_type || '';
    } else {
        customTypeContainer.classList.add('hidden');
        document.getElementById('debtCustomType').value = '';
    }

    // Paid off status
    const isPaidOff = debt.is_paid_off || false;
    document.getElementById('debtIsPaidOff').checked = isPaidOff;
    document.getElementById('paidOffDateContainer').classList.toggle('hidden', !isPaidOff);
    document.getElementById('debtPaidOffDate').value = debt.paid_off_date || '';

    // Populate recurrence fields
    document.getElementById('debtRecurrenceInterval').value = debt.recurrence_interval || 1;
    document.getElementById('debtRecurrenceUnit').value = debt.recurrence_unit || '';
    document.getElementById('debtRecurrenceDay').value = debt.recurrence_day_of_month || '';
    document.getElementById('debtLinkedAccount').value = debt.linked_account_id || '';
    document.getElementById('debtNextPaymentDate').value = debt.next_payment_date || '';

    document.getElementById('modalTitle').textContent = 'Edit Debt';
    document.getElementById('debtModal').showModal();
};

window.showPaymentModal = (debtId) => {
    document.getElementById('paymentForm').reset();
    document.getElementById('paymentDebtId').value = debtId;
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentModal').showModal();
};

window.showDebtDetails = async (debtId) => {
    try {
        const [debt, payments] = await Promise.all([
            API.debts.get(debtId),
            API.debts.getPayments(debtId)
        ]);
        
        document.getElementById('debtDetailsTitle').textContent = debt.name;
        document.getElementById('debtDetailsContent').innerHTML = renderDebtDetails(debt, payments);
        document.getElementById('debtDetailsModal').showModal();
    } catch (error) {
        console.error('Error loading debt details:', error);
        Utils.showToast('Error loading debt details', 'error');
    }
};

window.deleteDebt = async (id) => {
    const debt = debts.find(d => d.id === id);
    const debtName = debt ? debt.name : 'this debt';
    
    if (!confirm(`Are you sure you want to delete "${debtName}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        await API.debts.delete(id);
        Utils.showToast('Debt deleted successfully', 'success');
        debts = debts.filter(d => d.id !== id);
        renderDebts();
        renderSummary();
    } catch (error) {
        console.error('Error deleting debt:', error);
        Utils.showToast('Error deleting debt', 'error');
    }
};

window.showPayoffStrategies = async () => {
    try {
        const comparison = await API.debts.compareStrategies();
        document.getElementById('strategyContent').innerHTML = renderStrategyComparison(comparison);
        document.getElementById('strategyModal').showModal();
    } catch (error) {
        console.error('Error loading payoff strategies:', error);
        Utils.showToast('Error loading payoff strategies', 'error');
    }
};

async function loadDebts() {
    try {
        console.log('Fetching debts...');
        const [debtsData, summary] = await Promise.all([
            API.debts.list(),
            API.debts.getSummary()
        ]);
        debts = debtsData;
        console.log('Debts fetched:', debts);
        console.log('Summary fetched:', summary);
        
        // Render main content structure
        const mainContent = document.getElementById('main-content');
        mainContent.innerHTML = `
            <div class="space-y-6">
                <!-- Action Buttons -->
                <div class="flex flex-wrap gap-3">
                    <button onclick="showCreateDebtModal()" class="btn btn-error">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Debt
                    </button>
                    <button onclick="showPayoffStrategies()" class="btn btn-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Payoff Strategies
                    </button>
                </div>
                
                <!-- Summary Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="debts-summary">
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-error/10 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60">Total Debts</p>
                                    <p class="text-2xl font-bold">${summary.total_debts}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-warning/10 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60">Total Amount Due</p>
                                    <p class="text-2xl font-bold">${Utils.formatCurrency(summary.total_amount_due || summary.total_current_balance)}</p>
                                    ${summary.total_projected_interest > 0 ? `<p class="text-xs text-warning">incl. ${Utils.formatCurrency(summary.total_projected_interest)} interest</p>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-success/10 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60">Paid Off</p>
                                    <p class="text-2xl font-bold">${Utils.formatCurrency(summary.total_paid_off)}</p>
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
                                    <p class="text-sm text-base-content/60">Progress</p>
                                    <p class="text-2xl font-bold">${summary.overall_progress_percentage.toFixed(1)}%</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Minimum Payment Alert -->
                ${summary.total_minimum_payments > 0 ? `
                    <div class="alert alert-info">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <h3 class="font-bold">Monthly Minimum Payments</h3>
                            <p class="text-sm">Your total minimum monthly payments across all active debts: <strong>${Utils.formatCurrency(summary.total_minimum_payments)}</strong></p>
                        </div>
                    </div>
                ` : ''}
                
                <!-- Debts Grid -->
                <div id="debts-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <!-- Debts will be rendered here -->
                </div>
                
                <!-- Empty State -->
                <div id="empty-state" class="hidden text-center py-16">
                    <h3 class="text-xl font-bold mb-2">No debts tracked yet</h3>
                    <p class="text-base-content/60 mb-6">Add your debts to start tracking your payoff progress</p>
                    <button onclick="showCreateDebtModal()" class="btn btn-error">Add First Debt</button>
                </div>
            </div>
        `;
        
        renderDebts();
    } catch (error) {
        console.error('Error loading debts:', error);
        Utils.showToast('Error loading debts', 'error');
    }
}

function renderDebts() {
    const container = document.getElementById('debts-grid');
    const emptyState = document.getElementById('empty-state');
    
    if (!container) return;
    
    if (debts.length === 0) {
        container.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }
    
    emptyState?.classList.add('hidden');
    
    // Sort: active debts first, then by priority
    const sortedDebts = [...debts].sort((a, b) => {
        if (a.is_paid_off !== b.is_paid_off) return a.is_paid_off ? 1 : -1;
        return (b.priority || 0) - (a.priority || 0);
    });
    
    container.innerHTML = sortedDebts.map(debt => renderDebtCard(debt)).join('');
}

function renderDebtCard(debt) {
    const progress = ((debt.original_balance - debt.current_balance) / debt.original_balance * 100);
    const isPaidOff = debt.is_paid_off;
    const hasInterest = debt.interest_rate && debt.interest_rate > 0;
    const displayAmount = hasInterest && debt.total_amount_due ? debt.total_amount_due : debt.current_balance;
    const interestAmount = hasInterest && debt.total_interest ? debt.total_interest : 0;
    const isNonRecurring = !debt.recurrence_unit;
    
    // Professional SVG icons for each debt type
    const typeIcons = {
        credit_card: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>`,
        student_loan: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" /></svg>`,
        mortgage: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>`,
        car_loan: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>`,
        personal_loan: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
        other: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`
    };
    
    const typeColors = {
        credit_card: 'bg-primary/10 text-primary',
        student_loan: 'bg-secondary/10 text-secondary',
        mortgage: 'bg-accent/10 text-accent',
        car_loan: 'bg-info/10 text-info',
        personal_loan: 'bg-success/10 text-success',
        informal: 'bg-warning/10 text-warning',
        utilities: 'bg-orange-100 text-orange-600',
        subscription: 'bg-purple-100 text-purple-600',
        medical: 'bg-red-100 text-red-600',
        tax: 'bg-yellow-100 text-yellow-700',
        legal: 'bg-slate-100 text-slate-600',
        other: 'bg-base-300 text-base-content',
        custom: 'bg-base-300 text-base-content'
    };

    const typeLabels = {
        credit_card: 'Credit Card',
        student_loan: 'Student Loan',
        mortgage: 'Mortgage',
        car_loan: 'Car Loan',
        personal_loan: 'Personal Loan',
        informal: 'Personal / Informal',
        utilities: 'Utilities',
        subscription: 'Subscription',
        medical: 'Medical',
        tax: 'Tax',
        legal: 'Legal',
        other: 'Other',
        custom: debt.custom_type || 'Custom'
    };
    
    return `
        <div class="card bg-base-100 shadow-md hover:shadow-xl transition-all duration-300 ${isPaidOff ? 'border-2 border-success' : 'border border-base-200'}">
            <div class="card-body p-5">
                <!-- Header with Icon and Badges -->
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center ${typeColors[debt.type] || typeColors.other}">
                            ${typeIcons[debt.type] || typeIcons.other}
                        </div>
                        <div class="min-w-0">
                            <h3 class="font-bold text-lg leading-tight truncate" title="${debt.name}">${debt.name}</h3>
                            <p class="text-xs text-base-content/60 flex items-center gap-1">
                                <span class="inline-block w-2 h-2 rounded-full ${typeColors[debt.type] ? typeColors[debt.type].split(' ')[0].replace('/10', '') : 'bg-base-300'}"></span>
                                ${typeLabels[debt.type] || debt.type}
                                <!-- Creditor -->
                                ${debt.creditor ? ` - <b>${debt.creditor}</b>` : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${isPaidOff ? '<span class="badge badge-success badge-sm"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Paid Off</span>' : ''}
                        ${debt.priority > 0 ? `<span class="badge badge-primary badge-sm">Priority ${debt.priority}</span>` : ''}
                    </div>
                </div>
                
                <!-- Balance Section -->
                <div class="bg-base-200/50 rounded-xl p-4 mb-4">
                    <div class="flex justify-between items-end mb-2">
                        <div>
                            <p class="text-xs text-base-content/60 uppercase tracking-wider">${hasInterest ? 'Amount Due (incl. Interest)' : 'Current Balance'}</p>
                            <p class="text-2xl font-bold ${displayAmount > 0 ? 'text-error' : 'text-success'}">${Utils.formatCurrency(displayAmount)}</p>
                            ${hasInterest && interestAmount > 0 ? `<p class="text-xs text-warning">includes ${Utils.formatCurrency(interestAmount)} interest</p>` : ''}
                        </div>
                        <div class="text-right">
                            <p class="text-xs text-base-content/60">Principal</p>
                            <p class="text-sm font-medium text-base-content/70">${Utils.formatCurrency(debt.current_balance)}</p>
                            <p class="text-xs text-base-content/50">of ${Utils.formatCurrency(debt.original_balance)}</p>
                        </div>
                    </div>
                    
                    <!-- Progress Bar -->
                    <div class="relative pt-1">
                        <div class="flex mb-1 items-center justify-between">
                            <span class="text-xs font-semibold inline-block text-base-content/60">
                                ${progress.toFixed(1)}% paid
                            </span>
                            <span class="text-xs font-semibold inline-block text-success">
                                ${Utils.formatCurrency(debt.original_balance - debt.current_balance)} ↓
                            </span>
                        </div>
                        <div class="overflow-hidden h-2 mb-1 text-xs flex rounded bg-base-300">
                            <div style="width: ${progress}%" class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${progress >= 100 ? 'bg-success' : progress >= 75 ? 'bg-info' : progress >= 50 ? 'bg-warning' : 'bg-error'} transition-all duration-500"></div>
                        </div>
                    </div>
                </div>
                
                ${isNonRecurring && debt.next_payment_date ? `
                <!-- One-Time Payment Info -->
                <div class="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <div>
                            <p class="text-xs text-base-content/60 uppercase tracking-wider">One-Time Payment</p>
                            <p class="font-bold text-sm">${Utils.formatCurrency(debt.minimum_payment || debt.current_balance)}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xs text-base-content/60">Payment Date</p>
                        <p class="font-semibold text-sm">${Utils.formatDate(debt.next_payment_date)}</p>
                    </div>
                </div>
                ` : ''}

                <!-- Debt Details Grid -->
                <div class="grid grid-cols-2 gap-3 mb-4">
                    ${debt.interest_rate ? `
                        <div class="bg-base-100 border border-base-200 rounded-lg p-2">
                            <p class="text-xs text-base-content/50 mb-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>Interest Rate</p>
                            <p class="font-semibold text-sm">${(debt.interest_rate * 100).toFixed(2)}%</p>
                        </div>
                    ` : ''}
                    ${!isNonRecurring && debt.minimum_payment ? `
                        <div class="bg-base-100 border border-base-200 rounded-lg p-2">
                            <p class="text-xs text-base-content/50 mb-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Min. Payment</p>
                            <p class="font-semibold text-sm">${Utils.formatCurrency(debt.minimum_payment)}/mo</p>
                        </div>
                    ` : ''}
                    ${!isNonRecurring && debt.months_to_payoff ? `
                        <div class="bg-base-100 border border-base-200 rounded-lg p-2">
                            <p class="text-xs text-base-content/50 mb-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Payoff Time</p>
                            <p class="font-semibold text-sm">${debt.months_to_payoff} months</p>
                        </div>
                    ` : ''}
                    ${!isNonRecurring && debt.payoff_date ? `
                        <div class="bg-base-100 border border-base-200 rounded-lg p-2">
                            <p class="text-xs text-base-content/50 mb-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Payoff Date</p>
                            <p class="font-semibold text-sm">${Utils.formatDate(debt.payoff_date)}</p>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Action Buttons -->
                <div class="card-actions justify-end gap-2 pt-2 border-t border-base-200">
                    ${!isPaidOff ? `
                        <button onclick="showPaymentModal(${debt.id})" class="btn btn-sm btn-success gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Payment
                        </button>
                    ` : ''}
                    <div class="flex-1"></div>
                    <button onclick="showDebtDetails(${debt.id})" class="btn btn-sm btn-ghost btn-circle" title="Details">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    </button>
                    <button onclick="editDebt(${debt.id})" class="btn btn-sm btn-ghost btn-circle" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button onclick="deleteDebt(${debt.id})" class="btn btn-sm btn-ghost btn-circle text-error hover:bg-error/10" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderDebtDetails(debt, payments) {
    const progress = ((debt.original_balance - debt.current_balance) / debt.original_balance * 100);
    const hasInterest = debt.interest_rate && debt.interest_rate > 0;
    const displayAmount = hasInterest && debt.total_amount_due ? debt.total_amount_due : debt.current_balance;
    const interestAmount = hasInterest && debt.total_interest ? debt.total_interest : 0;
    const typeLabels = {
        credit_card: 'Credit Card',
        student_loan: 'Student Loan',
        mortgage: 'Mortgage',
        car_loan: 'Car Loan',
        personal_loan: 'Personal Loan',
        informal: 'Personal / Informal',
        utilities: 'Utilities',
        subscription: 'Subscription',
        medical: 'Medical',
        tax: 'Tax',
        legal: 'Legal',
        other: 'Other',
        custom: debt.custom_type || 'Custom'
    };

    return `
        <div class="space-y-6">
            <!-- Overview Section -->
            <div class="card bg-base-200">
                <div class="card-body">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-sm text-base-content/60">Type</p>
                            <p class="text-lg font-medium">${typeLabels[debt.type] || debt.type}</p>
                        </div>
                        <div>
                            <p class="text-sm text-base-content/60">Creditor</p>
                            <p class="text-lg font-medium">${debt.creditor || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-base-content/60">Amount Due (incl. Interest)</p>
                            <p class="text-lg font-medium">${Utils.formatCurrency(displayAmount)}</p>
                            ${hasInterest && interestAmount > 0 ? `<p class="text-xs text-warning">includes ${Utils.formatCurrency(interestAmount)} projected interest</p>` : ''}
                        </div>
                        <div>
                            <p class="text-sm text-base-content/60">Principal Balance</p>
                            <p class="text-lg font-medium">${Utils.formatCurrency(debt.current_balance)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-base-content/60">Amount Paid</p>
                            <p class="text-lg font-medium">${Utils.formatCurrency(debt.original_balance - debt.current_balance)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-base-content/60">Progress</p>
                            <p class="text-lg font-medium">${progress.toFixed(1)}%</p>
                        </div>
                        ${debt.interest_rate ? `
                            <div>
                                <p class="text-sm text-base-content/60">Interest Rate</p>
                                <p class="text-lg font-medium">${(debt.interest_rate * 100).toFixed(2)}%</p>
                            </div>
                        ` : ''}
                        ${debt.minimum_payment ? `
                            <div>
                                <p class="text-sm text-base-content/60">Minimum Payment</p>
                                <p class="text-lg font-medium">${Utils.formatCurrency(debt.minimum_payment)}/month</p>
                            </div>
                        ` : ''}
                        ${debt.months_to_payoff ? `
                            <div>
                                <p class="text-sm text-base-content/60">Months to Payoff</p>
                                <p class="text-lg font-medium">${debt.months_to_payoff}</p>
                            </div>
                        ` : ''}
                        ${debt.total_interest ? `
                            <div>
                                <p class="text-sm text-base-content/60">Total Interest</p>
                                <p class="text-lg font-medium">${Utils.formatCurrency(debt.total_interest)}</p>
                            </div>
                        ` : ''}
                        ${debt.payoff_date ? `
                            <div>
                                <p class="text-sm text-base-content/60">Estimated Payoff</p>
                                <p class="text-lg font-medium">${Utils.formatDate(debt.payoff_date)}</p>
                            </div>
                        ` : ''}
                        ${debt.opened_date ? `
                            <div>
                                <p class="text-sm text-base-content/60">Opened Date</p>
                                <p class="text-lg font-medium">${Utils.formatDate(debt.opened_date)}</p>
                            </div>
                        ` : ''}
                        ${debt.maturity_date ? `
                            <div>
                                <p class="text-sm text-base-content/60">Maturity Date</p>
                                <p class="text-lg font-medium">${Utils.formatDate(debt.maturity_date)}</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${debt.notes ? `
                        <div class="mt-4 pt-4 border-t border-base-300">
                            <p class="text-sm text-base-content/60">Notes</p>
                            <p class="mt-1">${debt.notes}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Payments Section -->
            <div>
                <h4 class="font-bold text-lg mb-4">Recent Payments</h4>
                ${payments.length > 0 ? `
                    <div class="space-y-2">
                        ${payments.map(payment => `
                            <div class="flex justify-between items-center p-3 bg-base-200 rounded-lg">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center bg-success/20 text-success">
                                        ↓
                                    </div>
                                    <div>
                                        <p class="font-medium">Payment</p>
                                        ${payment.notes ? `<p class="text-sm text-base-content/60">${payment.notes}</p>` : ''}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <p class="font-bold text-success">-${Utils.formatCurrency(payment.amount)}</p>
                                    <p class="text-sm text-base-content/60">${Utils.formatDate(payment.payment_date)}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <p class="text-base-content/60 text-center py-4">No payments recorded yet</p>
                `}
            </div>
        </div>
    `;
}

function renderStrategyComparison(comparison) {
    const { snowball, avalanche, recommended_strategy, savings_difference, months_difference } = comparison;
    
    return `
        <div class="space-y-6">
            <!-- Recommendation Banner -->
            <div class="alert ${recommended_strategy === 'avalanche' ? 'alert-success' : 'alert-info'}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                    <h3 class="font-bold">Recommended Strategy: ${recommended_strategy === 'avalanche' ? 'Debt Avalanche' : 'Debt Snowball'}</h3>
                    <p class="text-sm">
                        ${recommended_strategy === 'avalanche' 
                            ? `Save <strong>${Utils.formatCurrency(savings_difference)}</strong> in interest and pay off <strong>${months_difference}</strong> month(s) faster!`
                            : `Get quick wins by paying off smaller debts first while staying motivated!`
                        }
                    </p>
                </div>
            </div>
            
            <!-- Strategy Comparison Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Snowball Card -->
                <div class="card bg-base-200 ${recommended_strategy === 'snowball' ? 'border-2 border-info' : ''}">
                    <div class="card-body">
                        <h4 class="card-title text-lg flex items-center gap-2">
                            <span class="text-2xl">🌨️</span>
                            Debt Snowball
                            ${recommended_strategy === 'snowball' ? '<span class="badge badge-info">Recommended</span>' : ''}
                        </h4>
                        <p class="text-sm text-base-content/60 mb-4">Pay off smallest balances first for quick wins</p>
                        
                        <div class="space-y-2">
                            <div class="flex justify-between">
                                <span class="text-base-content/60">Total Months</span>
                                <span class="font-bold">${snowball.total_months}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-base-content/60">Total Interest</span>
                                <span class="font-bold">${Utils.formatCurrency(snowball.total_interest_paid)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-base-content/60">Total Payments</span>
                                <span class="font-bold">${Utils.formatCurrency(snowball.total_payments)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Avalanche Card -->
                <div class="card bg-base-200 ${recommended_strategy === 'avalanche' ? 'border-2 border-success' : ''}">
                    <div class="card-body">
                        <h4 class="card-title text-lg flex items-center gap-2">
                            <span class="text-2xl">🏔️</span>
                            Debt Avalanche
                            ${recommended_strategy === 'avalanche' ? '<span class="badge badge-success">Recommended</span>' : ''}
                        </h4>
                        <p class="text-sm text-base-content/60 mb-4">Pay off highest interest rates first to save money</p>
                        
                        <div class="space-y-2">
                            <div class="flex justify-between">
                                <span class="text-base-content/60">Total Months</span>
                                <span class="font-bold">${avalanche.total_months}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-base-content/60">Total Interest</span>
                                <span class="font-bold">${Utils.formatCurrency(avalanche.total_interest_paid)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-base-content/60">Total Payments</span>
                                <span class="font-bold">${Utils.formatCurrency(avalanche.total_payments)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Payoff Schedule Summary -->
            <div>
                <h4 class="font-bold text-lg mb-4">Payoff Schedule Preview</h4>
                <p class="text-sm text-base-content/60 mb-4">Showing first few months of the ${recommended_strategy} strategy</p>
                
                <div class="overflow-x-auto">
                    <table class="table table-zebra w-full">
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Debt</th>
                                <th>Payment</th>
                                <th>Remaining</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(recommended_strategy === 'snowball' ? snowball.payoff_schedule : avalanche.payoff_schedule).slice(0, 10).map(item => `
                                <tr>
                                    <td>${item.month}</td>
                                    <td>${item.debt_name}</td>
                                    <td>${Utils.formatCurrency(item.payment)}</td>
                                    <td>${Utils.formatCurrency(item.remaining_balance)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderSummary() {
    // Summary is already rendered in loadDebts, this function is for updates after delete
    loadDebts();
}

function setupEventListeners() {
    // Create/Edit debt form
    document.getElementById('debtForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const isPaidOff = document.getElementById('debtIsPaidOff').checked;
        const data = {
            name: formData.get('name'),
            creditor: formData.get('creditor') || null,
            type: formData.get('type'),
            custom_type: formData.get('type') === 'custom' ? (formData.get('custom_type') || null) : null,
            original_balance: parseFloat(formData.get('original_balance')),
            current_balance: parseFloat(formData.get('current_balance')),
            interest_rate: formData.get('interest_rate') ? parseFloat(formData.get('interest_rate')) / 100 : null,
            minimum_payment: formData.get('minimum_payment') ? parseFloat(formData.get('minimum_payment')) : null,
            opened_date: formData.get('opened_date') || null,
            maturity_date: formData.get('maturity_date') || null,
            priority: parseInt(formData.get('priority')) || 0,
            notes: formData.get('notes') || null,
            is_paid_off: isPaidOff,
            paid_off_date: isPaidOff ? (formData.get('paid_off_date') || null) : null,

            // Recurrence fields
            recurrence_interval: formData.get('recurrence_interval') ? parseInt(formData.get('recurrence_interval')) : null,
            recurrence_unit: formData.get('recurrence_unit') || null,
            recurrence_day_of_month: formData.get('recurrence_day_of_month') ? parseInt(formData.get('recurrence_day_of_month')) : null,
            linked_account_id: formData.get('linked_account_id') ? parseInt(formData.get('linked_account_id')) : null,
            next_payment_date: formData.get('next_payment_date') || null
        };
        
        try {
            if (editingDebtId) {
                await API.debts.update(editingDebtId, data);
                Utils.showToast('Debt updated successfully', 'success');
            } else {
                await API.debts.create(data);
                Utils.showToast('Debt added successfully', 'success');
            }
            
            document.getElementById('debtModal').close();
            await loadDebts();
        } catch (error) {
            console.error('Error saving debt:', error);
            Utils.showToast(error.message || 'Error saving debt', 'error');
        }
    });
    
    // Payment form
    document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const debtId = parseInt(document.getElementById('paymentDebtId').value);
        const data = {
            amount: parseFloat(document.getElementById('paymentAmount').value),
            principal_amount: document.getElementById('paymentPrincipal').value ? parseFloat(document.getElementById('paymentPrincipal').value) : null,
            interest_amount: document.getElementById('paymentInterest').value ? parseFloat(document.getElementById('paymentInterest').value) : null,
            payment_date: document.getElementById('paymentDate').value,
            notes: document.getElementById('paymentNotes').value || null,
            account_id: document.getElementById('paymentAccount').value ? parseInt(document.getElementById('paymentAccount').value) : null,
            create_transaction: document.getElementById('paymentCreateTransaction').checked
        };
        
        try {
            await API.debts.addPayment(debtId, data);
            Utils.showToast('Payment added successfully', 'success');
            document.getElementById('paymentModal').close();
            await loadDebts();
        } catch (error) {
            console.error('Error adding payment:', error);
            Utils.showToast(error.message || 'Error adding payment', 'error');
        }
    });
}
