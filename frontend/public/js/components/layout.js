/**
 * Layout Component - Main application layout with sidebar
 * Enhanced with DaisyUI 5.x classes and Tailwind CSS utilities
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
            <div class="drawer lg:drawer-open min-h-screen bg-base-200">
                <input id="drawer-toggle" type="checkbox" class="drawer-toggle" />
                
                <!-- Main content wrapper -->
                <div class="drawer-content flex flex-col min-h-screen">
                    <!-- Navbar -->
                    <header class="navbar bg-base-100 shadow-lg sticky top-0 z-40 border-b border-base-300 min-h-[3.5rem] lg:min-h-[4rem]">
                        <!-- Mobile hamburger -->
                        <div class="flex-none lg:hidden">
                            <label for="drawer-toggle" class="btn btn-ghost btn-square min-h-[2.75rem] min-w-[2.75rem]" aria-label="Open menu">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </label>
                        </div>
                        
                        <!-- Page title -->
                        <div class="flex-1 px-2 lg:px-4 min-w-0">
                            <h1 class="text-base lg:text-xl font-bold text-base-content truncate">
                                ${this.getPageTitle(activePage)}
                            </h1>
                        </div>
                        
                        <!-- Date Range Picker (Dashboard only) -->
                        ${activePage === 'dashboard' ? `
                        <div class="hidden md:flex items-center gap-2 px-4">
                            <input type="date" id="navStartDate" class="input input-bordered input-sm" value="${this.getDashboardDateRange ? this.getDashboardDateRange().startDate : ''}">
                            <span class="text-base-content/50 text-sm">-</span>
                            <input type="date" id="navEndDate" class="input input-bordered input-sm" value="${this.getDashboardDateRange ? this.getDashboardDateRange().endDate : ''}">
                            <button onclick="applyNavDateRange()" class="btn btn-primary btn-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                            <div class="dropdown dropdown-end">
                                <button class="btn btn-ghost btn-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </button>
                                <ul tabindex="0" class="dropdown-content menu menu-sm bg-base-100 rounded-box z-50 mt-3 w-40 p-2 shadow-xl border border-base-300">
                                    <li><a onclick="setNavDatePreset('today')">Today</a></li>
                                    <li><a onclick="setNavDatePreset('week')">This Week</a></li>
                                    <li><a onclick="setNavDatePreset('month')">This Month</a></li>
                                    <li><a onclick="setNavDatePreset('year')">This Year</a></li>
                                </ul>
                            </div>
                        </div>
                        ` : ''}
                        
                        <!-- Right side actions -->
                        <div class="flex-none gap-1 lg:gap-2">
                            <!-- Theme toggle -->
                            <button class="btn btn-ghost btn-square btn-sm lg:btn-md" onclick="Layout.toggleTheme()" title="Toggle theme">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            </button>
                            
                            <!-- User dropdown -->
                            <div class="dropdown dropdown-end">
                                <button tabindex="0" class="btn btn-ghost btn-circle avatar placeholder" title="User menu">
                                    <div class="bg-primary text-primary-content w-8 lg:w-10 rounded-full flex items-center justify-center">
                                        <span class="text-sm lg:text-lg font-bold">${user?.full_name?.[0]?.toUpperCase() || 'U'}</span>
                                    </div>
                                </button>
                                <ul tabindex="0" class="dropdown-content menu menu-sm bg-base-100 rounded-box z-50 mt-3 w-56 p-2 shadow-xl border border-base-300">
                                    <li class="menu-title px-2 py-1">
                                        <span class="text-xs uppercase opacity-70">Signed in as</span>
                                        <span class="font-medium text-sm">${user?.full_name || 'User'}</span>
                                        <span class="text-xs opacity-50 font-normal">${user?.email || ''}</span>
                                    </li>
                                    <div class="divider my-1"></div>
                                    <li>
                                        <a href="#" onclick="Layout.showProfileModal(); return false;" class="gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            Profile
                                        </a>
                                    </li>
                                    <li>
                                        <a href="#" onclick="Layout.showSettingsModal(); return false;" class="gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            Settings
                                        </a>
                                    </li>
                                    <div class="divider my-1"></div>
                                    <li>
                                        <a href="#" onclick="Auth.logout(); return false;" class="text-error gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            Logout
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </header>
                    
                    <!-- Main content area -->
                    <main id="main-content" class="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full">
                        <!-- Page content will be injected here -->
                    </main>
                    
                    <!-- Footer -->
                    <footer class="footer footer-center p-4 bg-base-100 text-base-content border-t border-base-300 mt-auto">
                        <aside class="flex items-center gap-2 text-sm">
                            <p>© 2026 Home Finance</p>
                            <span class="divider divider-horizontal divider-sm"></span>
                            <p class="opacity-60">v1.0.0</p>
                        </aside>
                    </footer>
                </div>
                
                <!-- Sidebar drawer -->
                <div class="drawer-side z-50">
                    <label for="drawer-toggle" class="drawer-overlay bg-black/50 backdrop-blur-sm"></label>
                    <aside class="bg-base-100 w-64 min-h-full flex flex-col shadow-2xl">
                        <!-- Branding -->
                        <div class="p-4 lg:p-6 border-b border-base-300">
                            <a href="dashboard.html" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                <div class="bg-primary text-primary-content w-10 h-10 rounded-xl flex items-center justify-center shadow-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 class="text-xl font-bold leading-tight">Home Finance</h2>
                                    <p class="text-xs opacity-60">Personal Finance Manager</p>
                                </div>
                            </a>
                        </div>
                        
                        <!-- Navigation -->
                        <nav class="flex-1 overflow-y-auto p-4">
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
                                
                                <li class="menu-title mt-4 mb-1"><span class="text-xs uppercase tracking-wider">Management</span></li>
                                
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
                                
                                <li class="menu-title mt-4 mb-1"><span class="text-xs uppercase tracking-wider">Analytics</span></li>
                                
                                ${this.renderNavItem('reports', 'Reports', `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                `, activePage)}
                            </ul>
                        </nav>
                    </aside>
                </div>
            </div>
            
            <!-- Profile Modal -->
            <dialog id="profileModal" class="modal modal-bottom sm:modal-middle">
                <div class="modal-box">
                    <h3 class="font-bold text-lg mb-1">Edit Profile</h3>
                    <p class="text-sm opacity-60 mb-4">Update your personal information</p>
                    
                    <form id="profileForm" class="space-y-4">
                        <div class="flex justify-center mb-4">
                            <div class="avatar placeholder">
                                <div class="bg-primary text-primary-content w-20 rounded-full flex items-center justify-center shadow-lg">
                                    <span class="text-3xl font-bold">${user?.full_name?.[0]?.toUpperCase() || 'U'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend text-sm">Full Name</legend>
                            <input type="text" id="profileName" class="input input-bordered w-full" value="${user?.full_name || ''}" placeholder="Enter your full name" />
                        </fieldset>
                        
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend text-sm">Email</legend>
                            <input type="email" id="profileEmail" class="input input-bordered w-full" value="${user?.email || ''}" disabled />
                            <p class="fieldset-label text-xs opacity-50">Email cannot be changed</p>
                        </fieldset>
                        
                        <div class="modal-action">
                            <button type="button" class="btn btn-ghost" onclick="profileModal.close()">Cancel</button>
                            <button type="submit" class="btn btn-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                </svg>
                                Save Changes
                            </button>
                        </div>
                    </form>
                </div>
                <form method="dialog" class="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
            
            <!-- Settings Modal -->
            <dialog id="settingsModal" class="modal modal-middle sm:modal-middle">
                <div class="modal-box">
                    <h3 class="font-bold text-lg mb-1">Settings</h3>
                    <p class="text-sm opacity-60 mb-4">Customize your experience</p>
                    
                    <div class="space-y-4">
                        <div class="card bg-base-200">
                            <div class="card-body p-4">
                                <h4 class="card-title text-sm">Appearance</h4>
                                <div class="form-control">
                                    <label class="label cursor-pointer">
                                        <span class="label-text">Dark Mode</span>
                                        <input type="checkbox" class="toggle toggle-primary" ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'checked' : ''} onchange="Layout.toggleTheme()" />
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card bg-base-200">
                            <div class="card-body p-4">
                                <h4 class="card-title text-sm">Notifications</h4>
                                <div class="form-control">
                                    <label class="label cursor-pointer">
                                        <span class="label-text">Email Notifications</span>
                                        <input type="checkbox" class="toggle toggle-primary" checked />
                                    </label>
                                </div>
                                <div class="form-control">
                                    <label class="label cursor-pointer">
                                        <span class="label-text">Budget Alerts</span>
                                        <input type="checkbox" class="toggle toggle-primary" checked />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-action">
                        <button type="button" class="btn btn-ghost" onclick="settingsModal.close()">Close</button>
                        <button type="button" class="btn btn-primary" onclick="Layout.saveSettings()">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Save Settings
                        </button>
                    </div>
                </div>
                <form method="dialog" class="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        `;
        
        // Close drawer on mobile when clicking a nav link
        document.querySelectorAll('.drawer-side a').forEach(link => {
            link.addEventListener('click', (e) => {
                // Only close if it's a navigation link (has href with .html)
                if (link.getAttribute('href')?.endsWith('.html')) {
                    document.getElementById('drawer-toggle').checked = false;
                }
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
                <a href="${page}.html" class="${isActive ? 'active bg-primary text-primary-content font-medium shadow-md' : 'hover:bg-base-200'} gap-3 py-3 rounded-lg transition-all">
                    ${icon}
                    <span>${label}</span>
                    ${isActive ? '<span class="ml-auto badge badge-sm badge-ghost">●</span>' : ''}
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
        document.getElementById('settingsModal').showModal();
    },

    /**
     * Toggle dark/light theme
     */
    toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark-fin' ? 'light-fin' : 'dark-fin';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    },

    /**
     * Initialize theme from localStorage
     */
    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
    },

    /**
     * Save settings
     */
    saveSettings() {
        Utils.showToast('Settings saved successfully', 'success');
        document.getElementById('settingsModal').close();
    },

    /**
     * Get dashboard date range (for navbar date picker)
     * This is populated by dashboard.js
     */
    getDashboardDateRange() {
        if (window.dashboardDateRange) {
            return window.dashboardDateRange;
        }
        // Default to current month
        const today = new Date();
        return {
            startDate: today.toISOString().split('T')[0].substring(0, 8) + '01',
            endDate: today.toISOString().split('T')[0]
        };
    },

    /**
     * Update navbar date inputs
     */
    updateNavbarDateInputs(startDate, endDate) {
        const startInput = document.getElementById('navStartDate');
        const endInput = document.getElementById('navEndDate');
        if (startInput && endInput) {
            startInput.value = startDate;
            endInput.value = endDate;
        }
    }
};

// Global functions for navbar date picker
window.applyNavDateRange = function() {
    const startDate = document.getElementById('navStartDate')?.value;
    const endDate = document.getElementById('navEndDate')?.value;
    
    if (!startDate || !endDate) {
        Utils.showToast('Please select both start and end dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        Utils.showToast('Start date cannot be after end date', 'error');
        return;
    }
    
    if (window.setDashboardDateRange) {
        window.setDashboardDateRange(startDate, endDate);
    }
};

window.setNavDatePreset = function(preset) {
    const today = new Date();
    let startDate, endDate;
    
    switch (preset) {
        case 'today':
            startDate = today.toISOString().split('T')[0];
            endDate = startDate;
            break;
        case 'week':
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            startDate = weekStart.toISOString().split('T')[0];
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            endDate = weekEnd.toISOString().split('T')[0];
            break;
        case 'month':
            startDate = Utils.getFirstDayOfMonth();
            endDate = Utils.getLastDayOfMonth();
            break;
        case 'year':
            startDate = `${today.getFullYear()}-01-01`;
            endDate = `${today.getFullYear()}-12-31`;
            break;
        default:
            return;
    }
    
    Layout.updateNavbarDateInputs(startDate, endDate);
    
    if (window.setDashboardDateRange) {
        window.setDashboardDateRange(startDate, endDate);
    }
};

// Initialize theme on load
Layout.initTheme();

// Handle profile form submission
document.addEventListener('submit', (e) => {
    if (e.target.id === 'profileForm') {
        e.preventDefault();
        const name = document.getElementById('profileName').value;
        if (name.trim()) {
            Auth.updateUser({ full_name: name });
            Utils.showToast('Profile updated successfully', 'success');
            profileModal.close();
            // Re-render to update avatar initials
            Layout.render(document.querySelector('.menu a.active')?.getAttribute('href')?.replace('.html', '') || 'dashboard');
        }
    }
});

// Close modals on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const profileModal = document.getElementById('profileModal');
        const settingsModal = document.getElementById('settingsModal');
        if (profileModal?.open) profileModal.close();
        if (settingsModal?.open) settingsModal.close();
    }
});

// Make Layout available globally
window.Layout = Layout;