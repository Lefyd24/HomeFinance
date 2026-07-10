/**
 * Reports > Budget & Savings tab.
 *
 * Budget actual-vs-limit progress bars (daisyUI progress, colored by threshold)
 * plus a savings-rate trend line. Forecast projection is omitted — no dedicated
 * analytics forecast endpoint is wired in this app yet.
 */
(function () {
    let savingsChart = null;

    function progressColor(pct) {
        if (pct > 100) return 'progress-error';
        if (pct >= 80) return 'progress-warning';
        return 'progress-success';
    }

    function avgRate(rateArr) {
        const valid = (rateArr || []).filter(r => r !== null && r !== undefined && !Number.isNaN(r));
        if (!valid.length) return null;
        return valid.reduce((a, b) => a + b, 0) / valid.length;
    }

    async function render(host, filters) {
        const params = window.ReportFilters ? window.ReportFilters.params() : {};

        if (savingsChart) { savingsChart.dispose(); savingsChart = null; }

        const [budgetPerf, savingsRate] = await Promise.all([
            API.reports.budgetPerformance(params),
            API.reports.savingsRate(params)
        ]);

        const budgets = budgetPerf.budgets || [];
        const labels = savingsRate.labels || [];
        const rates = savingsRate.rate || [];
        const avg = avgRate(rates);
        const latestRate = rates.length ? rates[rates.length - 1] : null;

        const overBudget = budgets.filter(b => (b.pct || 0) > 100).length;
        const onTrack = budgets.filter(b => (b.pct || 0) <= 80).length;

        const budgetRows = budgets.length
            ? budgets.map(b => {
                const pct = Math.min(Math.max(b.pct || 0, 0), 100);
                const displayPct = Math.round(b.pct || 0);
                return `
                    <div class="space-y-1">
                        <div class="flex justify-between items-baseline gap-2 text-sm">
                            <span class="font-medium truncate">${b.name}</span>
                            <span class="text-xs text-base-content/60 whitespace-nowrap fin-numeric">
                                ${Utils.formatCurrency(b.spent || 0)} / ${Utils.formatCurrency(b.limit || 0)}
                                <span class="${displayPct > 100 ? 'text-error' : displayPct >= 80 ? 'text-warning' : 'text-success'}">
                                    (${displayPct}%)
                                </span>
                            </span>
                        </div>
                        <progress class="progress ${progressColor(b.pct || 0)} w-full" value="${pct}" max="100"></progress>
                    </div>
                `;
            }).join('')
            : '<p class="text-sm text-base-content/50 py-4">No budgets configured. Create budgets on the Budgets page to track spending limits here.</p>';

        host.innerHTML = `
            <div class="space-y-4">
                <div class="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Active Budgets</div>
                        <div class="stat-value text-xl sm:text-2xl">${budgets.length}</div>
                        <div class="stat-desc text-xs">${onTrack} on track · ${overBudget} over limit</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Avg Savings Rate</div>
                        <div class="stat-value text-xl sm:text-2xl ${avg === null ? '' : (avg >= 0 ? 'text-success' : 'text-error')}">
                            ${avg === null ? '—' : `${avg.toFixed(1)}%`}
                        </div>
                        <div class="stat-desc text-xs">Over selected range</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Latest Month</div>
                        <div class="stat-value text-xl sm:text-2xl ${latestRate === null ? '' : (latestRate >= 0 ? 'text-success' : 'text-error')}">
                            ${latestRate === null ? '—' : `${latestRate.toFixed(1)}%`}
                        </div>
                        <div class="stat-desc text-xs">${labels.length ? labels[labels.length - 1] : 'No data'}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Budget Performance</h3>
                            <p class="text-xs text-base-content/50 -mt-1">Spend vs limit for each budget</p>
                            <div class="space-y-4 mt-2">${budgetRows}</div>
                        </div>
                    </div>
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Savings Rate Trend</h3>
                            <p class="text-xs text-base-content/50 -mt-1">(Income − Expenses) ÷ Income per month</p>
                            <div id="budgetSavingsChart" style="height: 320px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const savingsEl = document.getElementById('budgetSavingsChart');
        if (labels.length) {
            const p = FinCharts.palette();
            savingsChart = FinCharts.line(savingsEl, {
                labels,
                series: [{ name: 'Savings Rate %', data: rates, color: p.income }],
                area: true
            });
            // Override y-axis to show percentages instead of euros
            savingsChart.setOption({
                tooltip: {
                    trigger: 'axis', appendToBody: true, confine: true, transitionDuration: 0,
                    backgroundColor: 'rgba(20,20,25,0.92)', borderWidth: 0,
                    textStyle: { color: '#fff', fontSize: 12 },
                    valueFormatter: (v) => `${Number(v).toFixed(1)}%`
                },
                yAxis: {
                    type: 'value',
                    splitLine: { lineStyle: { color: FinCharts.palette().grid } },
                    axisLabel: { color: p.text, formatter: (v) => `${v}%` }
                }
            });
        } else {
            savingsEl.innerHTML = '<div class="flex items-center justify-center h-full text-base-content/50 text-sm">No savings rate data for this range</div>';
        }
    }

    window.ReportTabs.register('budget', { label: 'Budget & Savings', render });
})();
