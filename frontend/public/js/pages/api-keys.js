/**
 * API Keys Page Handler
 */

const ApiKeyPage = {
    apiKeyStatus: null,
    
    /**
     * Initialize the page
     */
    init() {
        // Check authentication
        if (!Auth.isAuthenticated()) {
            window.location.href = '/index.html';
            return;
        }
        
        // Render layout
        Layout.render('api-keys');
        
        // Inject content
        const mainContent = document.getElementById('main-content');
        const template = document.getElementById('api-keys-content');
        if (mainContent && template) {
            mainContent.innerHTML = template.innerHTML;
        }
        
        // Load API key status
        this.loadApiKeyStatus();
    },
    
    /**
     * Load API key status from server
     */
    async loadApiKeyStatus() {
        const container = document.getElementById('apiKeyStatusContainer');
        if (!container) return;
        
        try {
            container.innerHTML = `
                <div class="flex items-center justify-center p-8">
                    <span class="loading loading-spinner loading-lg text-primary"></span>
                </div>
            `;
            
            const status = await API.request('/auth/api-key');
            this.apiKeyStatus = status;
            this.renderApiKeyStatus(status);
        } catch (error) {
            console.error('Failed to load API key status:', error);
            container.innerHTML = `
                <div class="alert alert-error">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Failed to load API key status. Please try again.</span>
                </div>
            `;
        }
    },
    
    /**
     * Render API key status
     */
    renderApiKeyStatus(status) {
        const container = document.getElementById('apiKeyStatusContainer');
        if (!container) return;
        
        if (status.has_api_key) {
            // Show existing key status
            container.innerHTML = `
                <div class="bg-success/10 border border-success/20 rounded-lg p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="bg-success text-success-content w-12 h-12 rounded-full flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-lg">API Key Active</h3>
                            <p class="text-sm text-base-content/70">You have an active API key</p>
                        </div>
                    </div>
                    
                    <div class="bg-base-200 rounded-lg p-4 mb-4">
                        <label class="label text-sm font-medium">Current API Key</label>
                        <div class="flex items-center gap-2">
                            <code class="bg-base-300 px-3 py-2 rounded text-sm font-mono flex-1">
                                ****...${status.api_key_last_four}
                            </code>
                            <span class="badge badge-success badge-sm">Active</span>
                        </div>
                        <p class="text-xs text-base-content/50 mt-2">
                            For security, only the last 4 characters are shown.
                        </p>
                    </div>
                    
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="btn btn-primary" onclick="generateKeyModal.showModal()">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Generate New Key
                        </button>
                        <button type="button" class="btn btn-error btn-outline" onclick="revokeKeyModal.showModal()">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Revoke Key
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Show no key status
            container.innerHTML = `
                <div class="bg-base-200 border-2 border-dashed border-base-300 rounded-lg p-8 text-center">
                    <div class="flex justify-center mb-4">
                        <div class="bg-base-300 text-base-content/50 w-16 h-16 rounded-full flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                        </div>
                    </div>
                    <h3 class="font-bold text-lg mb-2">No API Key</h3>
                    <p class="text-sm text-base-content/70 mb-6 max-w-md mx-auto">
                        You don't have an API key yet. Generate one to start using the API for programmatic access to your transactions.
                    </p>
                    <button type="button" class="btn btn-primary" onclick="ApiKeyPage.generateNewKey()">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Generate API Key
                    </button>
                </div>
            `;
        }
    },
    
    /**
     * Generate new API key
     */
    async generateNewKey() {
        try {
            const result = await API.request('/auth/api-key', { method: 'POST' });
            
            // Close the generate modal if open
            const generateModal = document.getElementById('generateKeyModal');
            if (generateModal) {
                generateModal.close();
            }
            
            // Show the new key in the show modal
            const showModal = document.getElementById('showNewKeyModal');
            const keyInput = document.getElementById('newApiKey');
            if (showModal && keyInput) {
                keyInput.value = result.api_key;
                showModal.showModal();
            }
            
            Utils.showToast(result.message, 'success');
        } catch (error) {
            console.error('Failed to generate API key:', error);
            Utils.showToast('Failed to generate API key: ' + error.message, 'error');
        }
    },
    
    /**
     * Revoke API key
     */
    async revokeKey() {
        try {
            const result = await API.request('/auth/api-key', { method: 'DELETE' });
            
            // Close the revoke modal
            const revokeModal = document.getElementById('revokeKeyModal');
            if (revokeModal) {
                revokeModal.close();
            }
            
            Utils.showToast(result.message, 'success');
            
            // Reload status
            this.loadApiKeyStatus();
        } catch (error) {
            console.error('Failed to revoke API key:', error);
            Utils.showToast('Failed to revoke API key: ' + error.message, 'error');
        }
    },
    
    /**
     * Copy new API key to clipboard
     */
    async copyNewKey() {
        const keyInput = document.getElementById('newApiKey');
        if (!keyInput) return;
        
        try {
            await navigator.clipboard.writeText(keyInput.value);
            Utils.showToast('API key copied to clipboard!', 'success');
        } catch (error) {
            // Fallback: select and copy
            keyInput.select();
            keyInput.setSelectionRange(0, 99999); // For mobile
            document.execCommand('copy');
            Utils.showToast('API key copied to clipboard!', 'success');
        }
    }
};

// Initialize page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ApiKeyPage.init();
});

// Make available globally
window.ApiKeyPage = ApiKeyPage;
