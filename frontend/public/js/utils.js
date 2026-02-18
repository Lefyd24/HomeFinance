/**
 * Utility functions for Personal Finance App
 */

const Utils = {
    /**
     * Format currency amount
     * @param {number} amount - The amount to format
     * @param {string} currency - Currency code (default: EUR)
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount, currency = 'EUR') {
        return new Intl.NumberFormat('el-GR', {
            style: 'currency',
            currency: currency
        }).format(amount);
    },

    /**
     * Format date to local string
     * @param {string|Date} date - Date to format
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('el-GR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format date for input fields (YYYY-MM-DD)
     * @param {string|Date} date - Date to format
     * @returns {string} Formatted date string
     */
    formatDateForInput(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Milliseconds to wait
     * @returns {Function} Debounced function
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {string} type - Toast type (success, error, warning, info)
     * @param {number} duration - Duration in milliseconds
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `alert alert-${type} fixed bottom-4 right-4 z-50 shadow-lg max-w-sm`;
        toast.innerHTML = `
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, duration);
    },

    /**
     * Show loading spinner on button
     * @param {HTMLElement} button - Button element
     * @param {boolean} show - Whether to show or hide spinner
     */
    toggleLoading(button, show = true) {
        const spinner = button.querySelector('.loading-spinner');
        if (spinner) {
            spinner.classList.toggle('hidden', !show);
        }
        button.disabled = show;
    },

    /**
     * Show error message in form
     * @param {string} elementId - Error element ID
     * @param {string} message - Error message
     */
    showError(elementId, message) {
        const errorDiv = document.getElementById(elementId);
        const errorText = document.getElementById(elementId.replace('Message', 'Text'));
        if (errorDiv && errorText) {
            errorText.textContent = message;
            errorDiv.classList.remove('hidden');
        }
    },

    /**
     * Hide error message
     * @param {string} elementId - Error element ID
     */
    hideError(elementId) {
        const errorDiv = document.getElementById(elementId);
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    },

    /**
     * Get today's date as YYYY-MM-DD
     * @returns {string} Today's date
     */
    getToday() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Get first day of current month
     * @returns {string} First day of month
     */
    getFirstDayOfMonth() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    },

    /**
     * Get last day of current month
     * @returns {string} Last day of month
     */
    getLastDayOfMonth() {
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const monthStr = String(month + 1).padStart(2, '0');
        const dayStr = String(lastDay).padStart(2, '0');
        return `${year}-${monthStr}-${dayStr}`;
    },

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Deep clone object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Truncate text with ellipsis
     * @param {string} text - Text to truncate
     * @param {number} length - Max length
     * @returns {string} Truncated text
     */
    truncate(text, length = 50) {
        if (!text || text.length <= length) return text;
        return text.substring(0, length) + '...';
    },

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} Whether email is valid
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
};

// Make Utils available globally
window.Utils = Utils;