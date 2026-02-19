/**
 * Financial Goals page controller
 */

// State
let goals = [];
let editingGoalId = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('goals');
    
    // Load goals data
    await loadGoals();
    
    // Setup event listeners
    setupEventListeners();
});

// Global functions for onclick handlers
window.showCreateGoalModal = () => {
    editingGoalId = null;
    document.getElementById('goalForm').reset();
    document.getElementById('goalColor').value = '#3B82F6';
    document.getElementById('modalTitle').textContent = 'Create Goal';
    document.getElementById('goalModal').showModal();
};

window.editGoal = async (id) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) {
        Utils.showToast('Goal not found', 'error');
        return;
    }
    
    editingGoalId = id;
    
    // Populate form
    document.getElementById('goalName').value = goal.name;
    document.getElementById('goalDescription').value = goal.description || '';
    document.getElementById('goalTargetAmount').value = goal.target_amount;
    document.getElementById('goalCurrency').value = goal.currency;
    document.getElementById('goalCategory').value = goal.category || '';
    document.getElementById('goalTargetDate').value = goal.target_date || '';
    document.getElementById('goalIcon').value = goal.icon || '🎯';
    document.getElementById('goalColor').value = goal.color || '#3B82F6';
    document.getElementById('goalIsPrimary').checked = goal.is_primary;
    
    document.getElementById('modalTitle').textContent = 'Edit Goal';
    document.getElementById('goalModal').showModal();
};

window.showContributeModal = (goalId) => {
    console.log('Opening contribute modal for goal:', goalId);
    document.getElementById('contributeForm').reset();
    document.getElementById('contributeGoalId').value = goalId;
    document.getElementById('contributeDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('contributeModal').showModal();
    console.log('Contribute modal opened');
};

window.showGoalDetails = async (goalId) => {
    try {
        const [goal, transactions, progress] = await Promise.all([
            API.goals.get(goalId),
            API.goals.getTransactions(goalId),
            API.goals.getProgress(goalId)
        ]);
        
        document.getElementById('goalDetailsTitle').textContent = goal.name;
        document.getElementById('goalDetailsContent').innerHTML = renderGoalDetails(goal, transactions, progress);
        document.getElementById('goalDetailsModal').showModal();
    } catch (error) {
        console.error('Error loading goal details:', error);
        Utils.showToast('Error loading goal details', 'error');
    }
};

window.deleteGoal = async (id) => {
    const goal = goals.find(g => g.id === id);
    const goalName = goal ? goal.name : 'this goal';
    
    if (!confirm(`Are you sure you want to delete "${goalName}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        await API.goals.delete(id);
        Utils.showToast('Goal deleted successfully', 'success');
        goals = goals.filter(g => g.id !== id);
        renderGoals();
        renderSummary();
    } catch (error) {
        console.error('Error deleting goal:', error);
        Utils.showToast('Error deleting goal', 'error');
    }
};

async function loadGoals() {
    try {
        console.log('Fetching goals...');
        goals = await API.goals.list();
        console.log('Goals fetched:', goals);
        const summary = await API.goals.getSummary();
        console.log('Summary fetched:', summary);
        
        // Render main content structure
        const mainContent = document.getElementById('main-content');
        mainContent.innerHTML = `
            <div class="space-y-6">
                <!-- Summary Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="goals-summary">
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-primary/10 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60">Total Goals</p>
                                    <p class="text-2xl font-bold">${summary.total_goals}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-success/10 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60">Active Goals</p>
                                    <p class="text-2xl font-bold">${summary.active_goals}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-info/10 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60">Total Target</p>
                                    <p class="text-2xl font-bold">${Utils.formatCurrency(summary.total_target_amount)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-warning/10 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60">Overall Progress</p>
                                    <p class="text-2xl font-bold">${summary.overall_progress_percentage.toFixed(1)}%</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Goals Grid -->
                <div id="goals-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <!-- Goals will be rendered here -->
                </div>
                
                <!-- Empty State -->
                <div id="empty-state" class="hidden text-center py-16">
                    <div class="text-6xl mb-4">🎯</div>
                    <h3 class="text-xl font-bold mb-2">No goals yet</h3>
                    <p class="text-base-content/60 mb-6">Create your first financial goal to start tracking your progress</p>
                    <button onclick="showCreateGoalModal()" class="btn btn-primary">Create First Goal</button>
                </div>
            </div>
        `;
        
        renderGoals();
    } catch (error) {
        console.error('Error loading goals:', error);
        Utils.showToast('Error loading goals', 'error');
    }
}

function renderGoals() {
    const container = document.getElementById('goals-grid');
    const emptyState = document.getElementById('empty-state');
    
    if (!container) return;
    
    if (goals.length === 0) {
        container.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }
    
    emptyState?.classList.add('hidden');
    container.innerHTML = goals.map(goal => renderGoalCard(goal)).join('');
}

function renderGoalCard(goal) {
    console.log('Rendering goal card:', goal);
    const percentage = goal.progress_percentage || 0;
    const colorClass = percentage >= 100 ? 'success' : percentage >= 75 ? 'info' : percentage >= 50 ? 'warning' : 'primary';
    const isCompleted = goal.status === 'completed';
    console.log('Goal status:', goal.status, 'isCompleted:', isCompleted);
    
    return `
        <div class="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow ${isCompleted ? 'border-2 border-success' : ''}">
            <div class="card-body">
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl" 
                             style="background-color: ${goal.color || '#3B82F6'}20; color: ${goal.color || '#3B82F6'}">
                            ${goal.icon || '🎯'}
                        </div>
                        <div>
                            <h3 class="font-bold text-lg">${goal.name}</h3>
                            <p class="text-sm text-base-content/60">${goal.category || 'General'}</p>
                        </div>
                    </div>
                    <div class="flex gap-1">
                        ${goal.is_primary ? '<span class="badge badge-primary badge-sm">Primary</span>' : ''}
                        ${isCompleted ? '<span class="badge badge-success badge-sm">Completed</span>' : ''}
                    </div>
                </div>
                
                <div class="mt-4">
                    <div class="flex justify-between text-sm mb-1">
                        <span class="font-medium">${Utils.formatCurrency(goal.current_amount, goal.currency)}</span>
                        <span class="text-base-content/60">${Utils.formatCurrency(goal.target_amount, goal.currency)}</span>
                    </div>
                    <progress class="progress progress-${colorClass} w-full" value="${percentage}" max="100"></progress>
                    <div class="flex justify-between items-center mt-1">
                        <p class="text-xs text-base-content/60">${percentage.toFixed(1)}% complete</p>
                        ${goal.remaining_amount > 0 ? 
                            `<p class="text-xs text-base-content/60">${Utils.formatCurrency(goal.remaining_amount, goal.currency)} remaining</p>` : 
                            ''}
                    </div>
                </div>
                
                ${goal.monthly_contribution_needed ? `
                    <div class="alert alert-info mt-4 text-sm py-2">
                        <span>Save ${Utils.formatCurrency(goal.monthly_contribution_needed, goal.currency)}/month to reach by ${Utils.formatDate(goal.target_date)}</span>
                    </div>
                ` : ''}
                
                <div class="card-actions justify-end mt-4 gap-2">
                    ${!isCompleted ? `
                        <button onclick="showContributeModal(${goal.id})" class="btn btn-sm btn-primary">
                            Contribute
                        </button>
                    ` : ''}
                    <button onclick="showGoalDetails(${goal.id})" class="btn btn-sm btn-ghost">
                        Details
                    </button>
                    <button onclick="editGoal(${goal.id})" class="btn btn-sm btn-ghost">
                        Edit
                    </button>
                    <button onclick="deleteGoal(${goal.id})" class="btn btn-sm btn-ghost text-error">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderGoalDetails(goal, transactions, progress) {
    const percentage = goal.progress_percentage || 0;
    
    return `
        <div class="space-y-6">
            <!-- Progress Section -->
            <div class="card bg-base-200">
                <div class="card-body">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-16 h-16 rounded-full flex items-center justify-center text-3xl" 
                                 style="background-color: ${goal.color || '#3B82F6'}20; color: ${goal.color || '#3B82F6'}">
                                ${goal.icon || '🎯'}
                            </div>
                            <div>
                                <h4 class="font-bold text-xl">${goal.name}</h4>
                                <p class="text-base-content/60">${goal.category || 'General'}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-3xl font-bold">${percentage.toFixed(1)}%</p>
                            <p class="text-sm text-base-content/60">Complete</p>
                        </div>
                    </div>
                    
                    <progress class="progress progress-primary w-full" value="${percentage}" max="100"></progress>
                    
                    <div class="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <p class="text-sm text-base-content/60">Current Amount</p>
                            <p class="text-xl font-bold">${Utils.formatCurrency(goal.current_amount, goal.currency)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-base-content/60">Target Amount</p>
                            <p class="text-xl font-bold">${Utils.formatCurrency(goal.target_amount, goal.currency)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-base-content/60">Remaining</p>
                            <p class="text-xl font-bold">${Utils.formatCurrency(goal.remaining_amount, goal.currency)}</p>
                        </div>
                        ${goal.target_date ? `
                            <div>
                                <p class="text-sm text-base-content/60">Target Date</p>
                                <p class="text-xl font-bold">${Utils.formatDate(goal.target_date)}</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${progress.monthly_contribution_needed ? `
                        <div class="alert alert-info mt-4">
                            <span>To reach your goal by ${Utils.formatDate(goal.target_date)}, save ${Utils.formatCurrency(progress.monthly_contribution_needed, goal.currency)}/month</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Transactions Section -->
            <div>
                <h4 class="font-bold text-lg mb-4">Recent Transactions</h4>
                ${transactions.length > 0 ? `
                    <div class="space-y-2">
                        ${transactions.map(tx => `
                            <div class="flex justify-between items-center p-3 bg-base-200 rounded-lg">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'contribution' ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}">
                                        ${tx.type === 'contribution' ? '↓' : '↑'}
                                    </div>
                                    <div>
                                        <p class="font-medium">${tx.type === 'contribution' ? 'Contribution' : 'Withdrawal'}</p>
                                        ${tx.description ? `<p class="text-sm text-base-content/60">${tx.description}</p>` : ''}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <p class="font-bold ${tx.type === 'contribution' ? 'text-success' : 'text-error'}">
                                        ${tx.type === 'contribution' ? '+' : '-'}${Utils.formatCurrency(tx.amount, goal.currency)}
                                    </p>
                                    <p class="text-sm text-base-content/60">${Utils.formatDate(tx.date)}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <p class="text-base-content/60 text-center py-4">No transactions yet</p>
                `}
            </div>
        </div>
    `;
}

function renderSummary() {
    // Summary is already rendered in loadGoals, this function is for updates after delete
    // Reload goals to get updated summary
    loadGoals();
}

function setupEventListeners() {
    // Create/Edit goal form
    document.getElementById('goalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted, editingGoalId:', editingGoalId);

        const formData = new FormData(e.target);
        console.log('FormData entries:');
        for (let [key, value] of formData.entries()) {
            console.log(`  ${key}: ${value}`);
        }

        const data = {
            name: formData.get('name'),
            description: formData.get('description') || null,
            target_amount: parseFloat(formData.get('target_amount')),
            currency: formData.get('currency'),
            category: formData.get('category') || null,
            target_date: formData.get('target_date') || null,
            icon: formData.get('icon'),
            color: formData.get('color'),
            is_primary: formData.get('is_primary') === 'on'
        };
        console.log('Data to be sent:', data);

        try {
            if (editingGoalId) {
                console.log('Updating goal...');
                await API.goals.update(editingGoalId, data);
                Utils.showToast('Goal updated successfully', 'success');
            } else {
                console.log('Creating goal...');
                const result = await API.goals.create(data);
                console.log('Goal created:', result);
                Utils.showToast('Goal created successfully', 'success');
            }

            document.getElementById('goalModal').close();
            await loadGoals();
        } catch (error) {
            console.error('Error saving goal:', error);
            Utils.showToast(error.message || 'Error saving goal', 'error');
        }
    });
    
    // Contribute form
    document.getElementById('contributeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const goalId = parseInt(document.getElementById('contributeGoalId').value);
        const data = {
            amount: parseFloat(document.getElementById('contributeAmount').value),
            type: document.getElementById('contributeType').value,
            description: document.getElementById('contributeDescription').value || null,
            date: document.getElementById('contributeDate').value
        };
        
        try {
            await API.goals.addTransaction(goalId, data);
            Utils.showToast('Transaction added successfully', 'success');
            document.getElementById('contributeModal').close();
            await loadGoals();
        } catch (error) {
            console.error('Error adding transaction:', error);
            Utils.showToast(error.message || 'Error adding transaction', 'error');
        }
    });
}
