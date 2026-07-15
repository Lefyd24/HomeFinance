// Recurring Expenses page controller

let recurringExpenses = [];
let accounts = [];
let categories = [];
let recentTransactions = [];
let editingId = null;
let notifyFieldsInitialized = false;

function setupNotifyFields() {
    if (notifyFieldsInitialized) return;
    notifyFieldsInitialized = true;

    const notesField = document.getElementById('reNotes')?.closest('.form-control');
    if (!notesField) return;

    notesField.insertAdjacentHTML('beforebegin', `
        <div class="form-control">
            <label class="label cursor-pointer justify-start gap-3">
                <input type="checkbox" id="reNotifyEnabled" name="notify_enabled" class="checkbox checkbox-sm checkbox-primary">
                <span class="label-text font-medium">Notify me before due</span>
            </label>
            <div id="reNotifyDaysContainer" class="mt-2 hidden">
                <label class="label py-1">
                    <span class="label-text font-medium text-sm">Days before</span>
                    <span class="label-text-alt">Optional</span>
                </label>
                <input type="number" id="reNotifyDaysBefore" name="notify_days_before" class="input input-bordered w-full input-sm" min="1" max="90" placeholder="Uses default if empty">
            </div>
        </div>
    `);

    document.getElementById('reNotifyEnabled').addEventListener('change', toggleReNotifyDays);
}

window.toggleReNotifyDays = () => {
    const checked = document.getElementById('reNotifyEnabled')?.checked;
    document.getElementById('reNotifyDaysContainer')?.classList.toggle('hidden', !checked);
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    Layout.render('recurring-expenses');
    await initialize();
});

async function initialize() {
    setupNotifyFields();
    try {
        [recurringExpenses, accounts, categories, recentTransactions] = await Promise.all([
            API.recurringExpenses.list(),
            API.accounts.list(),
            API.categories.list(),
            API.transactions.list({ limit: 200, per_page: 200 }),
        ]);
        populateAccountSelect();
        populateCategorySelect();
        renderPage();
        setupEventListeners();
    } catch (err) {
        console.error('Failed to initialize recurring expenses:', err);
        Utils.showToast('Failed to load data', 'error');
    }
}

function populateAccountSelect() {
    const sel = document.getElementById('reAccount');
    sel.innerHTML = '<option value="">None</option>' +
        accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

function populateCategorySelect() {
    const sel = document.getElementById('reCategory');
    const expenseCats = categories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name));
    const incomeCats = categories.filter(c => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name));
    let html = '<option value="">None</option>';
    if (expenseCats.length) {
        html += '<optgroup label="Expense">' + expenseCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('') + '</optgroup>';
    }
    if (incomeCats.length) {
        html += '<optgroup label="Income">' + incomeCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('') + '</optgroup>';
    }
    sel.innerHTML = html;
}

function renderPage() {
    const main = document.getElementById('main-content');
    if (!main) return;

    const overdue = recurringExpenses.filter(e => e.is_active && e.days_until_due < 0);
    const upcoming = recurringExpenses.filter(e => e.is_active && e.days_until_due >= 0 && e.days_until_due <= 15);
    const future = recurringExpenses.filter(e => e.is_active && e.days_until_due > 15);
    const inactive = recurringExpenses.filter(e => !e.is_active);

    main.innerHTML = `
        <div class="space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p class="text-sm text-base-content/60">Track regular bills, subscriptions, and scheduled payments. Get notified when due dates are approaching or overdue.</p>
                <button onclick="openCreateModal()" class="btn btn-primary btn-sm sm:btn-md shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                    </svg>
                    Add Recurring Expense
                </button>
            </div>

            ${overdue.length > 0 ? renderSection('Overdue', overdue) : ''}
            ${upcoming.length > 0 ? renderSection('Due within 15 days', upcoming) : ''}
            ${future.length > 0 ? renderSection('Upcoming', future) : ''}
            ${inactive.length > 0 ? renderDisabledDisclosure(inactive) : ''}
            ${recurringExpenses.length === 0 ? `
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body text-center py-16">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-base-content/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <p class="text-base-content/50 font-medium">No recurring expenses yet</p>
                        <p class="text-base-content/40 text-sm mt-1">Add bills, subscriptions, and periodic costs you want to track.</p>
                        <button onclick="openCreateModal()" class="btn btn-primary btn-sm mt-4">Add your first</button>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderSection(title, items) {
    return `
        <div>
            <h2 class="text-xs font-semibold uppercase tracking-wider text-base-content/50 mb-3 px-1">${title}</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${items.map(renderCard).join('')}
            </div>
        </div>
    `;
}

function renderDisabledDisclosure(items) {
    return `
        <div class="collapse collapse-arrow bg-base-100 border border-base-200 rounded-box">
            <input type="checkbox" />
            <div class="collapse-title text-xs font-semibold uppercase tracking-wider text-base-content/50">
                Disabled recurring expenses (${items.length})
            </div>
            <div class="collapse-content">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                    ${items.map(renderCard).join('')}
                </div>
            </div>
        </div>
    `;
}

function tintForId(id) {
    return ((parseInt(id, 10) || 0) % 6) + 1;
}

function recurringStatusInfo(expense) {
    if (!expense.is_active) {
        return { cls: 'fin-status-future', text: 'Inactive' };
    }
    if (expense.is_overdue) {
        return { cls: 'fin-status-overdue', text: `Overdue · ${Math.abs(expense.days_until_due)}d` };
    }
    if (expense.days_until_due === 0) {
        return { cls: 'fin-status-soon', text: 'Due today' };
    }
    if (expense.days_until_due <= 7) {
        return { cls: 'fin-status-soon', text: `Due in ${expense.days_until_due}d` };
    }
    return { cls: 'fin-status-future', text: `In ${expense.days_until_due}d` };
}

function renderCard(expense) {
    const cat = categories.find(c => c.id === expense.category_id);
    const acc = accounts.find(a => a.id === expense.account_id);
    const tintIdx = tintForId(expense.category_id || expense.id);
    const status = recurringStatusInfo(expense);

    const unit = expense.recurrence_unit || 'months';
    const interval = expense.recurrence_interval || 1;
    const cadenceLabel = interval === 1
        ? ({ days: 'Daily', weeks: 'Weekly', months: 'Monthly' }[unit] || `Every ${unit}`)
        : `Every ${interval} ${unit}`;

    const metaBits = [];
    if (cat) metaBits.push(cat.name);
    if (acc) metaBits.push(acc.name);
    metaBits.push(`Next ${Utils.formatDate(expense.next_due_date)}`);

    return `
        <div class="fin-card fin-tint-${tintIdx} ${expense.is_active ? '' : 'fin-card-paid'}" style="max-width: 560px; width: 100%;">
            <div class="fin-card-band">
                <span class="fin-chip">${cadenceLabel}</span>
                <span class="fin-status ${status.cls}">${status.text}</span>
            </div>
            <div class="fin-card-body">
                <div class="flex items-baseline justify-between gap-3">
                    <div class="min-w-0">
                        <h3 class="font-semibold text-base leading-tight truncate" title="${expense.name}">${expense.name}</h3>
                        <p class="text-xs text-base-content/55 truncate mt-0.5">${metaBits.join(' · ')}</p>
                    </div>
                    <div class="fin-hero-balance shrink-0" style="font-size: 1.5rem;">${Utils.formatCurrency(expense.amount)}</div>
                </div>
                ${expense.notes ? `<p class="text-xs text-base-content/55 line-clamp-2">${expense.notes}</p>` : ''}
            </div>
            <div class="fin-card-footer">
                <button onclick="viewRecurringDetails(${expense.id})" class="btn btn-sm btn-ghost text-primary">View Transactions</button>
                ${expense.is_active ? `<button onclick="openPayModal(${expense.id})" class="btn btn-sm btn-primary">Mark Paid</button>` : ''}
                <div class="ml-auto dropdown dropdown-end">
                    <button tabindex="0" class="btn btn-ghost btn-sm btn-square" aria-label="More actions">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                    </button>
                    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-200 z-10 w-44 p-1">
                        <li><a onclick="openEditModal(${expense.id})">Edit</a></li>
                        ${expense.is_active
                            ? `<li><a onclick="disableExpense(${expense.id})">Disable</a></li>`
                            : `<li><a onclick="enableExpense(${expense.id})">Enable</a></li>
                               <li><a onclick="viewRecurringDetails(${expense.id})">View history</a></li>`}
                        <li><a class="text-error" onclick="deleteExpense(${expense.id})">Delete</a></li>
                    </ul>
                </div>
            </div>
        </div>
    `;
}

window.viewRecurringDetails = async (id) => {
    const expense = recurringExpenses.find(e => e.id === id);
    if (!expense) return;

    const modal = document.getElementById('recurringDetailsModal');
    const titleEl = document.getElementById('recurringDetailsTitle');
    const subtitleEl = document.getElementById('recurringDetailsSubtitle');
    const bodyEl = document.getElementById('recurringDetailsBody');

    titleEl.textContent = expense.name;
    const enableBtn = document.getElementById('recurringDetailsEnableBtn');
    if (expense.is_active) {
        enableBtn.classList.add('hidden');
    } else {
        enableBtn.classList.remove('hidden');
        enableBtn.dataset.expenseId = String(expense.id);
    }
    const cat = categories.find(c => c.id === expense.category_id);
    const cadence = expense.recurrence_interval === 1
        ? ({ days: 'Daily', weeks: 'Weekly', months: 'Monthly' }[expense.recurrence_unit] || expense.recurrence_unit)
        : `Every ${expense.recurrence_interval} ${expense.recurrence_unit}`;
    subtitleEl.textContent = `${cadence}${cat ? ' · ' + cat.name : ''} · ${Utils.formatCurrency(expense.amount)}`;
    bodyEl.innerHTML = '<p class="text-base-content/60 text-sm">Loading…</p>';
    modal.showModal();

    try {
        const data = await API.recurringExpenses.getTransactions(id);
        const txns = data.transactions || [];
        const summary = data.summary || {};

        const summaryStrip = `
            <div class="fin-mini-kpis" style="border-bottom: 1px solid color-mix(in oklch, var(--color-base-content) 6%, transparent);">
                <div>
                    <div class="fin-mini-kpi-label">Total Paid</div>
                    <div class="fin-mini-kpi-value">${Utils.formatCurrency(summary.total_paid || 0)}</div>
                </div>
                <div>
                    <div class="fin-mini-kpi-label">Payments</div>
                    <div class="fin-mini-kpi-value">${summary.payment_count || 0}</div>
                </div>
                <div>
                    <div class="fin-mini-kpi-label">Last Payment</div>
                    <div class="fin-mini-kpi-value" style="font-size:0.9375rem;">${summary.last_payment_date ? Utils.formatDate(summary.last_payment_date) : '—'}</div>
                </div>
            </div>
        `;

        let body;
        if (txns.length === 0) {
            body = `
                ${summaryStrip}
                <div class="text-center py-8">
                    <p class="text-base-content/60 text-sm">No payments recorded yet.</p>
                    <p class="text-base-content/40 text-xs mt-1">Use "Mark Paid" on the card to record one.</p>
                </div>
            `;
        } else {
            const rows = txns.map(t => {
                const accBadge = t.account_name ? `<span class="text-xs text-base-content/55">${t.account_name}</span>` : '';
                const catChip = t.category_name
                    ? `<span class="badge badge-ghost badge-sm">${t.category_name}</span>`
                    : '';
                return `
                    <tr>
                        <td class="text-xs whitespace-nowrap">${Utils.formatDate(t.transaction_date || t.payment_date)}</td>
                        <td class="text-sm">
                            <div class="font-medium truncate">${t.description || '—'}</div>
                            ${accBadge}
                        </td>
                        <td>${catChip}</td>
                        <td class="text-right fin-numeric font-semibold whitespace-nowrap">${Utils.formatCurrency(t.amount)}</td>
                    </tr>
                `;
            }).join('');

            body = `
                ${summaryStrip}
                <div class="overflow-x-auto mt-4">
                    <table class="table table-sm">
                        <thead>
                            <tr class="text-xs uppercase tracking-wider text-base-content/55">
                                <th>Date</th>
                                <th>Description</th>
                                <th>Category</th>
                                <th class="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }
        bodyEl.innerHTML = body;
    } catch (err) {
        console.error('Failed to load linked transactions:', err);
        bodyEl.innerHTML = `<p class="text-error text-sm">Error loading transactions: ${err.message || 'Unknown error'}</p>`;
    }
};

window.openCreateModal = () => {
    editingId = null;
    document.getElementById('recurringForm').reset();
    document.getElementById('recurringModalTitle').textContent = 'Add Recurring Expense';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reStartDate').value = today;
    document.getElementById('reNextDueDate').value = today;
    document.getElementById('reNotifyEnabled').checked = false;
    document.getElementById('reNotifyDaysBefore').value = '';
    toggleReNotifyDays();
    document.getElementById('recurringModal').showModal();
};

window.openEditModal = (id) => {
    editingId = id;
    const e = recurringExpenses.find(r => r.id === id);
    if (!e) return;
    document.getElementById('recurringModalTitle').textContent = 'Edit Recurring Expense';
    document.getElementById('reName').value = e.name;
    document.getElementById('reAmount').value = e.amount;
    document.getElementById('reAccount').value = e.account_id || '';
    document.getElementById('reCategory').value = e.category_id || '';
    document.getElementById('reStartDate').value = e.start_date;
    document.getElementById('reNextDueDate').value = e.next_due_date;
    document.getElementById('reInterval').value = e.recurrence_interval;
    document.getElementById('reUnit').value = e.recurrence_unit;
    document.getElementById('reNotes').value = e.notes || '';
    document.getElementById('reNotifyEnabled').checked = !!e.notify_enabled;
    document.getElementById('reNotifyDaysBefore').value = e.notify_days_before ?? '';
    toggleReNotifyDays();
    document.getElementById('recurringModal').showModal();
};

window.openPayModal = (id) => {
    const e = recurringExpenses.find(r => r.id === id);
    if (!e) return;
    document.getElementById('payRecurringId').value = id;
    document.getElementById('payRecurringDesc').textContent = `Recording payment for "${e.name}" — ${Utils.formatCurrency(e.amount)}`;
    document.getElementById('payRecurringAmount').value = e.amount;
    document.getElementById('payRecurringDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('payRecurringNotes').value = '';

    const txnList = (recentTransactions.items || recentTransactions);
    const txnSel = document.getElementById('payRecurringTxn');
    txnSel.innerHTML = '<option value="">No transaction link</option>' +
        txnList
            .filter(t => t.type === 'expense')
            .slice(0, 60)
            .map(t => `<option value="${t.id}">${Utils.formatDate(t.date)} — ${t.description} (${Utils.formatCurrency(t.amount)})</option>`)
            .join('');

    document.getElementById('payRecurringModal').showModal();
};

window.deleteExpense = async (id) => {
    const expense = recurringExpenses.find(e => e.id === id);
    const name = expense ? expense.name : 'this recurring expense';
    if (!confirm(`Permanently delete "${name}"? Its payment history will be destroyed. Disable it instead to keep the history.`)) return;
    try {
        await API.recurringExpenses.delete(id);
        Utils.showToast('Deleted', 'success');
        recurringExpenses = recurringExpenses.filter(e => e.id !== id);
        renderPage();
    } catch (err) {
        Utils.showToast(err.message || 'Error deleting', 'error');
    }
};

window.disableExpense = async (id) => {
    try {
        await API.recurringExpenses.setActive(id, false);
        Utils.showToast('Recurring expense disabled', 'success');
        recurringExpenses = await API.recurringExpenses.list();
        renderPage();
    } catch (err) {
        Utils.showToast(err.message || 'Error disabling', 'error');
    }
};

window.enableExpense = async (id) => {
    try {
        await API.recurringExpenses.setActive(id, true);
        Utils.showToast('Recurring expense enabled', 'success');
        recurringExpenses = await API.recurringExpenses.list();
        renderPage();
    } catch (err) {
        Utils.showToast(err.message || 'Error enabling', 'error');
    }
};

window.enableFromDetailsModal = async () => {
    const id = parseInt(document.getElementById('recurringDetailsEnableBtn').dataset.expenseId, 10);
    if (!id) return;
    await window.enableExpense(id);
    document.getElementById('recurringDetailsModal').close();
};

function setupEventListeners() {
    document.getElementById('recurringForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const notifyEnabled = document.getElementById('reNotifyEnabled').checked;
        const notifyDaysRaw = fd.get('notify_days_before');
        const data = {
            name: fd.get('name'),
            amount: parseFloat(fd.get('amount')),
            category_id: fd.get('category_id') ? parseInt(fd.get('category_id')) : null,
            account_id: fd.get('account_id') ? parseInt(fd.get('account_id')) : null,
            recurrence_interval: parseInt(fd.get('recurrence_interval')),
            recurrence_unit: fd.get('recurrence_unit'),
            start_date: fd.get('start_date'),
            next_due_date: fd.get('next_due_date'),
            notes: fd.get('notes') || null,
            is_active: editingId ? (recurringExpenses.find(r => r.id === editingId)?.is_active ?? true) : true,
            notify_enabled: notifyEnabled,
            notify_days_before: notifyEnabled && notifyDaysRaw ? parseInt(notifyDaysRaw, 10) : null,
        };
        try {
            if (editingId) {
                await API.recurringExpenses.update(editingId, data);
                Utils.showToast('Recurring expense updated', 'success');
            } else {
                await API.recurringExpenses.create(data);
                Utils.showToast('Recurring expense created', 'success');
            }
            document.getElementById('recurringModal').close();
            recurringExpenses = await API.recurringExpenses.list();
            renderPage();
        } catch (err) {
            Utils.showToast(err.message || 'Error saving', 'error');
        }
    });

    document.getElementById('payRecurringForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('payRecurringId').value);
        const data = {
            amount: parseFloat(document.getElementById('payRecurringAmount').value),
            payment_date: document.getElementById('payRecurringDate').value,
            transaction_id: document.getElementById('payRecurringTxn').value
                ? parseInt(document.getElementById('payRecurringTxn').value)
                : null,
            notes: document.getElementById('payRecurringNotes').value || null,
        };
        try {
            await API.recurringExpenses.recordPayment(id, data);
            Utils.showToast('Payment recorded — next due date advanced', 'success');
            document.getElementById('payRecurringModal').close();
            recurringExpenses = await API.recurringExpenses.list();
            renderPage();
        } catch (err) {
            Utils.showToast(err.message || 'Error recording payment', 'error');
        }
    });
}
