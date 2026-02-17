/**
 * Categories page controller
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('categories');
    
    // State
    let categories = [];
    
    // Get main content container
    const mainContent = document.getElementById('main-content');
    
    // Render page content
    mainContent.innerHTML = `
        <div class="space-y-6">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 class="text-2xl font-bold">Categories</h2>
                    <p class="text-base-content/60">Organize your transactions with categories</p>
                </div>
                <button onclick="categoryModal.showModal()" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Category
                </button>
            </div>
            
            <!-- Category Stats -->
            <div id="categoryStats"></div>
            
            <!-- Categories by Type -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Income Categories -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title flex items-center gap-2">
                            <span class="badge badge-success">Income</span>
                        </h3>
                        <div id="incomeCategories" class="space-y-2 mt-4"></div>
                    </div>
                </div>
                
                <!-- Expense Categories -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title flex items-center gap-2">
                            <span class="badge badge-error">Expense</span>
                        </h3>
                        <div id="expenseCategories" class="space-y-2 mt-4"></div>
                    </div>
                </div>
                
                <!-- Transfer Categories -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title flex items-center gap-2">
                            <span class="badge badge-info">Transfer</span>
                        </h3>
                        <div id="transferCategories" class="space-y-2 mt-4"></div>
                    </div>
                </div>
            </div>
            
            <!-- Category Usage Tips -->
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body">
                    <h3 class="card-title">Tips for Using Categories</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div class="flex items-start gap-3">
                            <div class="badge badge-primary badge-lg">1</div>
                            <div>
                                <p class="font-medium">Be Consistent</p>
                                <p class="text-sm text-base-content/60">Use the same categories for similar transactions to get accurate reports.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="badge badge-primary badge-lg">2</div>
                            <div>
                                <p class="font-medium">Create Subcategories</p>
                                <p class="text-sm text-base-content/60">Use parent categories to organize related expenses hierarchically.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="badge badge-primary badge-lg">3</div>
                            <div>
                                <p class="font-medium">Review Regularly</p>
                                <p class="text-sm text-base-content/60">Periodically review and clean up unused categories.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="badge badge-primary badge-lg">4</div>
                            <div>
                                <p class="font-medium">Use Colors</p>
                                <p class="text-sm text-base-content/60">Assign different colors to categories for better visual organization.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Initialize
    await initialize();
    
    // Setup form submission
    document.getElementById('categoryForm').addEventListener('submit', handleCategorySubmit);
    
    async function initialize() {
        try {
            categories = await API.categories.list();
            renderCategories();
            renderStats();
            populateParentSelect();
        } catch (error) {
            console.error('Error initializing:', error);
            Utils.showToast('Error loading categories', 'error');
        }
    }
    
    function populateParentSelect() {
        const select = document.getElementById('parentCategory');
        const topLevelCats = categories.filter(c => !c.parent_id);
        
        select.innerHTML = '<option value="">None (Top Level)</option>' +
            topLevelCats.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    }
    
    function renderCategories() {
        const incomeContainer = document.getElementById('incomeCategories');
        const expenseContainer = document.getElementById('expenseCategories');
        const transferContainer = document.getElementById('transferCategories');
        
        const incomeCats = categories.filter(c => c.type === 'income');
        const expenseCats = categories.filter(c => c.type === 'expense');
        const transferCats = categories.filter(c => c.type === 'transfer');
        
        incomeContainer.innerHTML = renderCategoryList(incomeCats);
        expenseContainer.innerHTML = renderCategoryList(expenseCats);
        transferContainer.innerHTML = renderCategoryList(transferCats);
    }
    
    function renderCategoryList(cats) {
        if (cats.length === 0) {
            return '<p class="text-base-content/60 text-sm">No categories yet</p>';
        }
        
        return cats.map(cat => `
            <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg group hover:bg-base-300 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-4 h-4 rounded-full" style="background-color: ${cat.color || '#ccc'}"></div>
                    <div>
                        <span class="font-medium">${cat.name}</span>
                        ${cat.is_system ? '<span class="badge badge-xs badge-ghost ml-2">System</span>' : ''}
                    </div>
                </div>
                <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                    ${!cat.is_system ? `
                        <button onclick="editCategory(${cat.id})" class="btn btn-ghost btn-xs">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="deleteCategory(${cat.id})" class="btn btn-ghost btn-xs text-error">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    ` : '<span class="text-xs text-base-content/40">Cannot edit</span>'}
                </div>
            </div>
        `).join('');
    }
    
    function renderStats() {
        const container = document.getElementById('categoryStats');
        
        const total = categories.length;
        const income = categories.filter(c => c.type === 'income').length;
        const expense = categories.filter(c => c.type === 'expense').length;
        const custom = categories.filter(c => !c.is_system).length;
        
        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Total Categories</p>
                        <p class="text-2xl font-bold">${total}</p>
                    </div>
                </div>
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Income Categories</p>
                        <p class="text-2xl font-bold text-success">${income}</p>
                    </div>
                </div>
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Expense Categories</p>
                        <p class="text-2xl font-bold text-error">${expense}</p>
                    </div>
                </div>
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body">
                        <p class="text-sm text-base-content/60">Custom Categories</p>
                        <p class="text-2xl font-bold text-info">${custom}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    async function handleCategorySubmit(e) {
        e.preventDefault();
        
        const data = {
            name: document.getElementById('categoryName').value,
            type: document.getElementById('categoryType').value,
            color: document.getElementById('categoryColor').value,
            icon: document.getElementById('categoryIcon').value,
            parent_id: document.getElementById('parentCategory').value || null
        };
        
        try {
            await API.categories.create(data);
            Utils.showToast('Category created successfully', 'success');
            categoryModal.close();
            e.target.reset();
            
            // Reload categories
            categories = await API.categories.list();
            renderCategories();
            renderStats();
            populateParentSelect();
            
        } catch (error) {
            Utils.showToast('Error creating category', 'error');
        }
    }
    
    window.editCategory = (id) => {
        Utils.showToast('Edit functionality coming soon!', 'info');
    };
    
    window.deleteCategory = async (id) => {
        if (!confirm('Are you sure you want to delete this category? Transactions using this category will need to be reassigned.')) return;
        
        try {
            await API.categories.delete(id);
            Utils.showToast('Category deleted', 'success');
            categories = categories.filter(c => c.id !== id);
            renderCategories();
            renderStats();
            populateParentSelect();
        } catch (error) {
            Utils.showToast('Error deleting category', 'error');
        }
    };
});