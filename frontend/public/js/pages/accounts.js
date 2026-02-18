/**
 * Accounts page controller
 */

// State (global for this module)
let accounts = [];
let editingAccountId = null;

// Global functions for onclick handlers
window.editAccount = async (id) => {
    const account = accounts.find(a => a.id === id);
    if (!account) {
        Utils.showToast('Account not found', 'error');
        return;
    }
    
    // Set editing mode
    editingAccountId = id;
    
    // Populate form with account data
    document.getElementById('accountName').value = account.name;
    document.getElementById('accountType').value = account.type;
    document.getElementById('currency').value = account.currency;
    document.getElementById('balance').value = parseFloat(account.balance || 0);
    document.getElementById('accountDescription').value = account.description || '';
    
    // Update modal title
    document.querySelector('#accountModal h3').textContent = 'Edit Account';
    document.querySelector('#accountForm button[type="submit"]').textContent = 'Update Account';
    
    // Show modal
    accountModal.showModal();
};

window.viewTransactions = (id) => {
    window.location.href = `transactions.html?account_id=${id}`;
};

window.deleteAccount = async (id) => {
    const account = accounts.find(a => a.id === id);
    const accountName = account ? account.name : 'this account';
    
    if (!confirm(`WARNING: You are about to delete "${accountName}" and ALL associated transactions. This action cannot be undone.\n\nAre you sure you want to proceed?`)) {
        return;
    }
    
    try {
        const result = await API.accounts.delete(id);
        const deletedTransactions = result.deleted_transactions || 0;
        Utils.showToast(`Account deleted (${deletedTransactions} transactions removed)`, 'success');
        accounts = accounts.filter(a => a.id !== id);
        renderAccounts();
        renderSummary();
    } catch (error) {
        Utils.showToast('Error deleting account', 'error');
    }
};

// Reset modal to add mode
window.resetAccountModal = () => {
    editingAccountId = null;
    document.getElementById('accountForm').reset();
    document.querySelector('#accountModal h3').textContent = 'Add Account';
    document.querySelector('#accountForm button[type="submit"]').textContent = 'Save Account';
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('accounts');
    
    // Get main content container
    const mainContent = document.getElementById('main-content');
    
    // Render page content
    mainContent.innerHTML = `
        <div class="space-y-6">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 class="text-2xl font-bold">Accounts</h2>
                    <p class="text-base-content/60">Manage your bank accounts, cards, and cash</p>
                </div>
                <button onclick="resetAccountModal(); accountModal.showModal()" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Account
                </button>
            </div>
            
            <!-- Accounts Summary -->
            <div id="accountsSummary"></div>
            
            <!-- Accounts Grid -->
            <div id="accountsGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Account cards will be inserted here -->
            </div>
            
            <!-- Account Types Info -->
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body">
                    <h3 class="card-title">Account Types</h3>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="inline-flex p-2 rounded-lg bg-primary/10 text-primary mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                            </div>
                            <div class="font-medium">Checking</div>
                            <div class="text-sm text-base-content/60">Everyday spending</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="inline-flex p-2 rounded-lg bg-success/10 text-success mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div class="font-medium">Savings</div>
                            <div class="text-sm text-base-content/60">Money set aside</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="inline-flex p-2 rounded-lg bg-error/10 text-error mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 11V7a2 2 0 012-2h6a2 2 0 012 2v4" /></svg>
                            </div>
                            <div class="font-medium">Credit Card</div>
                            <div class="text-sm text-base-content/60">Credit accounts</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="inline-flex p-2 rounded-lg bg-warning/10 text-warning mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            <div class="font-medium">Cash</div>
                            <div class="text-sm text-base-content/60">Physical money</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="inline-flex p-2 rounded-lg bg-info/10 text-info mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            </div>
                            <div class="font-medium">Investment</div>
                            <div class="text-sm text-base-content/60">Stocks, crypto</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Initialize
    await initialize();
    
    // Setup form submission
    document.getElementById('accountForm').addEventListener('submit', handleAccountSubmit);
    
    async function initialize() {
        try {
            accounts = await API.accounts.list();
            renderAccounts();
            renderSummary();
        } catch (error) {
            console.error('Error initializing:', error);
            Utils.showToast('Error loading accounts', 'error');
        }
    }
    
    function renderAccounts() {
        const container = document.getElementById('accountsGrid');
        container.innerHTML = AccountCard.renderAll(accounts);
    }
    
    function renderSummary() {
        const container = document.getElementById('accountsSummary');
        
        // Parse balances as they come as strings from API (SQLAlchemy Decimal)
        const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
        const totalAccounts = accounts.length;
        const activeAccounts = accounts.filter(a => a.is_active !== false).length;
        
        // Group by type
        const byType = accounts.reduce((acc, account) => {
            acc[account.type] = (acc[account.type] || 0) + parseFloat(account.balance || 0);
            return acc;
        }, {});
        
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Total Balance</p>
                        <p class="text-2xl font-bold">${Utils.formatCurrency(totalBalance)}</p>
                    </div>
                </div>
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Total Accounts</p>
                        <p class="text-2xl font-bold">${totalAccounts}</p>
                    </div>
                </div>
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Active Accounts</p>
                        <p class="text-2xl font-bold">${activeAccounts}</p>
                    </div>
                </div>
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Account Types</p>
                        <p class="text-2xl font-bold">${Object.keys(byType).length}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    async function handleAccountSubmit(e) {
        e.preventDefault();
        
        const data = {
            name: document.getElementById('accountName').value,
            type: document.getElementById('accountType').value,
            currency: document.getElementById('currency').value,
            balance: parseFloat(document.getElementById('balance').value) || 0,
            description: document.getElementById('accountDescription').value
        };
        
        try {
            if (editingAccountId) {
                // Update existing account
                await API.accounts.update(editingAccountId, data);
                Utils.showToast('Account updated successfully', 'success');
            } else {
                // Create new account
                await API.accounts.create(data);
                Utils.showToast('Account created successfully', 'success');
            }
            
            accountModal.close();
            e.target.reset();
            editingAccountId = null;
            
            // Reset modal title
            document.querySelector('#accountModal h3').textContent = 'Add Account';
            document.querySelector('#accountForm button[type="submit"]').textContent = 'Save Account';
            
            // Reload accounts
            accounts = await API.accounts.list();
            renderAccounts();
            renderSummary();
            
        } catch (error) {
            Utils.showToast(editingAccountId ? 'Error updating account' : 'Error creating account', 'error');
        }
    }
});
