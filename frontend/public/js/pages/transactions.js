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
    
    // Render page content
    mainContent.innerHTML = `
        <div class="space-y-6">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 class="text-2xl font-bold">Transactions</h2>
                    <p class="text-base-content/60">Manage your income and expenses</p>
                </div>
                <button onclick="openTransactionModal()" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Transaction
                </button>
            </div>
            
            <!-- Filters -->
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body">
                    <div class="flex flex-wrap gap-4">
                        <div class="form-control">
                            <label class="label"><span class="label-text">From Date</span></label>
                            <input type="date" id="filterFromDate" class="input input-bordered input-sm">
                        </div>
                        <div class="form-control">
                            <label class="label"><span class="label-text">To Date</span></label>
                            <input type="date" id="filterToDate" class="input input-bordered input-sm">
                        </div>
                        <div class="form-control">
                            <label class="label"><span class="label-text">Account</span></label>
                            <select id="filterAccount" class="select select-bordered select-sm">
                                <option value="">All Accounts</option>
                            </select>
                        </div>
                        <div class="form-control">
                            <label class="label"><span class="label-text">Category</span></label>
                            <select id="filterCategory" class="select select-bordered select-sm">
                                <option value="">All Categories</option>
                            </select>
                        </div>
                        <div class="form-control">
                            <label class="label"><span class="label-text">Type</span></label>
                            <select id="filterType" class="select select-bordered select-sm">
                                <option value="">All Types</option>
                                <option value="income">Income</option>
                                <option value="expense">Expense</option>
                                <option value="transfer">Transfer</option>
                            </select>
                        </div>
                        <div class="form-control flex items-end">
                            <button onclick="applyFilters()" class="btn btn-sm btn-primary">Apply Filters</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Transactions Table -->
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div id="transactionsTable"></div>
                    
                    <!-- Pagination -->
                    <div id="pagination" class="flex justify-center mt-4"></div>
                </div>
            </div>
        </div>
    `;
    
    // Initialize
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
        
        categories.forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    }
    
    function populateModalSelects() {
        const accountSelect = document.getElementById('accountId');
        const destinationSelect = document.getElementById('destinationAccountId');
        const categorySelect = document.getElementById('categoryId');
        
        // Clear existing options except the first one
        accountSelect.innerHTML = '<option value="">Select Account</option>';
        destinationSelect.innerHTML = '<option value="">Select Destination Account</option>';
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        
        accounts.forEach(acc => {
            accountSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
            destinationSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
        });
        
        categories.forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
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
                <div class="text-center py-12">
                    <p class="text-base-content/60">No transactions found</p>
                    <button onclick="openTransactionModal()" class="btn btn-primary mt-4">
                        Add your first transaction
                    </button>
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
                            <th class="text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map(tx => `
                            <tr class="hover">
                                <td>${Utils.formatDate(tx.date)}</td>
                                <td>${tx.description}</td>
                                <td>
                                    ${tx.type === 'transfer' 
                                        ? '<span class="badge badge-sm badge-info">Transfer</span>' 
                                        : `<span class="badge badge-sm" style="background-color: ${tx.category_color || 'var(--fallback-bc, oklch(var(--bc)))'}20; color: ${tx.category_color || 'inherit'};">${tx.category_name}</span>`
                                    }
                                </td>
                                <td>
                                    ${tx.type === 'transfer' 
                                        ? `${tx.account_name} → ${tx.destination_account_name}` 
                                        : tx.account_name
                                    }
                                </td>
                                <td class="text-right font-bold ${tx.type === 'income' ? 'text-success' : tx.type === 'transfer' ? 'text-info' : 'text-error'}">
                                    ${tx.type === 'income' ? '+' : tx.type === 'transfer' ? '⇄' : '-'}${Utils.formatCurrency(tx.amount)}
                                </td>
                                <td class="text-center">
                                    <div class="dropdown dropdown-end">
                                        <label tabindex="0" class="btn btn-ghost btn-xs">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                            </svg>
                                        </label>
                                        <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-32 z-50">
                                            <li><a href="#" onclick="editTransaction(${tx.id}); return false;">Edit</a></li>
                                            <li><a href="#" onclick="deleteTransaction(${tx.id}); return false;" class="text-error">Delete</a></li>
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
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
            type: document.getElementById('filterType').value
        };
        currentPage = 1;
        loadTransactions();
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
            
            // Populate form
            document.getElementById('transactionId').value = tx.id;
            document.getElementById('transactionType').value = tx.type;
            document.getElementById('amount').value = tx.amount;
            document.getElementById('accountId').value = tx.account_id;
            document.getElementById('description').value = tx.description;
            document.getElementById('transactionDate').value = tx.date;
            document.getElementById('notes').value = tx.notes || '';
            
            // Handle transfer-specific fields
            if (tx.type === 'transfer') {
                document.getElementById('destinationAccountId').value = tx.destination_account_id || '';
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