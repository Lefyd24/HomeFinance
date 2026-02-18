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
            checking: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>`,
            savings: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
            credit: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 11V7a2 2 0 012-2h6a2 2 0 012 2v4" /></svg>`,
            cash: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>`,
            investment: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`,
            loan: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`
        };

        // Use custom icon if available, otherwise use default type icon
        let icon;
        if (account.icon) {
            icon = `<img src="../assets/icons/banks/${account.icon}" alt="${account.name}" class="h-8 w-8 object-contain rounded">`;
        } else {
            icon = typeIcons[account.type] || typeIcons.checking;
        }
        const balance = parseFloat(account.balance || 0);

        return `
            <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
                <div class="card-body">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3">
                            <div class="p-2 rounded-lg bg-primary/10 text-primary">${icon}</div>
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
