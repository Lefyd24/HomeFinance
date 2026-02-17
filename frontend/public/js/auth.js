/**
 * Authentication module
 */

const Auth = {
    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!localStorage.getItem('token');
    },

    /**
     * Get current user
     * @returns {Object|null}
     */
    getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    /**
     * Login user
     * @param {string} email
     * @param {string} password
     * @returns {Promise}
     */
    async login(email, password) {
        try {
            const response = await API.auth.login(email, password);
            
            // Store tokens
            localStorage.setItem('token', response.access_token);
            if (response.refresh_token) {
                localStorage.setItem('refresh_token', response.refresh_token);
            }
            
            // Fetch user data separately
            const userData = await API.auth.me();
            localStorage.setItem('user', JSON.stringify(userData));
            
            return { ...response, user: userData };
        } catch (error) {
            throw error;
        }
    },

    /**
     * Register user
     * @param {Object} userData
     * @returns {Promise}
     */
    async register(userData) {
        try {
            const response = await API.auth.register(userData);
            return response;
        } catch (error) {
            throw error;
        }
    },

    /**
     * Logout user
     */
    async logout() {
        try {
            await API.auth.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            window.location.href = '/index.html';
        }
    },

    /**
     * Require authentication (redirect to login if not authenticated)
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/index.html';
            return false;
        }
        return true;
    },

    /**
     * Update user info
     * @param {Object} userData
     */
    updateUser(userData) {
        const current = this.getUser() || {};
        const updated = { ...current, ...userData };
        localStorage.setItem('user', JSON.stringify(updated));
    }
};

// Make Auth available globally
window.Auth = Auth;

// Check auth on protected pages
document.addEventListener('DOMContentLoaded', () => {
    const protectedPages = ['dashboard.html', 'transactions.html', 'budgets.html', 
                           'import.html', 'reports.html', 'accounts.html', 'categories.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage)) {
        Auth.requireAuth();
    }
});