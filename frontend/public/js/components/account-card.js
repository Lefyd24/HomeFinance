/**
 * Account Card Component
 * Renders a single account card
 */

const AccountCard = {
    /**
     * Render an account card
     * @param {Object} account - Account data object
     * @returns {string} HTML string
     */
    render(account) {
        const typeIcons = {
            checking: '🏦',
            savings: '💰',
            credit: '💳',
            cash: '💵',
            investment: '📈'
        };

        const icon = typeIcons[account.type] || '🏦';
        const balance = parseFloat(account.balance || 0);

        return `
            <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
                <div class="card-body">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3">
                            <div class="text-3xl">${icon}</div>
                            <div>
                                <h3 class="card-title">${account.name}</h3>
                                <p class="text-sm text-base-content/60 capitalize">${account.type} • ${account.currency}</p>
                            </div>
                        </div>
                        <div class="dropdown dropdown-end">
                            <label tabindex="0" class="btn btn-ghost btn-sm btn-circle">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                            </label>
                            <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-32 z-50">
                                <li><a href="#" onclick="editAccount(${account.id}); return false;">Edit</a></li>
                                <li><a href="#" onclick="viewTransactions(${account.id}); return false;">Transactions</a></li>
                                <div class="divider my-1"></div>
                                <li><a href="#" onclick="deleteAccount(${account.id}); return false;" class="text-error">Delete</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="mt-4">
                        <p class="text-sm text-base-content/60">Current Balance</p>
                        <p class="text-3xl font-bold">${Utils.formatCurrency(balance, account.currency)}</p>
                    </div>
                    
                    ${account.description ? `
                        <p class="text-sm text-base-content/60 mt-2">${account.description}</p>
                    ` : ''}
                    
                    <div class="card-actions justify-end mt-4">
                        <a href="transactions.html?account_id=${account.id}" class="btn btn-sm btn-ghost">
                            View Transactions
                        </a>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render multiple account cards
     * @param {Array} accounts - Array of account objects
     * @returns {string} HTML string
     */
    renderAll(accounts) {
        if (accounts.length === 0) {
            return `
                <div class="col-span-full text-center py-12">
                    <p class="text-base-content/60">No accounts created yet</p>
                    <button onclick="accountModal.showModal()" class="btn btn-primary mt-4">
                        Add your first account
                    </button>
                </div>
            `;
        }

        return accounts.map(account => this.render(account)).join('');
    }
};
