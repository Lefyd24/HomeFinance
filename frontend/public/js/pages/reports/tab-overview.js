/**
 * Reports > Overview tab.
 *
 * KPI stat tiles (net cashflow, total spend, savings rate, net worth) plus
 * a compact cashflow combo chart and a ranked-categories bar, all driven by
 * the shared ReportFilters/FinCharts building blocks from Task 5/8.
 */
(function () {
    let overviewRankedChart = null;

    function fmtPct(n) {
        if (n === null || n === undefined || Number.isNaN(n)) return '—';
        return `${n >= 0 ? '' : ''}${n.toFixed(1)}%`;
    }

    function sum(arr) {
        return (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
    }

    async function render(host, filters) {
        const params = window.ReportFilters ? window.ReportFilters.params() : {};

        const [cashflow, netWorth, savingsRate, breakdown] = await Promise.all([
            API.reports.cashflow({ ...params, group_by: 'month' }),
            API.reports.netWorth(params),
            API.reports.savingsRate(params),
            API.reports.categoryBreakdown(params)
        ]);

        const income = cashflow.income || [];
        const expenses = cashflow.expenses || [];
        const labels = cashflow.labels || [];

        const totalIncome = sum(income);
        const totalSpend = sum(expenses);
        const netCashflow = totalIncome - totalSpend;

        const rates = (savingsRate.rate || []).filter(r => r !== null && r !== undefined && !Number.isNaN(r));
        const avgSavingsRate = rates.length ? sum(rates) / rates.length : null;

        const nwData = netWorth.data || [];
        const currentNetWorth = nwData.length ? nwData[nwData.length - 1] : null;

        const categories = (breakdown.categories || []).slice().sort((a, b) => (b.amount || 0) - (a.amount || 0));

        host.innerHTML = `
            <div class="space-y-4">
                <div class="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Net Cashflow</div>
                        <div class="stat-value text-xl sm:text-2xl ${netCashflow >= 0 ? 'text-success' : 'text-error'}">
                            ${netCashflow >= 0 ? '' : '-'}${Utils.formatCurrency(Math.abs(netCashflow))}
                        </div>
                        <div class="stat-desc text-xs">Income minus expenses over selected range</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Total Spend</div>
                        <div class="stat-value text-xl sm:text-2xl">${Utils.formatCurrency(totalSpend)}</div>
                        <div class="stat-desc text-xs">${labels.length} month${labels.length === 1 ? '' : 's'} in range</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Savings Rate</div>
                        <div class="stat-value text-xl sm:text-2xl ${avgSavingsRate === null ? '' : (avgSavingsRate >= 0 ? 'text-success' : 'text-error')}">
                            ${avgSavingsRate === null ? '—' : fmtPct(avgSavingsRate)}
                        </div>
                        <div class="stat-desc text-xs">Average over selected range</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Net Worth</div>
                        <div class="stat-value text-xl sm:text-2xl ${currentNetWorth === null ? '' : (currentNetWorth >= 0 ? 'text-success' : 'text-error')}">
                            ${currentNetWorth === null ? '—' : Utils.formatCurrency(currentNetWorth)}
                        </div>
                        <div class="stat-desc text-xs">As of end of range</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div class="card bg-base-100 shadow-sm xl:col-span-2">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Cashflow</h3>
                            <div id="overviewCashflowChart" style="height: 320px;"></div>
                        </div>
                    </div>
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Ranked Categories</h3>
                            <div id="overviewCategoryRanked" style="height: 320px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const p = FinCharts.palette();
        const net = labels.map((_, i) => (income[i] || 0) - (expenses[i] || 0));

        FinCharts.combo(document.getElementById('overviewCashflowChart'), {
            labels,
            bars: [
                { name: 'Income', data: income, color: p.income },
                { name: 'Expenses', data: expenses, color: p.expense }
            ],
            line: { name: 'Net', data: net, color: p.primary }
        });

        const rankedEl = document.getElementById('overviewCategoryRanked');
        if (overviewRankedChart) {
            overviewRankedChart.dispose();
            overviewRankedChart = null;
        }
        if (categories.length) {
            rankedEl.style.height = Math.max(240, categories.length * 30 + 40) + 'px';
            overviewRankedChart = FinCharts.rankedBar(rankedEl, { categories, labelTopN: 6 });
        } else {
            rankedEl.innerHTML = '<div class="flex items-center justify-center h-full text-base-content/50 text-sm">No category data for this range</div>';
        }
    }

    window.ReportTabs.register('overview', { label: 'Overview', render });
})();
