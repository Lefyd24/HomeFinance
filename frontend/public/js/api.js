/**
 * API Client for Personal Finance App
 * All API calls go through this module
 */

const API = {
    // Base URL for API - dynamically uses current hostname with port 8223
    baseURL: (() => {
        // Use explicit override if set
        if (window.API_BASE_URL) {
            return window.API_BASE_URL;
        }
        // Otherwise construct URL from current hostname
        // Frontend runs on port 3100, backend on port 8223
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:8224/api`;
    })(),
    
    /**
     * Get auth headers
     * @returns {Object} Headers object with Authorization
     */
    getHeaders() {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    /**
     * Make API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise} API response
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        // Check if body is FormData - don't set Content-Type for FormData
        const isFormData = options.body instanceof FormData;
        
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers
            }
        };
        
        // Remove Content-Type for FormData uploads (browser will set it with boundary)
        if (isFormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, config);
            
            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/index.html';
                return;
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({
                    detail: 'An error occurred'
                }));
                
                // Handle different error formats
                let errorMsg = `HTTP ${response.status}`;
                if (error.detail) {
                    if (Array.isArray(error.detail)) {
                        // FastAPI validation errors (422)
                        errorMsg = error.detail.map(e => {
                            const field = Array.isArray(e.loc) ? e.loc.join('.') : 'field';
                            return `${field}: ${e.msg}`;
                        }).join(', ');
                    } else if (typeof error.detail === 'string') {
                        errorMsg = error.detail;
                    } else if (typeof error.detail === 'object') {
                        errorMsg = JSON.stringify(error.detail);
                    }
                } else if (error.message) {
                    errorMsg = error.message;
                }
                
                console.error('API Error:', error);
                console.error('Error message:', errorMsg);
                throw new Error(errorMsg);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Auth methods
    auth: {
        login: (username, password) => {
            // Use FormData for OAuth2 password flow
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);
            
            return API.request('/auth/login', { 
                method: 'POST', 
                body: formData.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        },
        
        register: (userData) => 
            API.request('/auth/register', { 
                method: 'POST', 
                body: JSON.stringify({
                    email: userData.email,
                    password: userData.password,
                    full_name: userData.fullName
                }) 
            }),
        
        me: () => 
            API.request('/auth/me'),
        
        logout: () => 
            API.request('/auth/logout', { method: 'POST' }),
        
        updateProfile: (data) =>
            API.request('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),
        
        changePassword: (data) =>
            API.request('/auth/change-password', { method: 'POST', body: JSON.stringify(data) })
    },

    // Accounts methods
    accounts: {
        list: () => 
            API.request('/accounts'),
        
        create: (data) => 
            API.request('/accounts', { method: 'POST', body: JSON.stringify(data) }),
        
        get: (id) => 
            API.request(`/accounts/${id}`),
        
        update: (id, data) => 
            API.request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        
        delete: (id) => 
            API.request(`/accounts/${id}`, { method: 'DELETE' }),
        
        getTransactions: (id, skip = 0, limit = 100) =>
            API.request(`/accounts/${id}/transactions?skip=${skip}&limit=${limit}`),
        
        getBalanceHistory: (id) =>
            API.request(`/accounts/${id}/balance`)
    },

    // Categories methods
    categories: {
        list: (type = null) => {
            let url = '/categories';
            if (type) url += `?type=${type}`;
            return API.request(url);
        },
        
        create: (data) => 
            API.request('/categories', { method: 'POST', body: JSON.stringify(data) }),
        
        get: (id) => 
            API.request(`/categories/${id}`),
        
        update: (id, data) => 
            API.request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        
        delete: (id) => 
            API.request(`/categories/${id}`, { method: 'DELETE' }),
        
        suggestions: (text) => 
            API.request(`/categories/suggestions?text=${encodeURIComponent(text)}`)
    },

    // Transactions methods
    transactions: {
        list: (filters = {}) => {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    params.append(key, value);
                }
            });
            const queryString = params.toString();
            return API.request(`/transactions${queryString ? '?' + queryString : ''}`);
        },
        
        create: (data) => 
            API.request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
        
        get: (id) => 
            API.request(`/transactions/${id}`),
        
        update: (id, data) => 
            API.request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        
        delete: (id) => 
            API.request(`/transactions/${id}`, { method: 'DELETE' }),
        
        bulkUpdate: (ids, data) => 
            API.request('/transactions/bulk-update', { method: 'POST', body: JSON.stringify({ ids, data }) }),
        
        bulkDelete: (ids) => 
            API.request('/transactions/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) })
    },

    // Budgets methods
    budgets: {
        list: (activeOnly = true) => 
            API.request(`/budgets?active_only=${activeOnly}`),
        
        create: (data) => 
            API.request('/budgets', { method: 'POST', body: JSON.stringify(data) }),
        
        get: (id) => 
            API.request(`/budgets/${id}`),
        
        update: (id, data) => 
            API.request(`/budgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        
        delete: (id) => 
            API.request(`/budgets/${id}`, { method: 'DELETE' }),
        
        getProgress: (id) => 
            API.request(`/budgets/${id}/progress`),
        
        getReport: (id) =>
            API.request(`/budgets/${id}/report`),
        
        getTransactions: (id, skip = 0, limit = 50) =>
            API.request(`/budgets/${id}/transactions?skip=${skip}&limit=${limit}`),
        
        addCategory: (id, categoryId, allocatedAmount = null) =>
            API.request(`/budgets/${id}/categories`, { 
                method: 'POST', 
                body: JSON.stringify({ category_id: categoryId, allocated_amount: allocatedAmount }) 
            }),
        
        removeCategory: (id, categoryId) =>
            API.request(`/budgets/${id}/categories/${categoryId}`, { method: 'DELETE' })
    },

    // Import methods
    import: {
        upload: async (file) => {
            console.log('=== UPLOAD FUNCTION CALLED ===');
            console.log('File object:', file);
            console.log('File name:', file?.name);
            console.log('File size:', file?.size);
            console.log('File type:', file?.type);
            
            const formData = new FormData();
            formData.append('file', file);
            
            // Log FormData contents
            console.log('FormData entries:');
            for (let pair of formData.entries()) {
                console.log(pair[0] + ':', pair[1]);
            }
            
            const token = localStorage.getItem('token');
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            console.log('Request headers:', headers);
            console.log('Sending POST request to:', `${API.baseURL}/import/upload`);
            
            const response = await fetch(`${API.baseURL}/import/upload`, {
                method: 'POST',
                body: formData,
                headers: headers
            });
            
            console.log('Response status:', response.status);
            
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/index.html';
                return;
            }
            
            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const error = await response.json();
                    console.error('Upload error details:', error);
                    
                    // Handle FastAPI validation errors (422)
                    if (error.detail) {
                        if (Array.isArray(error.detail)) {
                            // Pydantic validation errors
                            errorMessage = error.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ');
                        } else if (typeof error.detail === 'string') {
                            errorMessage = error.detail;
                        } else {
                            errorMessage = JSON.stringify(error.detail);
                        }
                    } else if (error.message) {
                        errorMessage = error.message;
                    }
                } catch (e) {
                    console.error('Could not parse error response:', e);
                }
                throw new Error(errorMessage);
            }
            
            return await response.json();
        },
        
        getFormats: () =>
            API.request('/import/formats'),
        
        preview: (batchId) => 
            API.request(`/import/preview/${batchId}`),
        
        updatePreview: (batchId, rowId, data) => 
            API.request(`/import/preview/${rowId}/update`, { 
                method: 'POST', 
                body: JSON.stringify(data) 
            }),
        
        categorize: (batchId) => 
            API.request(`/import/preview/${batchId}/categorize`, { method: 'POST' }),
        
        confirm: (batchId, accountId, transactions) => 
            API.request('/import/confirm', { 
                method: 'POST', 
                body: JSON.stringify({ batch_id: batchId, account_id: accountId, transactions }) 
            }),
        
        batches: () => 
            API.request('/import/batches'),
        
        getBatch: (batchId) =>
            API.request(`/import/batches/${batchId}`)
    },

    // Reports methods
    reports: {
        types: () => 
            API.request('/reports/types'),
        
        spending: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/spending?${queryParams}`);
        },
        
        income: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/income?${queryParams}`);
        },
        
        cashflow: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/cashflow?${queryParams}`);
        },
        
        categoryBreakdown: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/category-breakdown?${queryParams}`);
        },
        
        trend: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/trend?${queryParams}`);
        },
        
        balanceHistory: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/balance-history?${queryParams}`);
        },
        
        custom: (config) => 
            API.request('/reports/custom', { method: 'POST', body: JSON.stringify(config) }),
        
        save: (name, reportType, configuration) => 
            API.request('/reports/save', { 
                method: 'POST', 
                body: JSON.stringify({ name, report_type: reportType, configuration: JSON.stringify(configuration) }) 
            }),
        
        saved: () => 
            API.request('/reports/saved'),
        
        getSaved: (id) =>
            API.request(`/reports/saved/${id}`),
        
        deleteSaved: (id) => 
            API.request(`/reports/saved/${id}`, { method: 'DELETE' })
    },

    // Goals methods
    goals: {
        list: (statusFilter = null) => {
            let url = '/goals';
            if (statusFilter) url += `?status_filter=${statusFilter}`;
            return API.request(url);
        },
        
        create: (data) => 
            API.request('/goals', { method: 'POST', body: JSON.stringify(data) }),
        
        get: (id) => 
            API.request(`/goals/${id}`),
        
        update: (id, data) => 
            API.request(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        
        delete: (id) => 
            API.request(`/goals/${id}`, { method: 'DELETE' }),
        
        getSummary: () =>
            API.request('/goals/summary'),
        
        getProgress: (id) =>
            API.request(`/goals/${id}/progress`),
        
        getTransactions: (id, limit = 50) =>
            API.request(`/goals/${id}/transactions?limit=${limit}`),
        
        addTransaction: (id, data) =>
            API.request(`/goals/${id}/transactions`, { method: 'POST', body: JSON.stringify(data) })
    },

    // Insights methods - Smart Spending Insights
    insights: {
        list: (days = 30, includeRead = true, includeDismissed = false) => 
            API.request(`/insights?days=${days}&include_read=${includeRead}&include_dismissed=${includeDismissed}`),
        
        getSummary: () =>
            API.request('/insights/summary'),
        
        generate: (days = 30) =>
            API.request(`/insights/generate?days=${days}`, { method: 'POST' }),
        
        markRead: (id) =>
            API.request(`/insights/${id}/read`, { method: 'PUT' }),
        
        dismiss: (id) =>
            API.request(`/insights/${id}/dismiss`, { method: 'PUT' }),
        
        markAllRead: () =>
            API.request('/insights/mark-all-read', { method: 'POST' }),
        
        getTrends: (months = 6) =>
            API.request(`/insights/trends/analysis?months=${months}`),
        
        getStatistics: (months = 6) =>
            API.request(`/insights/statistics?months=${months}`),
        
        detectPatterns: () =>
            API.request('/insights/patterns/detect', { method: 'POST' }),
        
        getPatterns: (includeInactive = false) =>
            API.request(`/insights/patterns?include_inactive=${includeInactive}`),
        
        getCategoryTrend: (categoryName, months = 6) =>
            API.request(`/insights/category/${encodeURIComponent(categoryName)}/trend?months=${months}`),
        
        getAnomalies: (days = 30, threshold = 2.5) =>
            API.request(`/insights/anomalies?days=${days}&threshold=${threshold}`)
    },

    // Debts methods - Debt Tracking & Payoff Planner
    debts: {
        list: (activeOnly = false) => 
            API.request(`/debts?active_only=${activeOnly}`),
        
        create: (data) => 
            API.request('/debts', { method: 'POST', body: JSON.stringify(data) }),
        
        get: (id) => 
            API.request(`/debts/${id}`),
        
        update: (id, data) => 
            API.request(`/debts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        
        delete: (id) => 
            API.request(`/debts/${id}`, { method: 'DELETE' }),
        
        getSummary: () =>
            API.request('/debts/summary'),
        
        getPayments: (id, limit = 50) =>
            API.request(`/debts/${id}/payments?limit=${limit}`),
        
        addPayment: (id, data) =>
            API.request(`/debts/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
        
        compareStrategies: (extraPayment = 0) =>
            API.request(`/debts/strategies/compare?extra_payment=${extraPayment}`),
        
        getScenarios: () =>
            API.request('/debts/strategies/scenarios'),
        
        getUpcomingPayments: (days = 30) =>
            API.request(`/debts/upcoming-payments?days=${days}`)
    }
};

// Make API available globally
window.API = API;