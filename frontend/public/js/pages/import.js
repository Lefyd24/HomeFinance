/**
 * Import page controller - Bank import wizard
 */

// State (global for this module)
let currentStep = 1;
let uploadedFile = null;
let previewData = null;
let accounts = [];
let categories = [];
let batchId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('import');
    
    // Get main content container
    const mainContent = document.getElementById('main-content');
    
    // Render page content
    mainContent.innerHTML = `
        <div class="space-y-6">
            <!-- Header -->
            <div>
                <h2 class="text-2xl font-bold">Import Transactions</h2>
                <p class="text-base-content/60">Import bank statements and categorize transactions</p>
            </div>
            
            <!-- Wizard Steps -->
            <ul class="steps w-full">
                <li class="step ${currentStep >= 1 ? 'step-primary' : ''}">Upload</li>
                <li class="step ${currentStep >= 2 ? 'step-primary' : ''}">Preview</li>
                <li class="step ${currentStep >= 3 ? 'step-primary' : ''}">Categorize</li>
                <li class="step ${currentStep >= 4 ? 'step-primary' : ''}">Confirm</li>
            </ul>
            
            <!-- Step Content -->
            <div id="wizard-content" class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <!-- Step 1: Upload -->
                    <div id="step-1" class="${currentStep === 1 ? '' : 'hidden'}">
                        <div class="border-4 border-dashed border-base-300 rounded-box p-12 text-center" id="dropZone">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <h3 class="text-xl font-semibold mb-2">Upload Bank Statement</h3>
                            <p class="text-base-content/60 mb-4">Drag and drop your file here, or click to browse</p>
                            <input type="file" id="fileInput" class="hidden" accept=".csv,.xlsx,.xls,.pdf">
                            <button onclick="document.getElementById('fileInput').click()" class="btn btn-primary">
                                Select File
                            </button>
                            <p class="text-sm text-base-content/40 mt-4">Supported formats: CSV, Excel, PDF</p>
                        </div>
                        
                        <div id="fileSelected" class="hidden mt-4">
                            <div class="alert alert-info">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span id="fileName"></span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Step 2: Preview -->
                    <div id="step-2" class="${currentStep === 2 ? '' : 'hidden'}">
                        <h3 class="text-xl font-semibold mb-4">Preview Transactions</h3>
                        <p class="text-base-content/60 mb-4">Review the parsed transactions below. You can edit details before importing.</p>
                        
                        <div class="overflow-x-auto mb-4">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Description</th>
                                        <th>Amount</th>
                                        <th>Category</th>
                                        <th>Account</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody id="previewTableBody">
                                    <!-- Preview rows will be inserted here -->
                                </tbody>
                            </table>
                        </div>
                        
                        <div id="duplicateWarning" class="alert alert-warning hidden mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <span>Some transactions may be duplicates. Please review carefully.</span>
                        </div>
                    </div>
                    
                    <!-- Step 3: Categorize -->
                    <div id="step-3" class="${currentStep === 3 ? '' : 'hidden'}">
                        <h3 class="text-xl font-semibold mb-4">Categorize Transactions</h3>
                        <p class="text-base-content/60 mb-4">Assign categories to uncategorized transactions.</p>
                        
                        <div class="flex gap-4 mb-4">
                            <select id="bulkCategory" class="select select-bordered select-sm">
                                <option value="">Bulk assign category...</option>
                            </select>
                            <button onclick="autoCategorize()" class="btn btn-sm btn-secondary">
                                Auto-Categorize
                            </button>
                        </div>
                        
                        <div id="categorizeList">
                            <!-- Categorization items will be inserted here -->
                        </div>
                    </div>
                    
                    <!-- Step 4: Confirm -->
                    <div id="step-4" class="${currentStep === 4 ? '' : 'hidden'}">
                        <div class="text-center py-8">
                            <div class="text-success mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 class="text-2xl font-bold mb-2">Import Complete!</h3>
                            <p class="text-base-content/60 mb-6">
                                Successfully imported <span id="importCount">0</span> transactions.
                            </p>
                            <div class="flex justify-center gap-4">
                                <a href="transactions.html" class="btn btn-primary">View Transactions</a>
                                <button onclick="resetWizard()" class="btn btn-ghost">Import Another File</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Navigation Buttons -->
                <div class="card-actions justify-between p-6 pt-0" id="wizardButtons">
                    <button onclick="previousStep()" class="btn btn-ghost ${currentStep === 1 ? 'invisible' : ''}">Back</button>
                    <button onclick="nextStep()" class="btn btn-primary" id="nextBtn">
                        ${currentStep === 3 ? 'Import' : 'Next'}
                    </button>
                </div>
            </div>
            
            <!-- Import History -->
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body">
                    <h3 class="card-title">Recent Imports</h3>
                    <div id="importHistory"></div>
                </div>
            </div>
        </div>
    `;
    
    // Initialize
    await initialize();
    
    async function initialize() {
        try {
            accounts = await API.accounts.list();
            categories = await API.categories.list();
            
            populateCategorySelect();
            setupDragAndDrop();
            loadImportHistory();
            
        } catch (error) {
            console.error('Error initializing:', error);
        }
    }
    
    function populateCategorySelect() {
        const selects = document.querySelectorAll('#bulkCategory, select[data-category-select]');
        selects.forEach(select => {
            categories.forEach(cat => {
                select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            });
        });
    }
    
    function setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-primary');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-primary');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-primary');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }
    
    function handleFileSelect(file) {
        uploadedFile = file;
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSelected').classList.remove('hidden');
        Utils.showToast('File selected: ' + file.name, 'success');
    }
    
    async function processFile() {
        console.log('=== PROCESS FILE CALLED ===');
        console.log('uploadedFile:', uploadedFile);
        
        if (!uploadedFile) {
            Utils.showToast('Please select a file first', 'error');
            return false;
        }
        
        console.log('File to upload:', uploadedFile.name, uploadedFile.size, 'bytes');
        
        try {
            Utils.showToast('Uploading file...', 'info');
            
            // Upload file to server
            const uploadResult = await API.import.upload(uploadedFile);
            batchId = uploadResult.batch_id;
            
            Utils.showToast(`File uploaded. Found ${uploadResult.total_rows} transactions.`, 'success');
            
            // Get preview data
            previewData = await API.import.preview(batchId);
            
            // Format dates for HTML date inputs (YYYY-MM-DD)
            if (previewData.transactions) {
                previewData.transactions = previewData.transactions.map(tx => ({
                    ...tx,
                    date: formatDateForInput(tx.date)
                }));
            }
            
            if (!previewData.transactions || previewData.transactions.length === 0) {
                Utils.showToast('No transactions found in file', 'warning');
                return false;
            }
            
            renderPreview();
            return true;
            
        } catch (error) {
            console.error('Error processing file:', error);
            Utils.showToast('Error processing file: ' + (error.message || 'Unknown error'), 'error');
            return false;
        }
    }
    
    function formatDateForInput(dateStr) {
        if (!dateStr) return '';
        // Handle various date formats
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr; // Return as-is if can't parse
        return d.toISOString().split('T')[0]; // Returns YYYY-MM-DD
    }
    
    function renderPreview() {
        const tbody = document.getElementById('previewTableBody');
        const step2Container = document.getElementById('step-2');
        
        // Add account selector before the table if there are accounts
        let accountSelectorHtml = '';
        const existingSelector = step2Container.querySelector('.account-selector-container');
        
        if (!existingSelector && accounts.length > 0) {
            accountSelectorHtml = `
                <div class="account-selector-container mb-4 p-3 bg-base-200 rounded-lg">
                    <label class="label"><span class="label-text font-semibold">Import all transactions to account:</span></label>
                    <select id="importAccount" class="select select-bordered select-sm" required>
                        <option value="">Select Account</option>
                        ${accounts.map(acc => `<option value="${acc.id}">${acc.name} (${acc.currency})</option>`).join('')}
                    </select>
                </div>
            `;
            
            // Insert account selector before the table
            const tableContainer = step2Container.querySelector('.overflow-x-auto');
            if (tableContainer) {
                tableContainer.insertAdjacentHTML('beforebegin', accountSelectorHtml);
            }
        }
        
        // Render transaction rows
        tbody.innerHTML = previewData.transactions.map((tx, index) => `
            <tr class="${tx.is_duplicate ? 'bg-warning/20' : ''}">
                <td><input type="date" class="input input-xs input-bordered" value="${tx.date}" data-field="date" data-index="${index}"></td>
                <td><input type="text" class="input input-xs input-bordered w-full" value="${tx.description || ''}" data-field="description" data-index="${index}"></td>
                <td><input type="number" class="input input-xs input-bordered" value="${tx.amount}" step="0.01" data-field="amount" data-index="${index}"></td>
                <td>
                    <select class="select select-xs select-bordered" onchange="updateCategory(${index}, this.value)">
                        <option value="">Select...</option>
                        ${categories.map(cat => `
                            <option value="${cat.id}" ${(tx.category_id === cat.id) ? 'selected' : ''}>${cat.name}</option>
                        `).join('')}
                    </select>
                    ${tx.suggested_category ? `<span class="badge badge-xs badge-info ml-1">Suggested: ${tx.suggested_category}</span>` : ''}
                </td>
                <td>
                    <span class="text-sm text-base-content/60">From selector above</span>
                </td>
                <td>
                    ${tx.is_duplicate ? 
                        '<span class="badge badge-warning badge-xs">Duplicate</span>' : 
                        '<span class="badge badge-success badge-xs">New</span>'}
                </td>
            </tr>
        `).join('');
        
        // Show duplicate warning if needed
        if (previewData.duplicates && previewData.duplicates.length > 0) {
            document.getElementById('duplicateWarning').classList.remove('hidden');
        } else {
            document.getElementById('duplicateWarning').classList.add('hidden');
        }
    }
    
    function renderCategorizeList() {
        const container = document.getElementById('categorizeList');
        const uncategorized = previewData.transactions.filter(tx => !tx.category_id);
        
        if (uncategorized.length === 0) {
            container.innerHTML = `
                <div class="alert alert-success">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>All transactions are categorized!</span>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="space-y-2">
                ${uncategorized.map((tx, index) => `
                    <div class="flex items-center gap-4 p-3 bg-base-200 rounded-lg">
                        <div class="flex-1">
                            <p class="font-medium">${tx.description}</p>
                            <p class="text-sm text-base-content/60">${Utils.formatDate(tx.date)} • ${Utils.formatCurrency(tx.amount)}</p>
                        </div>
                        <select class="select select-bordered select-sm" onchange="setTransactionCategory(${tx.id}, this.value)">
                            <option value="">Select Category</option>
                            ${categories.map(cat => `
                                <option value="${cat.id}" ${cat.name === tx.suggested_category ? 'selected' : ''}>${cat.name}</option>
                            `).join('')}
                        </select>
                        <button onclick="createNewCategory('${tx.description}')" class="btn btn-ghost btn-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    async function loadImportHistory() {
        try {
            const batches = await API.import.batches();
            const container = document.getElementById('importHistory');
            
            if (!batches || batches.length === 0) {
                container.innerHTML = '<p class="text-base-content/60">No imports yet</p>';
                return;
            }
            
            container.innerHTML = `
                <div class="overflow-x-auto">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>File</th>
                                <th>Transactions</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${batches.map(batch => `
                                <tr>
                                    <td>${Utils.formatDate(batch.created_at)}</td>
                                    <td>${batch.filename}</td>
                                    <td>${batch.total_rows}</td>
                                    <td><span class="badge badge-sm ${batch.status === 'completed' ? 'badge-success' : 'badge-info'}">${batch.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            document.getElementById('importHistory').innerHTML = '<p class="text-base-content/60">Unable to load import history</p>';
        }
    }
    
    // Wizard navigation
    window.nextStep = async () => {
        if (currentStep === 1) {
            if (!await processFile()) return;
        } else if (currentStep === 2) {
            renderCategorizeList();
        } else if (currentStep === 3) {
            // Import transactions
            await confirmImport();
            return;
        }
        
        currentStep++;
        updateWizardUI();
    };
    
    window.previousStep = () => {
        if (currentStep > 1) {
            currentStep--;
            updateWizardUI();
        }
    };
    
    window.resetWizard = () => {
        currentStep = 1;
        uploadedFile = null;
        previewData = null;
        batchId = null;
        document.getElementById('fileInput').value = '';
        document.getElementById('fileSelected').classList.add('hidden');
        updateWizardUI();
    };
    
    function updateWizardUI() {
        // Update steps
        document.querySelectorAll('.steps .step').forEach((step, index) => {
            step.classList.toggle('step-primary', index + 1 <= currentStep);
        });
        
        // Show/hide step content
        for (let i = 1; i <= 4; i++) {
            document.getElementById(`step-${i}`).classList.toggle('hidden', i !== currentStep);
        }
        
        // Update buttons
        const backBtn = document.querySelector('#wizardButtons button:first-child');
        const nextBtn = document.getElementById('nextBtn');
        
        backBtn.classList.toggle('invisible', currentStep === 1);
        nextBtn.textContent = currentStep === 3 ? 'Import' : (currentStep === 4 ? 'Done' : 'Next');
        
        if (currentStep === 4) {
            document.getElementById('wizardButtons').classList.add('hidden');
        } else {
            document.getElementById('wizardButtons').classList.remove('hidden');
        }
    }
    
    async function confirmImport() {
        const nextBtn = document.getElementById('nextBtn');
        
        try {
            nextBtn.disabled = true;
            nextBtn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Importing...';
            
            // Get selected account from the top selector
            const accountSelect = document.getElementById('importAccount');
            let selectedAccountId = accountSelect ? accountSelect.value : null;
            
            // Validate account selection
            if (!selectedAccountId) {
                Utils.showToast('Please select an account for import', 'error');
                nextBtn.disabled = false;
                nextBtn.textContent = 'Import';
                return;
            }
            
            // Collect updated transaction data from the form
            const transactionsToImport = previewData.transactions.map((tx, index) => {
                const dateInput = document.querySelector(`input[data-field="date"][data-index="${index}"]`);
                const descInput = document.querySelector(`input[data-field="description"][data-index="${index}"]`);
                const amountInput = document.querySelector(`input[data-field="amount"][data-index="${index}"]`);
                
                return {
                    date: dateInput ? dateInput.value : tx.date,
                    description: descInput ? descInput.value : tx.description,
                    amount: parseFloat(amountInput ? amountInput.value : tx.amount),
                    category_id: tx.category_id || null
                };
            });
            
            const result = await API.import.confirm(batchId, parseInt(selectedAccountId), transactionsToImport);
            
            document.getElementById('importCount').textContent = result.imported_count || transactionsToImport.length;
            currentStep = 4;
            updateWizardUI();
            Utils.showToast('Import completed successfully!', 'success');
            
        } catch (error) {
            console.error('Import error:', error);
            Utils.showToast('Error importing transactions: ' + (error.message || 'Unknown error'), 'error');
            nextBtn.disabled = false;
            nextBtn.textContent = 'Import';
        } finally {
            if (currentStep === 4) {
                nextBtn.disabled = false;
            }
        }
    }
    
    // Helper functions
    window.autoCategorize = () => {
        Utils.showToast('Auto-categorizing transactions...', 'info');
        // In real implementation, call API
        renderCategorizeList();
    };
    
    window.createNewCategory = (description) => {
        const name = prompt('Enter new category name:', '');
        if (name) {
            Utils.showToast(`Category "${name}" will be created`, 'success');
        }
    };
    
    window.updateCategory = (index, categoryId) => {
        if (previewData && previewData.transactions[index]) {
            previewData.transactions[index].category_id = categoryId;
        }
    };
});