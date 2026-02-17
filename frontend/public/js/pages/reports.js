/**
 * Reports page controller
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    // Render layout
    Layout.render('reports');
    
    // State
    let currentReport = null;
    let reportChart = null;
    
    // Get main content container
    const mainContent = document.getElementById('main-content');
    
    // Render page content
    mainContent.innerHTML = `
        <div class="space-y-6">
            <!-- Header -->
            <div>
                <h2 class="text-2xl font-bold">Reports</h2>
                <p class="text-base-content/60">Generate insights from your financial data</p>
            </div>
            
            <!-- Report Builder -->
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">Report Configuration</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div class="form-control">
                            <label class="label"><span class="label-text">Report Type</span></label>
                            <select id="reportType" class="select select-bordered" onchange="onReportTypeChange()">
                                <option value="spending">Spending by Category</option>
                                <option value="income">Income Analysis</option>
                                <option value="cashflow">Cash Flow</option>
                                <option value="trend">Trend Analysis</option>
                                <option value="balance">Balance History</option>
                            </select>
                        </div>
                        
                        <div class="form-control">
                            <label class="label"><span class="label-text">From Date</span></label>
                            <input type="date" id="reportFromDate" class="input input-bordered" value="${Utils.getFirstDayOfMonth()}">
                        </div>
                        
                        <div class="form-control">
                            <label class="label"><span class="label-text">To Date</span></label>
                            <input type="date" id="reportToDate" class="input input-bordered" value="${Utils.getLastDayOfMonth()}">
                        </div>
                        
                        <div class="form-control">
                            <label class="label"><span class="label-text">Group By</span></label>
                            <select id="groupBy" class="select select-bordered">
                                <option value="day">Day</option>
                                <option value="week">Week</option>
                                <option value="month" selected>Month</option>
                                <option value="year">Year</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap gap-4 mt-4">
                        <button onclick="generateReport()" class="btn btn-primary">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Generate Report
                        </button>
                        <button onclick="exportReport()" class="btn btn-outline" ${!currentReport ? 'disabled' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export
                        </button>
                        <button onclick="saveReport()" class="btn btn-outline" ${!currentReport ? 'disabled' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                            Save Report
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Report Display -->
            <div id="reportDisplay" class="card bg-base-100 shadow-xl ${!currentReport ? 'hidden' : ''}">
                <div class="card-body">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="card-title" id="reportTitle">Report</h3>
                        <div class="btn-group">
                            <button onclick="changeChartType('bar')" class="btn btn-sm btn-outline">Bar</button>
                            <button onclick="changeChartType('line')" class="btn btn-sm btn-outline">Line</button>
                            <button onclick="changeChartType('pie')" class="btn btn-sm btn-outline">Pie</button>
                        </div>
                    </div>
                    
                    <div class="h-96">
                        <canvas id="reportChart"></canvas>
                    </div>
                    
                    <!-- Report Data Table -->
                    <div class="mt-6">
                        <h4 class="font-semibold mb-2">Report Data</h4>
                        <div id="reportDataTable" class="overflow-x-auto"></div>
                    </div>
                </div>
            </div>
            
            <!-- Saved Reports -->
            <div class="card bg-base-100 shadow-sm">
                <div class="card-body">
                    <h3 class="card-title">Saved Reports</h3>
                    <div id="savedReports"></div>
                </div>
            </div>
        </div>
    `;
    
    // Initialize
    await initialize();
    
    async function initialize() {
        try {
            loadSavedReports();
        } catch (error) {
            console.error('Error initializing:', error);
        }
    }
    
    window.onReportTypeChange = () => {
        // Update group by options based on report type
        const type = document.getElementById('reportType').value;
        const groupBy = document.getElementById('groupBy');
        
        if (type === 'spending' || type === 'income') {
            groupBy.innerHTML = `
                <option value="category">Category</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
            `;
        } else {
            groupBy.innerHTML = `
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month" selected>Month</option>
                <option value="year">Year</option>
            `;
        }
    };
    
    window.generateReport = async () => {
        const type = document.getElementById('reportType').value;
        const startDate = document.getElementById('reportFromDate').value;
        const endDate = document.getElementById('reportToDate').value;
        const groupBy = document.getElementById('groupBy').value;
        
        try {
            Utils.showToast('Generating report...', 'info');
            
            let data;
            switch (type) {
                case 'spending':
                    data = await API.reports.spending({ start_date: startDate, end_date: endDate, group_by: groupBy });
                    break;
                case 'income':
                    data = await API.reports.income({ start_date: startDate, end_date: endDate, group_by: groupBy });
                    break;
                case 'cashflow':
                    data = await API.reports.cashflow({ start_date: startDate, end_date: endDate, group_by: groupBy });
                    break;
                case 'trend':
                    data = await API.reports.trend({ start_date: startDate, end_date: endDate, group_by: groupBy });
                    break;
                case 'balance':
                    data = await API.reports.balanceHistory({ start_date: startDate, end_date: endDate });
                    break;
            }
            
            currentReport = { type, data, startDate, endDate, groupBy };
            displayReport();
            
        } catch (error) {
            Utils.showToast('Error generating report', 'error');
        }
    };
    
    function displayReport() {
        if (!currentReport) return;
        
        const { type, data } = currentReport;
        
        // Show report display
        document.getElementById('reportDisplay').classList.remove('hidden');
        
        // Update title
        const titles = {
            spending: 'Spending by Category',
            income: 'Income Analysis',
            cashflow: 'Cash Flow',
            trend: 'Trend Analysis',
            balance: 'Balance History'
        };
        document.getElementById('reportTitle').textContent = titles[type] || 'Report';
        
        // Destroy existing chart
        if (reportChart) {
            reportChart.destroy();
        }
        
        // Create new chart
        const ctx = document.getElementById('reportChart').getContext('2d');
        
        let chartType = 'bar';
        let chartData = {
            labels: data.labels,
            datasets: [{
                label: titles[type],
                data: data.data,
                backgroundColor: type === 'spending' ? [
                    '#EF4444', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#6B7280'
                ] : '#3B82F6',
                borderRadius: 4
            }]
        };
        
        if (type === 'cashflow') {
            chartType = 'line';
            chartData.datasets = [
                {
                    label: 'Income',
                    data: data.income,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true
                },
                {
                    label: 'Expenses',
                    data: data.expenses,
                    borderColor: '#EF4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true
                }
            ];
        }
        
        reportChart = new Chart(ctx, {
            type: chartType,
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: type === 'cashflow'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '€' + value;
                            }
                        }
                    }
                }
            }
        });
        
        // Render data table
        renderReportTable(data);
    }
    
    function renderReportTable(data) {
        const container = document.getElementById('reportDataTable');
        
        let rows = '';
        if (data.labels && data.data) {
            if (Array.isArray(data.data[0])) {
                // Multiple datasets
                rows = data.labels.map((label, i) => `
                    <tr>
                        <td>${label}</td>
                        ${data.data.map(dataset => `<td>${Utils.formatCurrency(dataset[i])}</td>`).join('')}
                    </tr>
                `).join('');
            } else {
                // Single dataset
                rows = data.labels.map((label, i) => `
                    <tr>
                        <td>${label}</td>
                        <td>${Utils.formatCurrency(data.data[i])}</td>
                    </tr>
                `).join('');
            }
        }
        
        container.innerHTML = `
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Period</th>
                        ${Array.isArray(data.data[0]) ? 
                            '<th>Income</th><th>Expenses</th>' : 
                            '<th>Amount</th>'}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }
    
    window.changeChartType = (type) => {
        if (!reportChart) return;
        
        const config = reportChart.config;
        config.type = type;
        reportChart.destroy();
        
        const ctx = document.getElementById('reportChart').getContext('2d');
        reportChart = new Chart(ctx, config);
    };
    
    window.exportReport = () => {
        Utils.showToast('Export functionality coming soon!', 'info');
    };
    
    window.saveReport = () => {
        const name = prompt('Enter a name for this report:');
        if (name && currentReport) {
            Utils.showToast(`Report "${name}" saved!`, 'success');
            loadSavedReports();
        }
    };
    
    async function loadSavedReports() {
        try {
            const reports = await API.reports.saved();
            const container = document.getElementById('savedReports');
            
            if (!reports || reports.length === 0) {
                container.innerHTML = '<p class="text-base-content/60">No saved reports yet</p>';
                return;
            }
            
            container.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    ${reports.map(report => `
                        <div class="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors" onclick="loadSavedReport(${report.id})">
                            <div class="card-body">
                                <h4 class="font-semibold">${report.name}</h4>
                                <p class="text-sm text-base-content/60">${report.report_type}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            document.getElementById('savedReports').innerHTML = '<p class="text-base-content/60">Unable to load saved reports</p>';
        }
    }
    
    window.loadSavedReport = (id) => {
        Utils.showToast('Loading saved report...', 'info');
    };
});