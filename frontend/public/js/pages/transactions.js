/**
 * Transactions page controller
 */

// State (global for this module)
let transactions = [];
let accounts = [];
let categories = [];
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
    
    // Reset category dropdown
    document.getElementById('categoryId').value = '';
    
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
    
    // Setup form submission (modal is in HTML, not dynamically rendered)
    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleTransactionSubmit);
    }
    
    // Setup type change handler
    const transactionType = document.getElementById('transactionType');
    if (transactionType) {
        transactionType.addEventListener('change', window.updateFormForTransactionType);
    }
    
    async function initialize() {
        try {
            // Load accounts and categories
            accounts = await API.accounts.list();
            categories = await API.categories.list();
            
            // Render the actual content structure (replacing skeleton)
            const mainContent = document.getElementById('main-content');
            mainContent.innerHTML = `
                <div class="space-y-4 md:space-y-6">
                    <!-- Header -->
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold">Transactions</h2>
                            <p class="text-sm text-base-content/60">Manage your income and expenses</p>
                        </div>
                        <button onclick="openTransactionModal()" class="btn btn-primary btn-sm md:btn-md w-full sm:w-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 md:h-5 md:w-5 mr-1 md:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                            <span class="hidden sm:inline">Add Transaction</span>
                            <span class="sm:hidden">Add</span>
                        </button>
                    </div>
                    
                    <!-- Search Bar -->
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-3 md:p-4">
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input type="text" id="searchDescription" class="input input-bordered w-full pl-10 input-sm md:input-md" placeholder="Search by description..." onkeyup="handleSearch(event)">
                                <button id="clearSearch" class="absolute inset-y-0 right-0 pr-3 flex items-center hidden" onclick="clearSearch()">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40 hover:text-base-content" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Filters -->
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-3 md:p-4">
                            <div class="flex flex-wrap gap-2 md:gap-4">
                                <div class="form-control w-full sm:w-auto flex-1 sm:flex-none min-w-[140px]">
                                    <label class="label py-1"><span class="label-text text-xs md:text-sm">From Date</span></label>
                                    <input type="date" id="filterFromDate" class="input input-bordered input-sm w-full">
                                </div>
                                <div class="form-control w-full sm:w-auto flex-1 sm:flex-none min-w-[140px]">
                                    <label class="label py-1"><span class="label-text text-xs md:text-sm">To Date</span></label>
                                    <input type="date" id="filterToDate" class="input input-bordered input-sm w-full">
                                </div>
                                <div class="form-control w-full sm:w-auto flex-1 sm:flex-none min-w-[140px]">
                                    <label class="label py-1"><span class="label-text text-xs md:text-sm">Account</span></label>
                                    <select id="filterAccount" class="select select-bordered select-sm w-full">
                                        <option value="">All Accounts</option>
                                    </select>
                                </div>
                                <div class="form-control w-full sm:w-auto flex-1 sm:flex-none min-w-[140px]">
                                    <label class="label py-1"><span class="label-text text-xs md:text-sm">Category</span></label>
                                    <select id="filterCategory" class="select select-bordered select-sm w-full">
                                        <option value="">All Categories</option>
                                    </select>
                                </div>
                                <div class="form-control w-full sm:w-auto flex-1 sm:flex-none min-w-[120px]">
                                    <label class="label py-1"><span class="label-text text-xs md:text-sm">Type</span></label>
                                    <select id="filterType" class="select select-bordered select-sm w-full">
                                        <option value="">All Types</option>
                                        <option value="income">Income</option>
                                        <option value="expense">Expense</option>
                                        <option value="transfer">Transfer</option>
                                    </select>
                                </div>
                                <div class="form-control flex items-end w-full sm:w-auto">
                                    <button onclick="applyFilters()" class="btn btn-sm btn-primary w-full sm:w-auto">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                        </svg>
                                        <span class="hidden sm:inline">Apply</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Transactions Table -->
                    <div class="card bg-base-100 shadow-xl">
                        <div class="card-body p-3 md:p-6">
                            <div id="transactionsTable"></div>
                            
                            <!-- Pagination -->
                            <div id="pagination" class="flex justify-center mt-4"></div>
                        </div>
                    </div>
                </div>
            `;
            
            // Populate filters
            populateFilterSelects();
            
            // Populate modal selects
            populateModalSelects();
            
            // Set default date filters
            document.getElementById('filterFromDate').value = Utils.getFirstDayOfMonth();
            document.getElementById('filterToDate').value = Utils.getLastDayOfMonth();
            
            // Check for URL parameters and apply as initial filter
            const urlParams = new URLSearchParams(window.location.search);
            const accountIdParam = urlParams.get('account_id');
            const categoryIdParam = urlParams.get('category_id');
            const typeParam = urlParams.get('type');
            
            if (accountIdParam) {
                document.getElementById('filterAccount').value = accountIdParam;
            }
            if (categoryIdParam) {
                document.getElementById('filterCategory').value = categoryIdParam;
            }
            if (typeParam) {
                document.getElementById('filterType').value = typeParam;
            }
            
            // Clean up URL - remove query parameters
            if (window.history.replaceState) {
                window.history.replaceState({}, '', window.location.pathname);
            }
            
            // Set initial filters from URL params or defaults
            filters = {
                start_date: document.getElementById('filterFromDate').value,
                end_date: document.getElementById('filterToDate').value,
                account_id: document.getElementById('filterAccount').value,
                category_id: document.getElementById('filterCategory').value,
                type: document.getElementById('filterType').value
            };
            currentPage = 1;
            
            // Load transactions with initial filters
            await loadTransactions();
            
        } catch (error) {
            console.error('Error initializing:', error);
            Utils.showToast('Error loading data', 'error');
        }
    }
    
    function populateFilterSelects() {
        const accountSelect = document.getElementById('filterAccount');
        const categorySelect = document.getElementById('filterCategory');
        
        accounts.forEach(acc => {
            accountSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
        });
        
        // Group categories by type for filter dropdown
        const incomeCats = categories.filter(c => c.type === 'income');
        const expenseCats = categories.filter(c => c.type === 'expense');
        const transferCats = categories.filter(c => c.type === 'transfer');
        
        let categoryHtml = '<option value="">All Categories</option>';
        
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
    
    function populateModalSelects() {
        const accountSelect = document.getElementById('accountId');
        const destinationSelect = document.getElementById('destinationAccountId');
        const categorySelect = document.getElementById('categoryId');

        // Clear existing options except the first one
        accountSelect.innerHTML = '<option value="">Select Account</option>';
        destinationSelect.innerHTML = '<option value="">Select Destination Account</option>';

        accounts.forEach(acc => {
            accountSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
            destinationSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
        });

        // Build category select with optgroups
        let categoryHtml = '<option value="">Select Category</option>';
        
        // Group categories by type
        const incomeCats = categories.filter(c => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name));
        const expenseCats = categories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name));
        const transferCats = categories.filter(c => c.type === 'transfer').sort((a, b) => a.name.localeCompare(b.name));
        
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
            <div class="overflow-x-auto -mx-3 md:mx-0">
                <table class="table w-full">
                    <thead>
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
                                        <span class="text-xs md:text-sm font-medium truncate" title="${tx.description}">${tx.description}</span>
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
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        let pages = '';
        for (let i = 1; i <= totalPages; i++) {
            pages += `
                <button onclick="goToPage(${i})" class="btn btn-sm ${i === currentPage ? 'btn-active' : ''}">${i}</button>
            `;
        }
        
        container.innerHTML = `
            <div class="join">
                <button onclick="goToPage(${currentPage - 1})" class="join-item btn btn-sm" ${currentPage === 1 ? 'disabled' : ''}>«</button>
                ${pages}
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
            if (transactionId) {
                // Update existing transaction
                await API.transactions.update(parseInt(transactionId), data);
                Utils.showToast('Transaction updated successfully', 'success');
            } else {
                // Create new transaction
                await API.transactions.create(data);
                Utils.showToast('Transaction added successfully', 'success');
            }
            
            transactionModal.close();
            e.target.reset();
            document.getElementById('transactionId').value = '';
            document.getElementById('modalTitle').textContent = 'Add Transaction';
            window.updateFormForTransactionType();
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
            } else {
                document.getElementById('categoryId').value = tx.category_id || '';
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