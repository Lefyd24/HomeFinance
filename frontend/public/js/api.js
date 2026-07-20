/**
 * API Client for Personal Finance App
 * All API calls go through this module
 * 
 * Backend URL can be configured via:
 * - window.API_BASE_URL (global variable)
 * - localStorage.setItem('backendUrl', 'http://192.168.1.100:8443')
 * - Default: same hostname as this page, port from js/runtime-config.js (BACKEND_PORT / local default 8223)
 */

function resolveDefaultBackendPort() {
    const cfg = window.__APP_CONFIG__;
    const p = cfg && cfg.backendPort != null ? Number(cfg.backendPort) : NaN;
    return Number.isFinite(p) && p > 0 ? p : 8223;
}

const API = {
    // Base URL for API
    baseURL: (() => {
        // 1. Use explicit window override if set
        if (window.API_BASE_URL) {
            return window.API_BASE_URL;
        }
        
        // 2. Check localStorage for user-configured URL
        const storedUrl = localStorage.getItem('backendUrl');
        if (storedUrl) {
            return storedUrl;
        }
        
        // 3. Same host as the frontend, backend port from runtime-config.js or default
        const protocol = window.location.protocol || 'http:';
        const host = window.location.hostname || 'localhost';
        const port = resolveDefaultBackendPort();
        return `${protocol}//${host}:${port}/api`;
    })(),
    
    // Method to dynamically change backend URL
    setBackendUrl: (url) => {
        localStorage.setItem('backendUrl', url);
        console.log('Backend URL changed to:', url);
    },
    
    // Method to get current backend URL
    getBackendUrl: () => {
        return API.baseURL;
    },
    
    // Method to reset to default
    resetBackendUrl: () => {
        localStorage.removeItem('backendUrl');
        window.API_BASE_URL = null;
    },
    
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

    // Tracks an in-flight refresh so concurrent 401s share one refresh call
    _refreshPromise: null,

    async _tryRefreshToken() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) return false;

        try {
            const response = await fetch(
                `${this.baseURL}/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`,
                { method: 'POST' }
            );
            if (!response.ok) return false;
            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('refresh_token', data.refresh_token);
            }
            return true;
        } catch {
            return false;
        }
    },

    _parseErrorMessage(error, status) {
        let errorMsg = `HTTP ${status}`;
        if (error.detail) {
            if (Array.isArray(error.detail)) {
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
        return errorMsg;
    },

    /**
     * Make API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @param {boolean} _isRetry - internal flag to prevent infinite refresh loop
     * @returns {Promise} API response
     */
    async request(endpoint, options = {}, _isRetry = false) {
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

            if (response.status === 401 && !_isRetry) {
                // Deduplicate concurrent refresh attempts
                if (!this._refreshPromise) {
                    this._refreshPromise = this._tryRefreshToken().finally(() => {
                        this._refreshPromise = null;
                    });
                }
                const refreshed = await this._refreshPromise;

                if (refreshed) {
                    // Retry original request with new token
                    return this.request(endpoint, options, true);
                }

                // Refresh failed — session is truly expired
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                window.location.href = '/index.html';
                return;
            }

            if (response.status === 401 && _isRetry) {
                // Even the retry failed — clear and redirect
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                window.location.href = '/index.html';
                return;
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({
                    detail: 'An error occurred'
                }));
                const errorMsg = this._parseErrorMessage(error, response.status);
                console.error('API Error:', error);
                throw new Error(errorMsg);
            }

            // 204 No Content and empty bodies (e.g. push subscribe/unsubscribe)
            if (response.status === 204) {
                return null;
            }
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    /**
     * POST a JSON body and consume the response as a stream of SSE events
     * ("data: {...}\n\n" lines). Mirrors request()'s header/401-refresh
     * logic but hands parsed events to onEvent as they arrive instead of
     * awaiting one JSON body.
     * @param {string} endpoint - API endpoint
     * @param {Object} body - request body, JSON-serialized
     * @param {{onEvent?: Function, onError?: Function}} handlers
     */
    async streamRequest(endpoint, body, { onEvent, onError } = {}) {
        const url = `${this.baseURL}${endpoint}`;

        const doFetch = async (isRetry) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body)
            });

            if (response.status === 401 && !isRetry) {
                if (!this._refreshPromise) {
                    this._refreshPromise = this._tryRefreshToken().finally(() => {
                        this._refreshPromise = null;
                    });
                }
                const refreshed = await this._refreshPromise;
                if (refreshed) {
                    return doFetch(true);
                }
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                window.location.href = '/index.html';
                return;
            }

            if (!response.ok || !response.body) {
                const text = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop();
                for (const part of parts) {
                    const line = part.split('\n').find(l => l.startsWith('data: '));
                    if (!line) continue;
                    try {
                        onEvent && onEvent(JSON.parse(line.slice(6)));
                    } catch (e) {
                        console.error('Malformed SSE event:', line, e);
                    }
                }
            }
        };

        try {
            await doFetch(false);
        } catch (error) {
            console.error('Stream request error:', error);
            onError && onError(error);
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
            API.request('/transactions/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
        
        incomeVsSpending: (startDate, endDate, groupBy = 'month') => {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            params.append('group_by', groupBy);
            return API.request(`/transactions/income-vs-spending?${params.toString()}`);
        }
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
        
        getSummary: (id, year = null) =>
            API.request(`/budgets/${id}/summary${year ? `?year=${year}` : ''}`),
        
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
                const refreshed = await API._tryRefreshToken();
                if (refreshed) {
                    // Retry with fresh token
                    const newHeaders = {};
                    const newToken = localStorage.getItem('token');
                    if (newToken) newHeaders['Authorization'] = `Bearer ${newToken}`;
                    const retryResponse = await fetch(`${API.baseURL}/import/upload`, {
                        method: 'POST',
                        body: formData,
                        headers: newHeaders,
                    });
                    if (retryResponse.ok) return await retryResponse.json();
                }
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
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

        netWorth: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/net-worth?${queryParams}`);
        },

        savingsRate: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/savings-rate?${queryParams}`);
        },

        topMerchants: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/top-merchants?${queryParams}`);
        },

        spendingMom: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/spending-mom?${queryParams}`);
        },

        weekdayHeatmap: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/weekday-heatmap?${queryParams}`);
        },

        budgetPerformance: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/budget-performance?${queryParams}`);
        },

        debtInsights: (params) => {
            const queryParams = new URLSearchParams(params).toString();
            return API.request(`/reports/debt-insights?${queryParams}`);
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
        
        getUpcomingPayments: (days = 30, startDate = null, endDate = null) => {
            let url = `/debts/upcoming-payments?days=${days}`;
            if (startDate) url += `&start_date=${startDate}`;
            if (endDate) url += `&end_date=${endDate}`;
            return API.request(url);
        }
    },

    recurringExpenses: {
        list: () =>
            API.request('/recurring-expenses'),

        create: (data) =>
            API.request('/recurring-expenses', { method: 'POST', body: JSON.stringify(data) }),

        update: (id, data) =>
            API.request(`/recurring-expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

        delete: (id) =>
            API.request(`/recurring-expenses/${id}`, { method: 'DELETE' }),

        getUpcoming: (days = 15) =>
            API.request(`/recurring-expenses/upcoming?days=${days}`),

        recordPayment: (id, data) =>
            API.request(`/recurring-expenses/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),

        getTransactions: (id, skip = 0, limit = 50) =>
            API.request(`/recurring-expenses/${id}/transactions?skip=${skip}&limit=${limit}`),

        setActive: (id, active) =>
            API.request(`/recurring-expenses/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: active }) }),
    },

    // Analytics methods - ML-powered financial analytics
    analytics: {
        getSpendingForecast: (days = 30, confidence = 0.85) =>
            API.request(`/analytics/spending-forecast?days=${days}&confidence=${confidence}`),
        
        getCategoryForecast: (days = 30) =>
            API.request(`/analytics/spending-forecast/by-category?days=${days}`),
        
        getSpendingClusters: () =>
            API.request('/analytics/spending-clusters'),
        
        getSpendingPersona: () =>
            API.request('/analytics/spending-persona'),
        
        getCategoryPredictions: (limit = 10) =>
            API.request(`/analytics/category-predictions?limit=${limit}`),
        
        predictCategory: (description) =>
            API.request(`/analytics/category-predictions/predict?description=${encodeURIComponent(description)}`, { method: 'POST' }),
        
        getBudgetRecommendations: (savingsTarget = null, months = 3) => {
            let url = '/analytics/budget-recommendations';
            const params = new URLSearchParams();
            if (savingsTarget) params.append('savings_target', savingsTarget);
            params.append('months', months);
            return API.request(`${url}?${params.toString()}`);
        },
        
        getCashflowProjection: (months = 6) =>
            API.request(`/analytics/cashflow-projection?months=${months}`),
        
        getCashflowScenarios: (months = 12) =>
            API.request(`/analytics/cashflow-scenarios?months=${months}`),
        
        getSpendingHeatmap: (months = 3) =>
            API.request(`/analytics/spending-heatmap?months=${months}`),
        
        getCategoryCorrelations: (months = 6) =>
            API.request(`/analytics/category-correlations?months=${months}`),
        
        getFinancialHealthScore: () =>
            API.request('/analytics/financial-health-score'),
        
        getGoalPredictions: () =>
            API.request('/analytics/goals/predictions'),
        
        getGoalPrediction: (goalId) =>
            API.request(`/analytics/goals/${goalId}/prediction`),
        
        getGoalSavingsPlan: (goalId) =>
            API.request(`/analytics/goals/${goalId}/savings-plan`),
        
        getSummary: () =>
            API.request('/analytics/summary')
    },

    // Advisor methods - Financial planning calculators
    advisor: {
        calculateInvestment: (data) =>
            API.request('/advisor/investment/calculate', { method: 'POST', body: JSON.stringify(data) }),
        
        calculateRetirement: (data) =>
            API.request('/advisor/investment/retirement', { method: 'POST', body: JSON.stringify(data) }),
        
        compareInvestmentScenarios: (scenarios) =>
            API.request('/advisor/investment/compare', { method: 'POST', body: JSON.stringify({ scenarios }) }),
        
        calculateLoanAmortization: (data) =>
            API.request('/advisor/loan/amortization', { method: 'POST', body: JSON.stringify(data) }),
        
        calculateEarlyPayoff: (data) =>
            API.request('/advisor/loan/early-payoff', { method: 'POST', body: JSON.stringify(data) }),
        
        compareRefinance: (data) =>
            API.request('/advisor/loan/refinance-compare', { method: 'POST', body: JSON.stringify(data) }),
        
        getEmergencyFundRecommendation: () =>
            API.request('/advisor/emergency-fund/recommendation'),
        
        getNetWorth: () =>
            API.request('/advisor/net-worth'),
        
        getNetWorthHistory: (months = 12) =>
            API.request(`/advisor/net-worth/history?months=${months}`),
        
        getNetWorthProjection: (months = 12, monthlySavings = null) => {
            let url = `/advisor/net-worth/projection?months=${months}`;
            if (monthlySavings) url += `&monthly_savings=${monthlySavings}`;
            return API.request(url);
        },
        
        estimateTax: (data) =>
            API.request('/advisor/tax/estimate', { method: 'POST', body: JSON.stringify(data) }),
        
        calculateMarginalTax: (data) =>
            API.request('/advisor/tax/marginal', { method: 'POST', body: JSON.stringify(data) }),
        
        compareTaxLevels: (incomes) =>
            API.request(`/advisor/tax/compare?incomes=${incomes.join(',')}`),
        
        getAvailableTools: () =>
            API.request('/advisor/tools')
    },

    notifications: {
        getSettings: () => API.request('/notifications/settings'),
        updateSettings: (data) => API.request('/notifications/settings', { method: 'PUT', body: JSON.stringify(data) }),
        listRules: () => API.request('/notifications/rules'),
        createRule: (data) => API.request('/notifications/rules', { method: 'POST', body: JSON.stringify(data) }),
        updateRule: (id, data) => API.request(`/notifications/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        deleteRule: (id) => API.request(`/notifications/rules/${id}`, { method: 'DELETE' }),
        log: (params) => API.request('/notifications/log' + (params?.limit ? `?limit=${params.limit}` : '')),
        vapidKey: () => API.request('/notifications/push/vapid-public-key'),
        pushStatus: () => API.request('/notifications/push/status'),
        subscribe: (data) => API.request('/notifications/push/subscribe', { method: 'POST', body: JSON.stringify(data) }),
        unsubscribe: (data) => API.request('/notifications/push/unsubscribe', { method: 'POST', body: JSON.stringify(data) }),
        test: (channel) => API.request('/notifications/test', {
            method: 'POST',
            body: JSON.stringify({ channel: channel || 'all' })
        }),
        run: () => API.request('/notifications/run', { method: 'POST' }),
    },

    ai: {
        status: () => API.request('/ai/status'),
        chat: (messages, handlers) =>
            API.streamRequest('/ai/chat', { messages }, handlers)
    }
};

// Make API available globally
window.API = API;