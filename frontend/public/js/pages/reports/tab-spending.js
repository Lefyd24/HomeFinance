/**
 * Reports > Spending tab.
 *
 * Category donut + ranked category bars (with click-to-drilldown into a
 * transactions table), a top-merchants bar, a month-over-month spending line
 * (tooltip shows the % change), and a weekday spend heatmap. Mirrors the
 * structure of tab-overview.js / tab-cashflow.js.
 *
 * Note: most seed data is uncategorized, so the category-based charts
 * (donut, ranked bars, drilldown) can legitimately be empty for a given
 * range — that's handled as a graceful empty state, not a bug.
 */
(function () {
    let donutChart = null;
    let rankedBarChart = null;
    let merchantChart = null;
    let momChart = null;
    let heatmapChart = null;

    // category name -> id, built from API.categories.list() so donut/bar
    // clicks can drive API.transactions.list({ category_id }).
    let categoryIdByName = {};

    function sum(arr) {
        return (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
    }

    function emptyState(message) {
        return `<div class="flex items-center justify-center h-full text-base-content/50 text-sm">${message}</div>`;
    }

    function renderTransactionRows(items) {
        if (!items || !items.length) {
            return '<tr><td colspan="4" class="text-center text-base-content/50 py-6">No transactions found</td></tr>';
        }
        return items.map(tx => `
            <tr>
                <td class="whitespace-nowrap">${Utils.formatDate(tx.date)}</td>
                <td>${tx.description || ''}</td>
                <td>${tx.category_name || '<span class="text-base-content/40">Uncategorized</span>'}</td>
                <td class="text-right ${tx.type === 'income' ? 'text-success' : 'text-error'}">
                    ${tx.type === 'income' ? '' : '-'}${Utils.formatCurrency(Math.abs(tx.amount))}
                </td>
            </tr>
        `).join('');
    }

    async function loadDrilldown(host, params, categoryId, categoryName) {
        const titleEl = host.querySelector('#spendingDrilldownTitle');
        const bodyEl = host.querySelector('#spendingDrilldownBody');
        if (!titleEl || !bodyEl) return;

        titleEl.textContent = `Transactions — ${categoryName}`;
        bodyEl.innerHTML = `
            <tr><td colspan="4" class="text-center py-6">
                <span class="loading loading-spinner loading-sm text-primary"></span>
            </td></tr>
        `;

        try {
            const result = await API.transactions.list({
                category_id: categoryId,
                start_date: params.start_date,
                end_date: params.end_date,
                per_page: 100
            });
            bodyEl.innerHTML = renderTransactionRows(result.items);
        } catch (e) {
            console.error('Spending drilldown: failed to load transactions', e);
            bodyEl.innerHTML = '<tr><td colspan="4" class="text-center text-error py-6">Failed to load transactions</td></tr>';
        }
    }

    async function render(host, filters) {
        const params = window.ReportFilters ? window.ReportFilters.params() : {};

        [donutChart, rankedBarChart, merchantChart, momChart, heatmapChart].forEach(c => {
            if (c) c.dispose();
        });
        donutChart = rankedBarChart = merchantChart = momChart = heatmapChart = null;

        const [breakdown, merchants, mom, heatmap, categories] = await Promise.all([
            API.reports.categoryBreakdown(params),
            API.reports.topMerchants(params),
            API.reports.spendingMom(params),
            API.reports.weekdayHeatmap(params),
            API.categories.list('expense').catch(() => [])
        ]);

        categoryIdByName = {};
        (categories || []).forEach(c => { categoryIdByName[c.name] = c.id; });

        const cats = (breakdown.categories || []).slice().sort((a, b) => (b.amount || 0) - (a.amount || 0));
        const totalSpend = sum(cats.map(c => c.amount));

        const merchantLabels = merchants.labels || [];
        const merchantData = merchants.data || [];

        const momLabels = mom.labels || [];
        const momData = mom.data || [];
        const momChanges = mom.changes || [];

        const weekdays = heatmap.weekdays || [];
        const heatmapData = heatmap.data || [];

        host.innerHTML = `
            <div class="space-y-4">
                <div class="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Total Spend</div>
                        <div class="stat-value text-xl sm:text-2xl text-error">${Utils.formatCurrency(totalSpend)}</div>
                        <div class="stat-desc text-xs">${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} in range</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Top Category</div>
                        <div class="stat-value text-xl sm:text-2xl">${cats.length ? cats[0].name : '—'}</div>
                        <div class="stat-desc text-xs">${cats.length ? Utils.formatCurrency(cats[0].amount) : 'No categorized spending'}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Top Merchant</div>
                        <div class="stat-value text-xl sm:text-2xl">${merchantLabels.length ? merchantLabels[0] : '—'}</div>
                        <div class="stat-desc text-xs">${merchantData.length ? Utils.formatCurrency(merchantData[0]) : 'No merchant data'}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Spending by Category</h3>
                            <div id="spendingCategoryDonut" style="height: 300px;"></div>
                        </div>
                    </div>
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Ranked Categories</h3>
                            <p class="text-xs text-base-content/50 -mt-1">Click a bar to see its transactions</p>
                            <div id="spendingCategoryBar" style="height: 300px;"></div>
                        </div>
                    </div>
                </div>

                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body p-4">
                        <h3 class="card-title text-base" id="spendingDrilldownTitle">Transactions</h3>
                        <div class="overflow-x-auto">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Merchant</th>
                                        <th>Category</th>
                                        <th class="text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody id="spendingDrilldownBody">
                                    <tr><td colspan="4" class="text-center text-base-content/50 py-6">Click a category above to see its transactions</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Top Merchants</h3>
                            <div id="spendingMerchantChart" style="height: 300px;"></div>
                        </div>
                    </div>
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Month-over-Month Spending</h3>
                            <div id="spendingMomChart" style="height: 300px;"></div>
                        </div>
                    </div>
                </div>

                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body p-4">
                        <h3 class="card-title text-base">Spending by Weekday</h3>
                        <p class="text-xs text-base-content/50 -mt-1 mb-1">Taller bars = more spend that day</p>
                        <div id="spendingHeatmap" class="fin-weekday-chart" style="height: 220px;"></div>
                    </div>
                </div>
            </div>
        `;

        const p = FinCharts.palette();

        // --- Category donut -------------------------------------------------
        const donutEl = document.getElementById('spendingCategoryDonut');
        if (cats.length) {
            donutChart = FinCharts.donut(donutEl, {
                labels: cats.map(c => c.name),
                data: cats.map(c => c.amount)
            });
            donutChart.on('click', (evt) => {
                const catId = categoryIdByName[evt.name];
                if (catId !== undefined) loadDrilldown(host, params, catId, evt.name);
            });
        } else {
            donutEl.innerHTML = emptyState('No categorized spending for this range');
        }

        // --- Ranked category bars (horizontal), top-6 labeled, rest on hover --
        const barEl = document.getElementById('spendingCategoryBar');
        if (cats.length) {
            barEl.style.height = Math.max(240, cats.length * 30 + 40) + 'px';
            rankedBarChart = FinCharts.rankedBar(barEl, {
                categories: cats,
                labelTopN: 6,
                valueFormatter: (v) => Utils.formatCurrency(Number(v)),
                onClick: (cat) => {
                    const catId = categoryIdByName[cat.name];
                    if (catId !== undefined) loadDrilldown(host, params, catId, cat.name);
                }
            });
        } else {
            barEl.innerHTML = emptyState('No categorized spending for this range');
        }

        // --- Top merchants ----------------------------------------------------
        const merchantEl = document.getElementById('spendingMerchantChart');
        if (merchantLabels.length) {
            merchantChart = FinCharts.bar(merchantEl, {
                labels: merchantLabels,
                series: [{ name: 'Spend', data: merchantData, color: p.expense }]
            });
        } else {
            merchantEl.innerHTML = emptyState('No merchant data for this range');
        }

        // --- Month-over-month spending (custom tooltip w/ % change) ----------
        const momEl = document.getElementById('spendingMomChart');
        if (momLabels.length) {
            momChart = FinCharts.init(momEl);
            momChart.setOption({
                ...FinCharts.baseOptions(),
                tooltip: {
                    trigger: 'axis', appendToBody: true, confine: true, transitionDuration: 0,
                    backgroundColor: 'rgba(20,20,25,0.92)', borderWidth: 0,
                    textStyle: { color: '#fff', fontSize: 12 },
                    formatter: (paramsArr) => {
                        const idx = paramsArr[0].dataIndex;
                        const change = momChanges[idx];
                        const changeStr = (change === undefined || change === null)
                            ? ''
                            : `<br/>${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs prior month`;
                        return `${momLabels[idx]}<br/>${Utils.formatCurrency(momData[idx])}${changeStr}`;
                    }
                },
                xAxis: {
                    type: 'category', data: momLabels, axisLine: { show: false },
                    axisTick: { show: false }, axisLabel: { color: p.text }
                },
                yAxis: {
                    type: 'value', splitLine: { lineStyle: { color: p.grid } },
                    axisLabel: { color: p.text, formatter: (v) => '€' + v }
                },
                series: [{
                    name: 'Spending', type: 'line', smooth: true,
                    data: momData,
                    ...FinCharts.lineInteraction(p.expense, {
                        areaOpacity: 0.1,
                        showSymbol: true,
                        symbolSize: 6,
                    })
                }]
            });
        } else {
            momEl.innerHTML = emptyState('No spending trend data for this range');
        }

        // --- Weekday heatmap ----------------------------------------------------
        const heatmapEl = document.getElementById('spendingHeatmap');
        if (weekdays.length && sum(heatmapData) > 0) {
            heatmapChart = FinCharts.weekdaySpend(heatmapEl, { xLabels: weekdays, data: heatmapData });
        } else {
            heatmapEl.innerHTML = emptyState('No weekday spending data for this range');
        }
    }

    window.ReportTabs.register('spending', { label: 'Spending', render });
})();
