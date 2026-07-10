/**
 * Reports > Cashflow & Net Worth tab.
 *
 * Income-vs-expense bars with a net line (FinCharts.combo), a balance-history
 * area chart with one series per account plus a Total (FinCharts.line with
 * area:true), a period-over-period compare KPI row, and a Period | Income |
 * Expenses | Net data table. Mirrors the structure of tab-overview.js.
 */
(function () {
    let cashflowChart = null;
    let balanceChart = null;

    function sum(arr) {
        return (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
    }

    function daysBetween(startISO, endISO) {
        const start = new Date(startISO);
        const end = new Date(endISO);
        return Math.max(1, Math.round((end - start) / 86400000));
    }

    function toISO(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    // Compute the immediately-preceding period of the same length, so we can
    // show period-over-period deltas without a dedicated backend endpoint.
    function previousPeriodParams(params) {
        const span = daysBetween(params.start_date, params.end_date);
        const start = new Date(params.start_date);
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - span);
        return { ...params, start_date: toISO(prevStart), end_date: toISO(prevEnd) };
    }

    function deltaBadge(current, previous) {
        if (previous === null || previous === undefined || previous === 0) return '';
        const pct = ((current - previous) / Math.abs(previous)) * 100;
        if (!Number.isFinite(pct)) return '';
        const up = pct >= 0;
        return `<span class="text-xs ${up ? 'text-success' : 'text-error'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs prior period</span>`;
    }

    async function render(host, filters) {
        const params = window.ReportFilters ? window.ReportFilters.params() : {};
        const prevParams = previousPeriodParams(params);

        const [cashflow, netWorth, balanceHistory, prevCashflow] = await Promise.all([
            API.reports.cashflow({ ...params, group_by: 'month' }),
            API.reports.netWorth(params),
            API.reports.balanceHistory(params),
            API.reports.cashflow({ ...prevParams, group_by: 'month' }).catch(() => ({ income: [], expenses: [] }))
        ]);

        const labels = cashflow.labels || [];
        const income = cashflow.income || [];
        const expenses = cashflow.expenses || [];
        const net = labels.map((_, i) => (income[i] || 0) - (expenses[i] || 0));

        const totalIncome = sum(income);
        const totalExpenses = sum(expenses);
        const totalNet = totalIncome - totalExpenses;

        const prevIncome = sum(prevCashflow.income || []);
        const prevExpenses = sum(prevCashflow.expenses || []);
        const prevNet = prevIncome - prevExpenses;

        const nwData = netWorth.data || [];
        const currentNetWorth = nwData.length ? nwData[nwData.length - 1] : null;
        const startNetWorth = nwData.length ? nwData[0] : null;
        const netWorthChange = (currentNetWorth !== null && startNetWorth !== null) ? currentNetWorth - startNetWorth : null;

        const tableRows = labels.map((label, i) => {
            const inc = income[i] || 0;
            const exp = expenses[i] || 0;
            const rowNet = inc - exp;
            return `
                <tr>
                    <td>${label}</td>
                    <td class="text-success">${Utils.formatCurrency(inc)}</td>
                    <td class="text-error">${Utils.formatCurrency(exp)}</td>
                    <td class="${rowNet >= 0 ? 'text-success' : 'text-error'}">${rowNet >= 0 ? '' : '-'}${Utils.formatCurrency(Math.abs(rowNet))}</td>
                </tr>
            `;
        }).join('');

        host.innerHTML = `
            <div class="space-y-4">
                <div class="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Income</div>
                        <div class="stat-value text-xl sm:text-2xl text-success">${Utils.formatCurrency(totalIncome)}</div>
                        <div class="stat-desc">${deltaBadge(totalIncome, prevIncome) || '&nbsp;'}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Expenses</div>
                        <div class="stat-value text-xl sm:text-2xl text-error">${Utils.formatCurrency(totalExpenses)}</div>
                        <div class="stat-desc">${deltaBadge(totalExpenses, prevExpenses) || '&nbsp;'}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Net Cashflow</div>
                        <div class="stat-value text-xl sm:text-2xl ${totalNet >= 0 ? 'text-success' : 'text-error'}">
                            ${totalNet >= 0 ? '' : '-'}${Utils.formatCurrency(Math.abs(totalNet))}
                        </div>
                        <div class="stat-desc">${deltaBadge(totalNet, prevNet) || '&nbsp;'}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Net Worth</div>
                        <div class="stat-value text-xl sm:text-2xl ${currentNetWorth === null ? '' : (currentNetWorth >= 0 ? 'text-success' : 'text-error')}">
                            ${currentNetWorth === null ? '—' : Utils.formatCurrency(currentNetWorth)}
                        </div>
                        <div class="stat-desc text-xs">
                            ${netWorthChange === null ? 'As of end of range' : `${netWorthChange >= 0 ? '+' : '-'}${Utils.formatCurrency(Math.abs(netWorthChange))} over range`}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Income vs Expenses</h3>
                            <div id="cashflowComboChart" style="height: 320px;"></div>
                        </div>
                    </div>
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Account Balances</h3>
                            <div id="cashflowBalanceChart" style="height: 320px;"></div>
                        </div>
                    </div>
                </div>

                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body p-4">
                        <h3 class="card-title text-base">Period Breakdown</h3>
                        <div class="overflow-x-auto">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>Income</th>
                                        <th>Expenses</th>
                                        <th>Net</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows || '<tr><td colspan="4" class="text-center text-base-content/50 py-6">No data for this range</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const p = FinCharts.palette();

        if (cashflowChart) { cashflowChart.dispose(); cashflowChart = null; }
        cashflowChart = FinCharts.combo(document.getElementById('cashflowComboChart'), {
            labels,
            bars: [
                { name: 'Income', data: income, color: p.income },
                { name: 'Expenses', data: expenses, color: p.expense }
            ],
            line: { name: 'Net', data: net, color: p.primary }
        });

        if (balanceChart) { balanceChart.dispose(); balanceChart = null; }
        const balanceEl = document.getElementById('cashflowBalanceChart');
        const bhSeries = balanceHistory.series || [];
        if (bhSeries.length) {
            balanceChart = FinCharts.line(balanceEl, {
                labels: balanceHistory.labels || [],
                series: bhSeries.map((s, i) => ({
                    name: s.name,
                    data: s.data,
                    color: s.name === 'Total' ? p.primary : p.ramp[i % p.ramp.length]
                })),
                area: true
            });
        } else {
            balanceEl.innerHTML = '<div class="flex items-center justify-center h-full text-base-content/50 text-sm">No balance data for this range</div>';
        }
    }

    window.ReportTabs.register('cashflow', { label: 'Cashflow & Net Worth', render });
})();
