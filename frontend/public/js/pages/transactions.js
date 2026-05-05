/**
 * Transactions page controller
 */

// State (global for this module)
let transactions = [];
let accounts = [];
let categories = [];
let debts = [];
let recurringExpenses = [];
let currentPage = 1;
let totalPages = 1;
let filters = {};

// Global functions for onclick handlers
window.openTransactionModal = () => {
    // Reset form for new transaction
    document.getElementById('transactionId').value = '';
    document.getElementById('modalTitle').textContent = 'Add Transaction';
    document.getElementById('transactionForm').reset();
    
    // Set default date to today
    document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];
    
    // Reset category combobox
    document.getElementById('categoryId').value = '';
    const categorySearch = document.getElementById('categorySearch');
    if (categorySearch) categorySearch.value = '';
    const categoryDropdownList = document.getElementById('categoryDropdownList');
    if (categoryDropdownList) categoryDropdownList.classList.add('hidden');

    // Reset debt payment container to original state (in case it was modified during edit)
    const debtPaymentContainer = document.getElementById('debtPaymentContainer');
    if (debtPaymentContainer) {
        debtPaymentContainer.innerHTML = `
            <label class="label cursor-pointer justify-start gap-3">
                <input type="checkbox" id="linkToDebt" class="checkbox checkbox-sm" onchange="toggleDebtSelect()">
                <span class="label-text font-medium">This is a debt payment</span>
            </label>
            <div id="debtSelectContainer" class="mt-2 hidden">
                <label class="label py-1"><span class="label-text font-medium text-sm">Select Debt</span></label>
                <select id="debtId" name="debtId" class="select select-bordered w-full select-sm sm:select-md">
                    <option value="">Select a debt...</option>
                </select>
                <label class="label">
                    <span class="label-text-alt text-info">This will create a linked debt payment record</span>
                </label>
            </div>
        `;
        // Re-populate debt select
        window.populateDebtSelect();
    }
    
    // Reset debt linking fields
    const debtCheckbox = document.getElementById('linkToDebt');
    const debtSelectContainer = document.getElementById('debtSelectContainer');
    const debtSelect = document.getElementById('debtId');
    if (debtCheckbox) debtCheckbox.checked = false;
    if (debtSelectContainer) debtSelectContainer.classList.add('hidden');
    if (debtSelect) debtSelect.value = '';
    
    // Reset recurring expense link
    window.populateRecurringSelect();
    const linkToRecurring = document.getElementById('linkToRecurring');
    const recurringSelectContainer = document.getElementById('recurringSelectContainer');
    if (linkToRecurring) linkToRecurring.checked = false;
    if (recurringSelectContainer) recurringSelectContainer.classList.add('hidden');

    // Reset form visibility
    window.updateFormForTransactionType();
    transactionModal.showModal();
};

window.updateFormForTransactionType = () => {
    const type = document.getElementById('transactionType').value;
    const destContainer = document.getElementById('destinationAccountContainer');
    const categoryContainer = document.getElementById('categoryContainer');
    const sourceLabel = document.getElementById('sourceAccountLabel');
    const destSelect = document.getElementById('destinationAccountId');
    const categorySelect = document.getElementById('categoryId');
    
    if (type === 'transfer') {
        // Show destination account, hide category
        destContainer.style.display = 'block';
        categoryContainer.style.display = 'none';
        sourceLabel.textContent = 'From Account';
        destSelect.required = true;
        categorySelect.required = false;
        categorySelect.value = '';
    } else {
        // Hide destination account, show category
        destContainer.style.display = 'none';
        categoryContainer.style.display = 'block';
        sourceLabel.textContent = 'Account';
        destSelect.required = false;
        destSelect.value = '';
        categorySelect.required = true;
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('transactions');
    
    // Get main content container
    const mainContent = document.getElementById('main-content');
    
    // Show skeleton loading screen initially
    const skeletonTemplate = document.getElementById('transactions-skeleton');
    if (skeletonTemplate) {
        mainContent.innerHTML = skeletonTemplate.innerHTML;
    }
    
    // Initialize (this will replace the skeleton with actual content)
    await initialize();
    
    // Set default filters to current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    filters = {
        start_date: startOfMonth,
        end_date: endOfMonth
    };
    // Populate filter inputs
    const filterFromDate = document.getElementById('filterFromDate');
    const filterToDate = document.getElementById('filterToDate');
    if (filterFromDate) filterFromDate.value = startOfMonth;
    if (filterToDate) filterToDate.value = endOfMonth;
    
    // Load transactions data
    await loadTransactions();
    
    // Setup form submission (modal is in HTML, not dynamically rendered)
    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleTransactionSubmit);
    }
    
    // Close category dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const container = document.getElementById('categoryContainer');
        const list = document.getElementById('categoryDropdownList');
        if (list && container && !container.contains(e.target)) {
            list.classList.add('hidden');
        }
    });

    // Setup type change handler
    const transactionType = document.getElementById('transactionType');
    if (transactionType) {
        transactionType.addEventListener('change', window.updateFormForTransactionType);
    }
    
    // Populate account dropdown selects
    function populateAccountSelects() {
        const accountSelect = document.getElementById('accountId');
        const destAccountSelect = document.getElementById('destinationAccountId');
        const filterAccountSelect = document.getElementById('filterAccount');
        
        if (!accountSelect) return;
        
        let optionsHtml = '<option value="">Select Account</option>';
        accounts.forEach(acc => {
            optionsHtml += `<option value="${acc.id}">${acc.name}</option>`;
        });
        
        accountSelect.innerHTML = optionsHtml;
        
        if (destAccountSelect) {
            destAccountSelect.innerHTML = '<option value="">Select Destination Account</option>' + optionsHtml.replace('<option value="">Select Account</option>', '');
        }
        
        if (filterAccountSelect) {
            filterAccountSelect.innerHTML = '<option value="">All Accounts</option>' + optionsHtml.replace('<option value="">Select Account</option>', '');
        }
    }
    
    // Populate category dropdown select
    function populateCategorySelect() {
        const categorySelect = document.getElementById('categoryId');
        const filterCategorySelect = document.getElementById('filterCategory');
        const dropdownList = document.getElementById('categoryDropdownList');
        if (!categories || categories.length === 0) return;

        const groups = [
            { label: 'Income', list: categories.filter(c => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name)) },
            { label: 'Expense', list: categories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name)) },
            { label: 'Transfer', list: categories.filter(c => c.type === 'transfer').sort((a, b) => a.name.localeCompare(b.name)) },
        ].filter(g => g.list.length > 0);

        // Hidden select for form submission
        let optionsHtml = '<option value="">Select Category</option>';
        groups.forEach(g => {
            optionsHtml += `<optgroup label="${g.label}">`;
            g.list.forEach(cat => { optionsHtml += `<option value="${cat.id}">${cat.name}</option>`; });
            optionsHtml += '</optgroup>';
        });
        if (categorySelect) categorySelect.innerHTML = optionsHtml;

        // Filter select in toolbar
        if (filterCategorySelect) {
            filterCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                optionsHtml.replace('<option value="">Select Category</option>', '');
        }

        // Build flat list for combobox
        if (dropdownList) {
            window._allCategoryItems = [];
            groups.forEach(g => {
                g.list.forEach(cat => window._allCategoryItems.push({ id: cat.id, name: cat.name, group: g.label }));
            });
            renderCategoryDropdown('');
        }
    }

    function renderCategoryDropdown(query) {
        const dropdownList = document.getElementById('categoryDropdownList');
        if (!dropdownList || !window._allCategoryItems) return;
        const q = query.toLowerCase().trim();
        const matches = q
            ? window._allCategoryItems.filter(e => e.name.toLowerCase().includes(q))
            : window._allCategoryItems;
        if (matches.length === 0) {
            dropdownList.innerHTML = '<li class="px-4 py-2 text-sm text-base-content/50">No categories found</li>';
            return;
        }
        dropdownList.innerHTML = matches.map(entry => `
            <li>
                <button type="button"
                    class="w-full text-left px-4 py-2 text-sm hover:bg-base-200 flex items-center gap-2"
                    onmousedown="selectCategory(${entry.id}, '${entry.name.replace(/'/g, "\\'")}')">
                    <span class="badge badge-xs badge-ghost">${entry.group}</span>
                    ${entry.name}
                </button>
            </li>`).join('');
    }

    window.filterCategoryDropdown = () => {
        const q = document.getElementById('categorySearch')?.value || '';
        renderCategoryDropdown(q);
        showCategoryDropdown();
        const categorySelect = document.getElementById('categoryId');
        if (categorySelect) categorySelect.value = '';
    };

    window.showCategoryDropdown = () => {
        const list = document.getElementById('categoryDropdownList');
        if (list) list.classList.remove('hidden');
    };

    window.selectCategory = (id, name) => {
        const categorySelect = document.getElementById('categoryId');
        const searchInput = document.getElementById('categorySearch');
        const list = document.getElementById('categoryDropdownList');
        if (categorySelect) categorySelect.value = id;
        if (searchInput) searchInput.value = name;
        if (list) list.classList.add('hidden');
    };
    
    // Populate debt dropdown select
    function populateDebtSelect() {
        const debtSelect = document.getElementById('debtId');
        if (!debtSelect || !debts || debts.length === 0) {
            const container = document.getElementById('debtPaymentContainer');
            if (container) container.style.display = 'none';
            return;
        }
        
        // Only show active debts that are not paid off
        const activeDebts = debts.filter(d => d.is_active && !d.is_paid_off);
        
        if (activeDebts.length === 0) {
            const container = document.getElementById('debtPaymentContainer');
            if (container) container.style.display = 'none';
            return;
        }
        
        let optionsHtml = '<option value="">Select a debt...</option>';
        activeDebts.forEach(debt => {
            optionsHtml += `<option value="${debt.id}">${debt.name} - ${Utils.formatCurrency(debt.current_balance)} remaining</option>`;
        });
        
        debtSelect.innerHTML = optionsHtml;
    }
    
    // Toggle debt select visibility
    function toggleDebtSelect() {
        const checkbox = document.getElementById('linkToDebt');
        const container = document.getElementById('debtSelectContainer');
        
        if (checkbox && container) {
            container.classList.toggle('hidden', !checkbox.checked);
        }
    }
    
    // Expose functions to window for HTML event handlers
    window.toggleDebtSelect = toggleDebtSelect;
    window.populateDebtSelect = populateDebtSelect;

    window.populateRecurringSelect = () => {
        const sel = document.getElementById('recurringExpenseId');
        if (!sel) return;
        sel.innerHTML = '<option value="">Select a recurring expense...</option>' +
            recurringExpenses
                .filter(r => r.is_active)
                .map(r => `<option value="${r.id}">${r.name} — ${Utils.formatCurrency(r.amount)} (due ${Utils.formatDate(r.next_due_date)})</option>`)
                .join('');
    };

    window.toggleRecurringSelect = () => {
        const container = document.getElementById('recurringSelectContainer');
        const checked = document.getElementById('linkToRecurring').checked;
        if (container) container.classList.toggle('hidden', !checked);
    };

    async function initialize() {
        try {
            // Load accounts, categories, debts and recurring expenses
            [accounts, categories, debts, recurringExpenses] = await Promise.all([
                API.accounts.list(),
                API.categories.list(),
                API.debts.list(),
                API.recurringExpenses.list(),
            ]);

            populateAccountSelects();
            populateCategorySelect();
            populateDebtSelect();
            window.populateRecurringSelect();
        } catch (error) {
            console.error('Error initializing:', error);
            Utils.showToast('Error loading data', 'error');
        }
    }
    
    async function loadTransactions() {
        try {
            const response = await API.transactions.list({
                ...filters,
                page: currentPage,
                per_page: 20
            });
            
            transactions = response.items;
            totalPages = Math.ceil(response.total / response.per_page);
            
            renderTransactionsTable();
            renderPagination();
            
        } catch (error) {
            console.error('Error loading transactions:', error);
            Utils.showToast('Error loading transactions', 'error');
        }
    }
    
    function renderTransactionsTable() {
        const container = document.getElementById('transactionsTable');
        
        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 md:py-12">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-base-content/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p class="text-base-content/60 text-sm md:text-base">No transactions found</p>
                    <button onclick="openTransactionModal()" class="btn btn-primary btn-sm mt-3">
                        Add your first transaction
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="overflow-x-auto overflow-y-auto -mx-3 md:mx-0 max-h-[calc(100vh-420px)] md:max-h-[calc(100vh-380px)]">
                <table class="table w-full">
                    <thead class="sticky top-0 z-10 bg-base-100">
                        <tr class="border-b border-base-300">
                            <th class="text-xs md:text-sm py-2 md:py-3 pl-3 md:pl-4">Date</th>
                            <th class="text-xs md:text-sm py-2 md:py-3">Description</th>
                            <th class="hidden md:table-cell text-xs md:text-sm py-2 md:py-3">Category</th>
                            <th class="hidden md:table-cell text-xs md:text-sm py-2 md:py-3">Account</th>
                            <th class="text-right text-xs md:text-sm py-2 md:py-3 pr-3 md:pr-4">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map(tx => `
                            <tr class="hover transition-colors border-b border-base-200/50">
                                <td class="py-2 md:py-3 pl-3 md:pl-4 cursor-pointer" onclick="showTransactionDetailModal(${tx.id})">
                                    <span class="text-xs md:text-sm whitespace-nowrap text-base-content/80">${Utils.formatDate(tx.date)}</span>
                                </td>
                                <td class="py-2 md:py-3 max-w-[120px] md:max-w-xs cursor-pointer" onclick="showTransactionDetailModal(${tx.id})">
                                    <div class="flex flex-col">
                                        <div class="flex items-center gap-1">
                                            <span class="text-xs md:text-sm font-medium truncate" title="${tx.description}">${tx.description}</span>
                                            ${tx.debt_payment_id ? `
                                                <span class="badge badge-error badge-xs gap-0.5 px-1.5 py-0" title="Linked to debt: ${tx.debt_name}">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                    </svg>
                                                </span>
                                            ` : ''}
                                        </div>
                                        ${tx.type === 'transfer' 
                                            ? '<span class="md:hidden text-[10px] text-base-content/50 mt-0.5">Transfer</span>'
                                            : `<span class="md:hidden text-[10px] text-base-content/50 mt-0.5 cursor-pointer hover:text-primary" 
                                                   onclick="event.stopPropagation(); enableInlineCategoryEditMobile(${tx.id}, this)">
                                                ${tx.category_name || 'Uncategorized'}
                                            </span>`
                                        }
                                    </div>
                                </td>
                                <td class="hidden md:table-cell py-2 md:py-3">
                                    ${tx.type === 'transfer' 
                                        ? '<span class="badge badge-sm badge-info">Transfer</span>' 
                                        : `<span class="badge badge-sm cursor-pointer hover:opacity-80 transition-opacity" 
                                               style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};"
                                               onclick="event.stopPropagation(); enableInlineCategoryEdit(${tx.id}, this)">${tx.category_name || 'Uncategorized'}</span>`
                                    }
                                </td>
                                <td class="hidden md:table-cell py-2 md:py-3 text-xs md:text-sm text-base-content/70">
                                    ${tx.type === 'transfer' 
                                        ? `<span class="truncate" title="${tx.account_name} → ${tx.destination_account_name}">${tx.account_name} → ${tx.destination_account_name}</span>` 
                                        : `<span class="truncate" title="${tx.account_name}">${tx.account_name}</span>`
                                    }
                                </td>
                                <td class="py-2 md:py-3 pr-3 md:pr-4 text-right">
                                    <span class="text-xs md:text-sm font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity inline-block px-2 py-1 rounded ${tx.type === 'income' ? 'text-success hover:bg-success/10' : tx.type === 'transfer' ? 'text-info hover:bg-info/10' : 'text-error hover:bg-error/10'}"
                                          onclick="event.stopPropagation(); enableInlineAmountEdit(${tx.id}, this, '${tx.type}')">
                                        ${tx.type === 'income' ? '+' : tx.type === 'transfer' ? '⇄' : '-'}${Utils.formatCurrency(tx.amount)}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Inline editing for category
    window.enableInlineCategoryEdit = function(transactionId, element) {
        const tx = transactions.find(t => t.id === transactionId);
        if (!tx || tx.type === 'transfer') return;
        
        // Create select dropdown
        const select = document.createElement('select');
        select.className = 'select select-bordered select-xs w-full max-w-[150px]';
        select.style.cssText = 'font-size: 0.75rem; padding: 0.25rem; min-height: 1.5rem; height: auto;';
        
        // Build options grouped by type
        const incomeCats = categories.filter(c => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name));
        const expenseCats = categories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name));
        
        let optionsHtml = '';
        if (incomeCats.length > 0) {
            optionsHtml += '<optgroup label="Income">';
            incomeCats.forEach(cat => {
                optionsHtml += `<option value="${cat.id}" ${cat.id === tx.category_id ? 'selected' : ''}>${cat.name}</option>`;
            });
            optionsHtml += '</optgroup>';
        }
        if (expenseCats.length > 0) {
            optionsHtml += '<optgroup label="Expense">';
            expenseCats.forEach(cat => {
                optionsHtml += `<option value="${cat.id}" ${cat.id === tx.category_id ? 'selected' : ''}>${cat.name}</option>`;
            });
            optionsHtml += '</optgroup>';
        }
        select.innerHTML = optionsHtml;
        
        // Replace element with select
        element.replaceWith(select);
        
        // Use setTimeout to allow the click event that triggered this to finish
        // before we start listening for outside clicks
        setTimeout(() => {
            select.focus();
        }, 0);
        
        let isChanging = false;
        let clickListener = null;
        
        // Handle change - save when user selects something
        const saveCategory = async () => {
            if (isChanging) return;
            isChanging = true;
            
            // Remove click listener
            if (clickListener) {
                document.removeEventListener('click', clickListener);
            }
            
            const newCategoryId = parseInt(select.value);
            if (newCategoryId !== tx.category_id) {
                try {
                    await API.transactions.update(transactionId, {
                        ...tx,
                        category_id: newCategoryId
                    });
                    Utils.showToast('Category updated', 'success');
                    loadTransactions();
                } catch (error) {
                    console.error('Error updating category:', error);
                    Utils.showToast('Error updating category', 'error');
                    renderTransactionsTable();
                }
            } else {
                renderTransactionsTable();
            }
        };
        
        // Handle clicks outside to cancel
        clickListener = (e) => {
            if (!select.contains(e.target)) {
                document.removeEventListener('click', clickListener);
                if (!isChanging) {
                    renderTransactionsTable();
                }
            }
        };
        
        // Add click listener after a short delay to avoid the current click
        setTimeout(() => {
            document.addEventListener('click', clickListener);
        }, 100);
        
        select.addEventListener('change', saveCategory);
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                isChanging = true;
                document.removeEventListener('click', clickListener);
                renderTransactionsTable();
            }
        });
    };
    
    // Inline editing for amount
    window.enableInlineAmountEdit = function(transactionId, element, txType) {
        const tx = transactions.find(t => t.id === transactionId);
        if (!tx) return;
        
        // Create input field
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.value = tx.amount;
        input.className = 'input input-bordered input-xs w-24 text-right';
        input.style.cssText = 'font-size: 0.75rem; padding: 0.25rem 0.5rem; height: auto; min-height: 1.5rem;';
        
        // Replace element with input
        element.replaceWith(input);
        input.focus();
        input.select();
        
        // Handle save
        const saveAmount = async () => {
            const newAmount = parseFloat(input.value);
            if (isNaN(newAmount) || newAmount <= 0) {
                Utils.showToast('Please enter a valid amount', 'error');
                renderTransactionsTable();
                return;
            }
            if (newAmount !== tx.amount) {
                try {
                    await API.transactions.update(transactionId, {
                        ...tx,
                        amount: newAmount
                    });
                    Utils.showToast('Amount updated', 'success');
                    loadTransactions();
                } catch (error) {
                    console.error('Error updating amount:', error);
                    Utils.showToast('Error updating amount', 'error');
                    renderTransactionsTable();
                }
            } else {
                renderTransactionsTable();
            }
        };
        
        input.addEventListener('blur', saveAmount);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                renderTransactionsTable();
            }
        });
    };
    
    // Inline editing for category on mobile
    window.enableInlineCategoryEditMobile = function(transactionId, element) {
        const tx = transactions.find(t => t.id === transactionId);
        if (!tx || tx.type === 'transfer') return;
        
        // Create select dropdown
        const select = document.createElement('select');
        select.className = 'select select-bordered select-xs';
        select.style.cssText = 'font-size: 0.65rem; padding: 0.125rem; min-height: 1.25rem; height: auto; width: auto; max-width: 120px;';
        
        // Build options grouped by type
        const incomeCats = categories.filter(c => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name));
        const expenseCats = categories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name));
        
        let optionsHtml = '';
        if (incomeCats.length > 0) {
            optionsHtml += '<optgroup label="Income">';
            incomeCats.forEach(cat => {
                optionsHtml += `<option value="${cat.id}" ${cat.id === tx.category_id ? 'selected' : ''}>${cat.name}</option>`;
            });
            optionsHtml += '</optgroup>';
        }
        if (expenseCats.length > 0) {
            optionsHtml += '<optgroup label="Expense">';
            expenseCats.forEach(cat => {
                optionsHtml += `<option value="${cat.id}" ${cat.id === tx.category_id ? 'selected' : ''}>${cat.name}</option>`;
            });
            optionsHtml += '</optgroup>';
        }
        select.innerHTML = optionsHtml;
        
        // Replace element with select
        element.replaceWith(select);
        
        // Use setTimeout to allow the click event that triggered this to finish
        // before we start listening for outside clicks
        setTimeout(() => {
            select.focus();
        }, 0);
        
        let isChanging = false;
        let clickListener = null;
        
        // Handle change - save when user selects something
        const saveCategory = async () => {
            if (isChanging) return;
            isChanging = true;
            
            // Remove click listener
            if (clickListener) {
                document.removeEventListener('click', clickListener);
            }
            
            const newCategoryId = parseInt(select.value);
            if (newCategoryId !== tx.category_id) {
                try {
                    await API.transactions.update(transactionId, {
                        ...tx,
                        category_id: newCategoryId
                    });
                    Utils.showToast('Category updated', 'success');
                    loadTransactions();
                } catch (error) {
                    console.error('Error updating category:', error);
                    Utils.showToast('Error updating category', 'error');
                    renderTransactionsTable();
                }
            } else {
                renderTransactionsTable();
            }
        };
        
        // Handle clicks outside to cancel
        clickListener = (e) => {
            if (!select.contains(e.target)) {
                document.removeEventListener('click', clickListener);
                if (!isChanging) {
                    renderTransactionsTable();
                }
            }
        };
        
        // Add click listener after a short delay to avoid the current click
        setTimeout(() => {
            document.addEventListener('click', clickListener);
        }, 100);
        
        select.addEventListener('change', saveCategory);
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                isChanging = true;
                document.removeEventListener('click', clickListener);
                renderTransactionsTable();
            }
        });
    };
    
    function renderPagination() {
        const container = document.getElementById('pagination');
        container.className = 'flex justify-center mt-4 shrink-0';
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        const maxVisible = 5; // Max page buttons to show
        let pages = [];
        
        // Always show first page
        pages.push(1);
        
        // Calculate range around current page
        let start = Math.max(2, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages - 1, currentPage + Math.floor(maxVisible / 2));
        
        // Adjust range to show maxVisible buttons when possible
        if (end - start + 1 < maxVisible && totalPages > maxVisible + 2) {
            if (start === 2) {
                end = Math.min(totalPages - 1, start + maxVisible - 1);
            } else if (end === totalPages - 1) {
                start = Math.max(2, end - maxVisible + 1);
            }
        }
        
        // Add ellipsis after first page if needed
        if (start > 2) {
            pages.push('...');
        }
        
        // Add middle pages
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        
        // Add ellipsis before last page if needed
        if (end < totalPages - 1) {
            pages.push('...');
        }
        
        // Always show last page if more than 1 page
        if (totalPages > 1) {
            pages.push(totalPages);
        }
        
        // Build pagination HTML
        let pagesHtml = '';
        pages.forEach(p => {
            if (p === '...') {
                pagesHtml += '<button class="join-item btn btn-sm btn-disabled">…</button>';
            } else {
                pagesHtml += `
                    <button onclick="goToPage(${p})" class="join-item btn btn-sm ${p === currentPage ? 'btn-active' : ''}">${p}</button>
                `;
            }
        });
        
        container.innerHTML = `
            <div class="join">
                <button onclick="goToPage(${currentPage - 1})" class="join-item btn btn-sm" ${currentPage === 1 ? 'disabled' : ''}>«</button>
                ${pagesHtml}
                <button onclick="goToPage(${currentPage + 1})" class="join-item btn btn-sm" ${currentPage === totalPages ? 'disabled' : ''}>»</button>
            </div>
        `;
    }
    
    window.goToPage = (page) => {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        loadTransactions();
    };
    
    window.applyFilters = () => {
        filters = {
            start_date: document.getElementById('filterFromDate').value,
            end_date: document.getElementById('filterToDate').value,
            account_id: document.getElementById('filterAccount').value,
            category_id: document.getElementById('filterCategory').value,
            type: document.getElementById('filterType').value,
            search: document.getElementById('searchDescription')?.value?.trim() || ''
        };
        currentPage = 1;
        loadTransactions();
    };
    
    // Search functionality
    let searchTimeout;
    window.handleSearch = (event) => {
        const searchValue = event.target.value.trim();
        const clearBtn = document.getElementById('clearSearch');
        
        // Show/hide clear button
        if (searchValue) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
        
        // Debounce search
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filters.search = searchValue;
            currentPage = 1;
            loadTransactions();
        }, 300);
    };
    
    window.clearSearch = () => {
        const searchInput = document.getElementById('searchDescription');
        searchInput.value = '';
        document.getElementById('clearSearch').classList.add('hidden');
        filters.search = '';
        currentPage = 1;
        loadTransactions();
        searchInput.focus();
    };
    
    // Show transaction detail modal
    window.showTransactionDetailModal = async (transactionId) => {
        try {
            const tx = await API.transactions.get(transactionId);
            const modal = document.getElementById('transactionDetailModal');
            
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
                        
                        ${tx.debt_payment_id ? `
                            <div class="bg-error/10 border border-error/30 rounded-lg p-3">
                                <p class="text-xs text-error/70 mb-1 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                    Linked Debt Payment
                                </p>
                                <p class="font-semibold text-sm text-error">${tx.debt_name || 'Unknown Debt'}</p>
                                <p class="text-xs text-base-content/60 mt-1">This transaction is linked to a debt payment and cannot be relinked.</p>
                            </div>
                        ` : ''}
                        
                        <!-- Action Buttons - Always visible in modal for both mobile and desktop -->
                        <div class="flex gap-2 pt-3 border-t border-base-300 mt-3">
                            <button onclick="event.stopPropagation(); editTransaction(${tx.id}); transactionDetailModal.close();" class="btn btn-sm btn-ghost flex-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit
                            </button>
                            <button onclick="event.stopPropagation(); deleteTransaction(${tx.id}); transactionDetailModal.close();" class="btn btn-sm btn-ghost text-error flex-1">
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
            
            // Reset binding flag so backdrop-dismiss is re-applied after innerHTML replace
            modal.dataset.backdropBound = '';
            setupModalBackdropDismiss();
            modal.showModal();
        } catch (error) {
            console.error('Error loading transaction details:', error);
            Utils.showToast('Error loading transaction details', 'error');
        }
    };
    
    async function handleTransactionSubmit(e) {
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
            data.category_id = null; // No category for transfers
        } else {
            const catId = document.getElementById('categoryId').value;
            if (!catId) {
                Utils.showToast('Please select a category', 'error');
                return;
            }
            data.category_id = parseInt(catId);
            data.destination_account_id = null; // No destination for non-transfers
        }
        
        try {
            let savedTransaction;
            
            if (transactionId) {
                // Update existing transaction
                savedTransaction = await API.transactions.update(parseInt(transactionId), data);
                Utils.showToast('Transaction updated successfully', 'success');
            } else {
                // Create new transaction
                savedTransaction = await API.transactions.create(data);
                Utils.showToast('Transaction added successfully', 'success');
            }
            
            // Check if this should be linked to a debt (only for new transactions or unlinked transactions)
            const linkToDebt = document.getElementById('linkToDebt');
            const debtId = document.getElementById('debtId');
            
            // Only create debt payment if:
            // 1. Link to debt checkbox exists and is checked
            // 2. A debt is selected
            // 3. Transaction was saved successfully
            // 4. Transaction is not already linked to a debt (for updates)
            const shouldLinkToDebt = linkToDebt && linkToDebt.checked && debtId && debtId.value && savedTransaction;
            const isAlreadyLinked = transactionId && savedTransaction && savedTransaction.debt_payment_id;
            
            if (shouldLinkToDebt && !isAlreadyLinked) {
                // Create a debt payment linked to this transaction
                try {
                    await API.debts.addPayment(parseInt(debtId.value), {
                        amount: data.amount,
                        payment_date: data.date,
                        principal_amount: null,
                        interest_amount: null,
                        notes: data.notes || `Payment from transaction: ${data.description}`,
                        account_id: data.account_id,
                        transaction_id: savedTransaction.id,  // Link to the saved transaction
                        create_transaction: false  // Don't create duplicate transaction
                    });
                    Utils.showToast('Debt payment recorded successfully', 'success');
                } catch (debtError) {
                    console.error('Error creating debt payment:', debtError);
                    Utils.showToast('Transaction saved but debt payment failed', 'warning');
                }
            }

            // Link to recurring expense if selected
            const linkToRecurring = document.getElementById('linkToRecurring');
            const recurringExpenseId = document.getElementById('recurringExpenseId');
            if (linkToRecurring && linkToRecurring.checked && recurringExpenseId && recurringExpenseId.value && savedTransaction) {
                try {
                    await API.recurringExpenses.recordPayment(parseInt(recurringExpenseId.value), {
                        amount: data.amount,
                        payment_date: data.date,
                        transaction_id: savedTransaction.id,
                        notes: data.notes || null,
                    });
                    Utils.showToast('Recurring expense payment recorded', 'success');
                } catch (recurringError) {
                    console.error('Error recording recurring expense payment:', recurringError);
                    Utils.showToast('Transaction saved but recurring expense link failed', 'warning');
                }
            }

            transactionModal.close();
            e.target.reset();
            document.getElementById('transactionId').value = '';
            document.getElementById('modalTitle').textContent = 'Add Transaction';
            window.updateFormForTransactionType();
            toggleDebtSelect();  // Reset debt select visibility
            loadTransactions();
        } catch (error) {
            console.error('Error saving transaction:', error);
            Utils.showToast(error.message || 'Error saving transaction', 'error');
        }
    }
    
    window.editTransaction = async (id) => {
        try {
            const tx = await API.transactions.get(id);
            
            // Format date for input type="date" (YYYY-MM-DD)
            let formattedDate = tx.date;
            if (tx.date && typeof tx.date === 'string') {
                // Handle ISO date strings or date-only strings
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
                const searchInput = document.getElementById('categorySearch');
                if (searchInput) searchInput.value = '';
            } else {
                document.getElementById('categoryId').value = tx.category_id || '';
                // Pre-fill combobox search input with category name
                const catName = categories.find(c => c.id === tx.category_id)?.name || '';
                const searchInput = document.getElementById('categorySearch');
                if (searchInput) searchInput.value = catName;
            }
            
            // Handle debt payment linking
            const debtPaymentContainer = document.getElementById('debtPaymentContainer');
            
            if (tx.debt_payment_id && tx.debt_id && tx.debt_name) {
                // Transaction is already linked to a debt - show checkbox checked and debt selected
                if (debtPaymentContainer) {
                    debtPaymentContainer.innerHTML = `
                        <label class="label cursor-pointer justify-start gap-3">
                            <input type="checkbox" id="linkToDebt" class="checkbox checkbox-sm" checked disabled>
                            <span class="label-text font-medium">This is a debt payment</span>
                        </label>
                        <div id="debtSelectContainer" class="mt-2">
                            <label class="label py-1"><span class="label-text font-medium text-sm">Linked Debt</span></label>
                            <select id="debtId" name="debtId" class="select select-bordered w-full select-sm sm:select-md" disabled>
                                <option value="${tx.debt_id}" selected>${tx.debt_name}</option>
                            </select>
                            <label class="label">
                                <span class="label-text-alt text-warning">This transaction is linked to a debt payment. To change the debt association, delete this transaction and create a new one.</span>
                            </label>
                        </div>
                    `;
                }
            } else {
                // Reset debt payment container to original state
                if (debtPaymentContainer) {
                    debtPaymentContainer.innerHTML = `
                        <label class="label cursor-pointer justify-start gap-3">
                            <input type="checkbox" id="linkToDebt" class="checkbox checkbox-sm" onchange="toggleDebtSelect()">
                            <span class="label-text font-medium">This is a debt payment</span>
                        </label>
                        <div id="debtSelectContainer" class="mt-2 hidden">
                            <label class="label py-1"><span class="label-text font-medium text-sm">Select Debt</span></label>
                            <select id="debtId" name="debtId" class="select select-bordered w-full select-sm sm:select-md">
                                <option value="">Select a debt...</option>
                            </select>
                            <label class="label">
                                <span class="label-text-alt text-info">This will create a linked debt payment record</span>
                            </label>
                        </div>
                    `;
                    // Re-populate debt select
                    populateDebtSelect();
                }
            }
            
            // Update modal title and visibility
            document.getElementById('modalTitle').textContent = 'Edit Transaction';
            window.updateFormForTransactionType();
            
            transactionModal.showModal();
        } catch (error) {
            console.error('Error loading transaction:', error);
            Utils.showToast('Error loading transaction', 'error');
        }
    };
    
    window.deleteTransaction = async (id) => {
        if (!confirm('Are you sure you want to delete this transaction?')) return;
        
        try {
            await API.transactions.delete(id);
            Utils.showToast('Transaction deleted', 'success');
            loadTransactions();
        } catch (error) {
            Utils.showToast('Error deleting transaction', 'error');
        }
    };
});