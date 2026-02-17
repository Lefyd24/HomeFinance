/**
 * Accounts page controller
 */

// State (global for this module)
let accounts = [];

// Global functions for onclick handlers
window.editAccount = (id) => {
    Utils.showToast('Edit functionality coming soon!', 'info');
};

window.viewTransactions = (id) => {
    window.location.href = `transactions.html?account_id=${id}`;
};

window.deleteAccount = async (id) => {
    if (!confirm('Are you sure you want to delete this account? This will not delete associated transactions.')) return;
    
    try {
        await API.accounts.delete(id);
        Utils.showToast('Account deleted', 'success');
        accounts = accounts.filter(a => a.id !== id);
        renderAccounts();
        renderSummary();
    } catch (error) {
        Utils.showToast('Error deleting account', 'error');
    }
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
                <button onclick="accountModal.showModal()" class="btn btn-primary">
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
                            <div class="text-3xl mb-2">🏦</div>
                            <div class="font-medium">Checking</div>
                            <div class="text-sm text-base-content/60">Everyday spending</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="text-3xl mb-2">💰</div>
                            <div class="font-medium">Savings</div>
                            <div class="text-sm text-base-content/60">Money set aside</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="text-3xl mb-2">💳</div>
                            <div class="font-medium">Credit Card</div>
                            <div class="text-sm text-base-content/60">Credit accounts</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="text-3xl mb-2">💵</div>
                            <div class="font-medium">Cash</div>
                            <div class="text-sm text-base-content/60">Physical money</div>
                        </div>
                        <div class="text-center p-4 bg-base-200 rounded-lg">
                            <div class="text-3xl mb-2">📈</div>
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
            await API.accounts.create(data);
            Utils.showToast('Account created successfully', 'success');
            accountModal.close();
            e.target.reset();
            
            // Reload accounts
            accounts = await API.accounts.list();
            renderAccounts();
            renderSummary();
            
        } catch (error) {
            Utils.showToast('Error creating account', 'error');
        }
    }
});