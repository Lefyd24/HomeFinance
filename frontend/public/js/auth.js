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
     * Decode a JWT without verifying signature (client-side only).
     * @param {string} token
     * @returns {Object|null}
     */
    _decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        } catch {
            return null;
        }
    },

    /**
     * Returns seconds until the access token expires, or 0 if already expired/missing.
     */
    _tokenSecondsRemaining() {
        const token = localStorage.getItem('token');
        if (!token) return 0;
        const payload = this._decodeToken(token);
        if (!payload || !payload.exp) return 0;
        return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
    },

    /**
     * Silently refresh the access token using the stored refresh token.
     * Updates localStorage and schedules the next refresh.
     */
    async _silentRefresh() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) return;

        try {
            const response = await fetch(
                `${window.API ? API.baseURL : ''}/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`,
                { method: 'POST' }
            );
            if (!response.ok) return;
            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('refresh_token', data.refresh_token);
            }
            // Schedule the next refresh
            this._scheduleTokenRefresh();
        } catch {
            // Silent — the next API call will handle 401 if needed
        }
    },

    /**
     * Schedule a proactive token refresh 5 minutes before expiry.
     * Call this once after login and after each refresh.
     */
    _scheduleTokenRefresh() {
        const remaining = this._tokenSecondsRemaining();
        if (remaining <= 0) return;

        const refreshIn = Math.max(0, remaining - 5 * 60) * 1000; // 5 min before expiry
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this._silentRefresh(), refreshIn);
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

            // Proactively refresh before expiry so the session never visibly expires
            this._scheduleTokenRefresh();

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

// Check auth on protected pages and (re)start proactive token refresh
document.addEventListener('DOMContentLoaded', () => {
    const protectedPages = [
        'dashboard.html', 'transactions.html', 'budgets.html',
        'import.html', 'reports.html', 'accounts.html', 'categories.html',
        'goals.html', 'debts.html', 'recurring.html', 'analytics.html',
        'advisor.html', 'documents.html', 'settings.html',
    ];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
        if (!Auth.requireAuth()) return;
        // Resume proactive refresh for already-authenticated users
        Auth._scheduleTokenRefresh();
    }
});