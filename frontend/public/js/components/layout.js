/**
 * Layout Component - Main application layout with sidebar
 */

const Layout = {
    /**
     * Render the main layout
     * @param {string} activePage - Currently active page
     */
    render(activePage = 'dashboard') {
        const user = Auth.getUser();
        const app = document.getElementById('app');
        
        if (!app) return;
        
        app.innerHTML = `
            <div class="drawer lg:drawer-open">
                <input id="drawer-toggle" type="checkbox" class="drawer-toggle" />
                
                <div class="drawer-content flex flex-col min-h-screen">
                    <!-- Navbar -->
                    <div class="navbar bg-base-100 shadow-sm sticky top-0 z-30">
                        <div class="flex-none lg:hidden">
                            <label for="drawer-toggle" class="btn btn-square btn-ghost">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" 
                                     class="inline-block h-6 w-6 stroke-current">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </label>
                        </div>
                        <div class="flex-1">
                            <h1 class="text-xl font-bold px-4">${this.getPageTitle(activePage)}</h1>
                        </div>
                        <div class="flex-none gap-2">
                            <div class="dropdown dropdown-end">
                                <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
                                    <div class="w-10 rounded-full bg-primary text-primary-content flex items-center justify-center">
                                        <span class="text-lg font-bold">${user?.full_name?.[0] || 'U'}</span>
                                    </div>
                                </div>
                                <ul tabindex="0" class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow">
                                    <li class="menu-title">
                                        <span>${user?.full_name || 'User'}</span>
                                    </li>
                                    <li><a href="#" onclick="Layout.showProfileModal(); return false;">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        Profile
                                    </a></li>
                                    <li><a href="#" onclick="Layout.showSettingsModal(); return false;">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Settings
                                    </a></li>
                                    <div class="divider"></div>
                                    <li><a href="#" onclick="Auth.logout(); return false;" class="text-error">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        Logout
                                    </a></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Main content area -->
                    <main id="main-content" class="flex-1 p-4 lg:p-6">
                        <!-- Page content will be injected here -->
                    </main>
                </div>
                
                <!-- Sidebar -->
                <div class="drawer-side z-40">
                    <label for="drawer-toggle" class="drawer-overlay"></label>
                    <aside class="bg-base-100 w-60 min-h-full flex flex-col">
                        <div class="p-4">
                            <h2 class="text-2xl font-bold text-primary flex items-center gap-2">
                                <!--<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>-->
                                Home Finance
                            </h2>
                        </div>
                        
                        <nav class="flex-1 px-4 pb-4">
                            <ul class="menu menu-vertical gap-1">
                                ${this.renderNavItem('dashboard', 'Dashboard', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                    </svg>
                                `, activePage)}
                                
                                ${this.renderNavItem('transactions', 'Transactions', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                    </svg>
                                `, activePage)}
                                
                                ${this.renderNavItem('import', 'Import', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                `, activePage)}
                                
                                <li class="menu-title mt-4"><span>Management</span></li>
                                
                                ${this.renderNavItem('budgets', 'Budgets', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                `, activePage)}
                                
                                ${this.renderNavItem('accounts', 'Accounts', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                `, activePage)}
                                
                                ${this.renderNavItem('categories', 'Categories', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                `, activePage)}
                                
                                <li class="menu-title mt-4"><span>Analytics</span></li>
                                
                                ${this.renderNavItem('reports', 'Reports', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                `, activePage)}
                            </ul>
                        </nav>
                        
                        <div class="p-4 border-t border-base-300">
                            <div class="text-sm text-base-content/60">
                                <p>v1.0.0</p>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
            
            <!-- Profile Modal -->
            <dialog id="profileModal" class="modal">
                <div class="modal-box">
                    <h3 class="font-bold text-lg mb-4">Profile</h3>
                    <form id="profileForm" class="space-y-4">
                        <div class="form-control">
                            <label class="label"><span class="label-text">Full Name</span></label>
                            <input type="text" id="profileName" class="input input-bordered" value="${user?.full_name || ''}">
                        </div>
                        <div class="form-control">
                            <label class="label"><span class="label-text">Email</span></label>
                            <input type="email" id="profileEmail" class="input input-bordered" value="${user?.email || ''}" disabled>
                        </div>
                        <div class="modal-action">
                            <button type="button" class="btn" onclick="profileModal.close()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Changes</button>
                        </div>
                    </form>
                </div>
            </dialog>
        `;
        
        // Close drawer on mobile when clicking a link
        document.querySelectorAll('.drawer-side a').forEach(link => {
            link.addEventListener('click', () => {
                document.getElementById('drawer-toggle').checked = false;
            });
        });
    },

    /**
     * Render navigation item
     */
    renderNavItem(page, label, icon, activePage) {
        const isActive = page === activePage;
        return `
            <li>
                <a href="${page}.html" class="${isActive ? 'active' : ''}">
                    ${icon}
                    ${label}
                </a>
            </li>
        `;
    },

    /**
     * Get page title
     */
    getPageTitle(page) {
        const titles = {
            dashboard: 'Dashboard',
            transactions: 'Transactions',
            import: 'Import Transactions',
            budgets: 'Budgets',
            accounts: 'Accounts',
            categories: 'Categories',
            reports: 'Reports'
        };
        return titles[page] || 'Personal Finance';
    },

    /**
     * Show profile modal
     */
    showProfileModal() {
        document.getElementById('profileModal').showModal();
    },

    /**
     * Show settings modal
     */
    showSettingsModal() {
        Utils.showToast('Settings coming soon!', 'info');
    }
};

// Handle profile form submission
document.addEventListener('submit', (e) => {
    if (e.target.id === 'profileForm') {
        e.preventDefault();
        const name = document.getElementById('profileName').value;
        Auth.updateUser({ full_name: name });
        Utils.showToast('Profile updated successfully', 'success');
        profileModal.close();
    }
});

// Make Layout available globally
window.Layout = Layout;