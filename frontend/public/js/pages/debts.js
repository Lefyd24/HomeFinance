/**
 * Debt Tracker page controller
 */

// State
let debts = [];
let editingDebtId = null;
let accounts = [];

// Map debt types to category ramp tints (1-6) for consistent coloring across cards
const DEBT_TYPE_TO_TINT = {
    credit_card: 1,
    mortgage: 2,
    car_loan: 3,
    student_loan: 4,
    personal_loan: 5,
    informal: 5,
    utilities: 3,
    subscription: 1,
    medical: 4,
    tax: 4,
    legal: 6,
    other: 6,
    custom: 6
};

const DEBT_TYPE_LABEL = {
    credit_card: 'Credit Card',
    student_loan: 'Student Loan',
    mortgage: 'Mortgage',
    car_loan: 'Car Loan',
    personal_loan: 'Personal Loan',
    informal: 'Informal',
    utilities: 'Utilities',
    subscription: 'Subscription',
    medical: 'Medical',
    tax: 'Tax',
    legal: 'Legal',
    other: 'Other',
    custom: 'Custom'
};

function maskedDebtId(debt) {
    const seed = `${debt.id}${debt.name || ''}${debt.creditor || ''}`;
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) {
        h = (h * 31 + seed.charCodeAt(i)) | 0;
    }
    const last4 = String(Math.abs(h) % 10000).padStart(4, '0');
    return `••••${last4}`;
}

function renderDebtsKpiBar(summary) {
    const total = parseFloat(summary.total_amount_due ?? summary.total_current_balance ?? 0);
    const paidOff = parseFloat(summary.total_paid_off ?? 0);
    const minMonthly = parseFloat(summary.total_minimum_payments ?? 0);
    const pct = Math.max(0, Math.min(100, parseFloat(summary.overall_progress_percentage ?? 0)));
    const projInterest = parseFloat(summary.total_projected_interest ?? 0);
    const activeCount = (summary.total_debts ?? 0) - (summary.paid_off_count ?? 0);

    const r = 28;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;

    return `
        <div class="fin-kpi-bar">
            <div class="fin-kpi-cell">
                <span class="fin-kpi-label">Total Outstanding</span>
                <span class="fin-kpi-value">${Utils.formatCurrency(total)}</span>
                <span class="fin-kpi-sub">${activeCount > 0 ? `across ${activeCount} active debt${activeCount === 1 ? '' : 's'}` : 'no active debts'}${projInterest > 0 ? ` · incl. ${Utils.formatCurrency(projInterest)} interest` : ''}</span>
            </div>
            <div class="fin-kpi-cell">
                <span class="fin-kpi-label">Paid Off</span>
                <span class="fin-kpi-value">${Utils.formatCurrency(paidOff)}</span>
                <span class="fin-kpi-sub">lifetime</span>
            </div>
            <div class="fin-kpi-cell">
                <span class="fin-kpi-label">Overall Progress</span>
                <div style="display:flex;align-items:center;gap:0.875rem;">
                    <svg width="64" height="64" viewBox="0 0 64 64" style="flex-shrink:0;">
                        <circle cx="32" cy="32" r="${r}" fill="none"
                                stroke="color-mix(in oklch, var(--color-base-content) 8%, transparent)"
                                stroke-width="6"></circle>
                        <circle cx="32" cy="32" r="${r}" fill="none"
                                stroke="var(--color-primary)" stroke-width="6"
                                stroke-linecap="round"
                                stroke-dasharray="${c.toFixed(2)}"
                                stroke-dashoffset="${offset.toFixed(2)}"
                                transform="rotate(-90 32 32)"
                                style="transition: stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1);"></circle>
                        <text x="32" y="36" text-anchor="middle"
                              font-size="14" font-weight="600"
                              fill="var(--color-base-content)"
                              style="font-variant-numeric: tabular-nums; letter-spacing:-0.02em;">${pct.toFixed(0)}%</text>
                    </svg>
                    <div class="fin-kpi-sub">across<br>all debts</div>
                </div>
            </div>
            <div class="fin-kpi-cell">
                <span class="fin-kpi-label">Min. Monthly</span>
                <span class="fin-kpi-value">${Utils.formatCurrency(minMonthly)}</span>
                <span class="fin-kpi-sub">due each month</span>
            </div>
        </div>
    `;
}

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
                
                <!-- KPI Bar -->
                ${renderDebtsKpiBar(summary)}

                <!-- Active Debts -->
                <section id="debts-active-section">
                    <div class="fin-section-header">
                        <h2 class="fin-section-title">Active Debts</h2>
                        <span class="fin-section-count" id="debts-active-count">0</span>
                    </div>
                    <div id="debts-active" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5"></div>
                </section>

                <!-- Paid Off Debts (collapsible) -->
                <section id="debts-paid-section" class="hidden">
                    <details class="group">
                        <summary class="fin-section-header cursor-pointer list-none flex items-center gap-2 select-none">
                            <h2 class="fin-section-title">Paid Off</h2>
                            <span class="fin-section-count" id="debts-paid-count">0</span>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-auto transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                        </summary>
                        <div id="debts-paid" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 mt-2"></div>
                    </details>
                </section>
                
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
    const activeContainer = document.getElementById('debts-active');
    const paidContainer = document.getElementById('debts-paid');
    const activeSection = document.getElementById('debts-active-section');
    const paidSection = document.getElementById('debts-paid-section');
    const emptyState = document.getElementById('empty-state');
    const activeCountEl = document.getElementById('debts-active-count');
    const paidCountEl = document.getElementById('debts-paid-count');

    if (!activeContainer || !paidContainer) return;

    if (debts.length === 0) {
        activeContainer.innerHTML = '';
        paidContainer.innerHTML = '';
        activeSection?.classList.add('hidden');
        paidSection?.classList.add('hidden');
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    const active = debts
        .filter(d => !d.is_paid_off)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const paid = debts
        .filter(d => d.is_paid_off)
        .sort((a, b) => {
            const da = a.paid_off_date ? new Date(a.paid_off_date) : 0;
            const db = b.paid_off_date ? new Date(b.paid_off_date) : 0;
            return db - da;
        });

    if (activeCountEl) activeCountEl.textContent = active.length;
    if (paidCountEl) paidCountEl.textContent = paid.length;

    if (active.length > 0) {
        activeSection?.classList.remove('hidden');
        activeContainer.innerHTML = active.map(d => renderDebtCard(d)).join('');
    } else {
        activeSection?.classList.add('hidden');
        activeContainer.innerHTML = '';
    }

    if (paid.length > 0) {
        paidSection?.classList.remove('hidden');
        paidContainer.innerHTML = paid.map(d => renderDebtCard(d)).join('');
    } else {
        paidSection?.classList.add('hidden');
        paidContainer.innerHTML = '';
    }
}

function renderDebtCard(debt) {
    const isPaidOff = !!debt.is_paid_off;
    const hasInterest = debt.interest_rate && debt.interest_rate > 0;
    const original = parseFloat(debt.original_balance || 0);
    const current  = parseFloat(debt.current_balance || 0);
    const progress = original > 0 ? Math.max(0, Math.min(100, ((original - current) / original) * 100)) : (isPaidOff ? 100 : 0);
    const isNonRecurring = !debt.recurrence_unit;
    const tintIdx = DEBT_TYPE_TO_TINT[debt.type] || 6;
    const typeLabel = debt.type === 'custom' ? (debt.custom_type || 'Custom') : (DEBT_TYPE_LABEL[debt.type] || (debt.type || 'Other'));
    const acctId = maskedDebtId(debt);

    const balanceLabel = hasInterest ? 'AMOUNT DUE' : 'CURRENT BALANCE';
    const balanceValue = hasInterest && debt.total_amount_due ? debt.total_amount_due : current;

    const footnoteParts = [];
    if (!isPaidOff && !isNonRecurring && debt.next_payment_date) {
        footnoteParts.push(`Next: ${Utils.formatDate(debt.next_payment_date)}`);
    }
    if (!isPaidOff && !isNonRecurring && debt.months_to_payoff) {
        footnoteParts.push(`${debt.months_to_payoff} mo to payoff`);
    }
    if (isPaidOff && debt.paid_off_date) {
        footnoteParts.push(`Cleared · ${Utils.formatDate(debt.paid_off_date)}`);
    }
    if (isNonRecurring && !isPaidOff && debt.next_payment_date) {
        footnoteParts.push(`One-time · ${Utils.formatDate(debt.next_payment_date)}`);
    }

    const metaItems = [];
    if (hasInterest) metaItems.push(`<span class="fin-numeric">${(debt.interest_rate * 100).toFixed(2)}% APR</span>`);
    if (!isNonRecurring && debt.minimum_payment) metaItems.push(`<span class="fin-numeric">${Utils.formatCurrency(debt.minimum_payment)}/mo</span>`);

    const paidAmount = Math.max(0, original - current);

    return `
        <div class="fin-card fin-tint-${tintIdx} ${isPaidOff ? 'fin-card-paid' : ''}" style="max-width: 640px; width: 100%;">
            <div class="fin-card-band fin-card-band-debt">
                <span class="fin-type">${typeLabel}</span>
                <span class="fin-chip-soft">
                    ${isPaidOff
                        ? '✓ Paid off'
                        : (debt.priority > 0 ? `Priority · P${debt.priority}` : '&nbsp;')}
                </span>
            </div>
            <div class="fin-card-body">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="fin-creditor">${debt.creditor || debt.name}</div>
                        ${debt.creditor ? `<div class="text-sm font-medium">${debt.name}</div>` : ''}
                    </div>
                    <div class="fin-acct-id">${acctId}</div>
                </div>
                <div>
                    <div class="text-[0.625rem] font-semibold tracking-wider text-base-content/55 mt-1">${balanceLabel}</div>
                    <div class="fin-hero-balance">${Utils.formatCurrency(balanceValue)}</div>
                    ${original > 0 && !isPaidOff ? `<div class="fin-hero-sub">of ${Utils.formatCurrency(original)} original</div>` : ''}
                </div>
                ${original > 0 ? `
                    <div class="grid grid-cols-2 gap-3" style="padding: 0.5rem 0; border-top: 1px solid color-mix(in oklch, var(--color-base-content) 6%, transparent);">
                        <div>
                            <div class="text-[0.625rem] font-semibold tracking-wider text-base-content/55">PAID</div>
                            <div class="fin-numeric font-semibold" style="color: oklch(60% 0.13 165);">${Utils.formatCurrency(paidAmount)}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[0.625rem] font-semibold tracking-wider text-base-content/55">REMAINING</div>
                            <div class="fin-numeric font-semibold">${Utils.formatCurrency(current)}</div>
                        </div>
                    </div>
                ` : ''}
                ${!isPaidOff ? `
                    <div>
                        <div class="fin-track">
                            <div class="fin-track-fill" style="width:${progress}%; background: var(--cat-${tintIdx});"></div>
                        </div>
                        <div class="flex items-center justify-between mt-1.5 gap-2">
                            <span class="text-xs text-base-content/60 fin-numeric">${progress.toFixed(0)}% paid</span>
                            <span class="text-xs text-base-content/60 flex items-center gap-2">${metaItems.join('<span class="opacity-40">·</span>')}</span>
                        </div>
                    </div>
                ` : ''}
                ${footnoteParts.length ? `
                    <div class="text-xs text-base-content/55 mt-1">${footnoteParts.join(' · ')}</div>
                ` : ''}
            </div>
            <div class="fin-card-footer">
                ${!isPaidOff ? `
                    <button onclick="showPaymentModal(${debt.id})" class="btn btn-sm btn-primary">Add Payment</button>
                ` : ''}
                <button onclick="showDebtDetails(${debt.id})" class="btn btn-sm btn-ghost">Details</button>
                <div class="ml-auto dropdown dropdown-end">
                    <button tabindex="0" class="btn btn-ghost btn-sm btn-square" aria-label="More actions">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                    </button>
                    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-200 z-10 w-44 p-1">
                        <li><a onclick="editDebt(${debt.id})">Edit</a></li>
                        <li><a class="text-error" onclick="deleteDebt(${debt.id})">Delete</a></li>
                    </ul>
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
