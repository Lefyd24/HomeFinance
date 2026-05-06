// Recurring Expenses page controller

let recurringExpenses = [];
let accounts = [];
let categories = [];
let recentTransactions = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    Layout.render('recurring-expenses');
    await initialize();
});

async function initialize() {
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
            ${inactive.length > 0 ? renderSection('Inactive', inactive) : ''}
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

function renderCard(expense) {
    const cat = categories.find(c => c.id === expense.category_id);
    const acc = accounts.find(a => a.id === expense.account_id);

    let dueLabel, cardAccent;
    if (expense.is_overdue) {
        dueLabel = `<span class="badge badge-error badge-sm">${Math.abs(expense.days_until_due)}d overdue</span>`;
        cardAccent = 'border-l-4 border-l-error';
    } else if (expense.days_until_due === 0) {
        dueLabel = `<span class="badge badge-warning badge-sm">Due today</span>`;
        cardAccent = 'border-l-4 border-l-warning';
    } else if (expense.days_until_due <= 7) {
        dueLabel = `<span class="badge badge-warning badge-sm">In ${expense.days_until_due}d</span>`;
        cardAccent = 'border-l-4 border-l-warning';
    } else if (!expense.is_active) {
        dueLabel = `<span class="badge badge-ghost badge-sm">Inactive</span>`;
        cardAccent = 'opacity-60';
    } else {
        dueLabel = `<span class="badge badge-ghost badge-sm">In ${expense.days_until_due}d</span>`;
        cardAccent = '';
    }

    const periodLabel = `Every ${expense.recurrence_interval} ${expense.recurrence_unit}`;

    return `
        <div class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow ${cardAccent}">
            <div class="card-body p-5">
                <div class="flex justify-between items-start gap-2 mb-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-base truncate">${expense.name}</h3>
                        <p class="text-xs text-base-content/50 mt-0.5">${periodLabel}</p>
                    </div>
                    <span class="text-lg font-bold shrink-0">${Utils.formatCurrency(expense.amount)}</span>
                </div>
                <div class="flex flex-wrap gap-1.5 mb-3">
                    ${dueLabel}
                    ${cat ? `<span class="badge badge-outline badge-sm">${cat.name}</span>` : ''}
                    ${acc ? `<span class="badge badge-ghost badge-sm">${acc.name}</span>` : ''}
                </div>
                <p class="text-xs text-base-content/40 mb-4">Next due: <span class="font-medium text-base-content/60">${Utils.formatDate(expense.next_due_date)}</span></p>
                <div class="flex gap-2 justify-end border-t border-base-200 pt-3">
                    ${expense.is_active ? `<button onclick="openPayModal(${expense.id})" class="btn btn-success btn-xs">Mark Paid</button>` : ''}
                    <button onclick="openEditModal(${expense.id})" class="btn btn-ghost btn-xs">Edit</button>
                    <button onclick="deleteExpense(${expense.id})" class="btn btn-error btn-xs btn-outline">Delete</button>
                </div>
            </div>
        </div>
    `;
}

window.openCreateModal = () => {
    editingId = null;
    document.getElementById('recurringForm').reset();
    document.getElementById('recurringModalTitle').textContent = 'Add Recurring Expense';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reStartDate').value = today;
    document.getElementById('reNextDueDate').value = today;
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
    if (!confirm('Delete this recurring expense? This cannot be undone.')) return;
    try {
        await API.recurringExpenses.delete(id);
        Utils.showToast('Deleted', 'success');
        recurringExpenses = recurringExpenses.filter(e => e.id !== id);
        renderPage();
    } catch (err) {
        Utils.showToast(err.message || 'Error deleting', 'error');
    }
};

function setupEventListeners() {
    document.getElementById('recurringForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
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
            is_active: true,
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
