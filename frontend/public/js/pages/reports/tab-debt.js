/**
 * Reports > Debt tab.
 *
 * Payoff-progress bars per debt, portfolio KPIs, a balances donut, and a
 * detail table (Debt | Original | Current | Paid % | Rate).
 */
(function () {
    let balanceDonut = null;

    function fmtRate(rate) {
        if (rate === null || rate === undefined || rate === '') return '—';
        return `${Number(rate).toFixed(2)}%`;
    }

    async function render(host, filters) {
        if (balanceDonut) { balanceDonut.dispose(); balanceDonut = null; }

        const insights = await API.reports.debtInsights(
            window.ReportFilters ? window.ReportFilters.params() : {}
        );

        const debts = insights.debts || [];
        const totalCurrent = insights.total_current || 0;
        const totalInterestPaid = insights.total_interest_paid || 0;

        const activeDebts = debts.filter(d => (d.current_balance || 0) > 0);
        const avgPaidPct = debts.length
            ? debts.reduce((s, d) => s + (d.paid_pct || 0), 0) / debts.length
            : null;

        const progressRows = debts.length
            ? debts.map(d => {
                const pct = Math.min(Math.max(d.paid_pct || 0, 0), 100);
                return `
                    <div class="space-y-1">
                        <div class="flex justify-between items-baseline gap-2 text-sm">
                            <span class="font-medium truncate">${d.name}</span>
                            <span class="text-xs text-base-content/60 whitespace-nowrap fin-numeric">
                                ${Utils.formatCurrency(d.current_balance || 0)} remaining
                                · ${fmtRate(d.interest_rate)} APR
                            </span>
                        </div>
                        <progress class="progress progress-primary w-full" value="${pct}" max="100"></progress>
                        <div class="flex justify-between text-xs text-base-content/50">
                            <span>${(d.paid_pct || 0).toFixed(1)}% paid off</span>
                            <span>${d.projected_payoff ? `Est. payoff ${Utils.formatDate(d.projected_payoff)}` : ''}</span>
                        </div>
                    </div>
                `;
            }).join('')
            : '<p class="text-sm text-base-content/50 py-4">No debts recorded. Add debts on the Debts page to see payoff insights here.</p>';

        const tableRows = debts.length
            ? debts.map(d => `
                <tr>
                    <td class="font-medium">${d.name}</td>
                    <td class="text-right">${Utils.formatCurrency(d.original_balance || 0)}</td>
                    <td class="text-right text-error">${Utils.formatCurrency(d.current_balance || 0)}</td>
                    <td class="text-right">${(d.paid_pct || 0).toFixed(1)}%</td>
                    <td class="text-right">${fmtRate(d.interest_rate)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" class="text-center text-base-content/50 py-6">No debt data</td></tr>';

        host.innerHTML = `
            <div class="space-y-4">
                <div class="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Total Debt</div>
                        <div class="stat-value text-xl sm:text-2xl text-error">${Utils.formatCurrency(totalCurrent)}</div>
                        <div class="stat-desc text-xs">${activeDebts.length} active debt${activeDebts.length === 1 ? '' : 's'}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Interest Paid</div>
                        <div class="stat-value text-xl sm:text-2xl">${Utils.formatCurrency(totalInterestPaid)}</div>
                        <div class="stat-desc text-xs">Lifetime across all debts</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title text-xs sm:text-sm">Avg Payoff Progress</div>
                        <div class="stat-value text-xl sm:text-2xl text-primary">
                            ${avgPaidPct === null ? '—' : `${avgPaidPct.toFixed(1)}%`}
                        </div>
                        <div class="stat-desc text-xs">Across ${debts.length} debt${debts.length === 1 ? '' : 's'}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Payoff Progress</h3>
                            <div class="space-y-4 mt-2">${progressRows}</div>
                        </div>
                    </div>
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="card-title text-base">Balance Distribution</h3>
                            <div id="debtBalanceDonut" style="height: 320px;"></div>
                        </div>
                    </div>
                </div>

                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body p-4">
                        <h3 class="card-title text-base">Debt Details</h3>
                        <div class="overflow-x-auto">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Debt</th>
                                        <th class="text-right">Original</th>
                                        <th class="text-right">Current</th>
                                        <th class="text-right">Paid %</th>
                                        <th class="text-right">Rate</th>
                                    </tr>
                                </thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const donutEl = document.getElementById('debtBalanceDonut');
        const withBalance = debts.filter(d => (d.current_balance || 0) > 0);
        if (withBalance.length) {
            balanceDonut = FinCharts.donut(donutEl, {
                labels: withBalance.map(d => d.name),
                data: withBalance.map(d => d.current_balance)
            });
        } else {
            donutEl.innerHTML = '<div class="flex items-center justify-center h-full text-base-content/50 text-sm">No outstanding balances</div>';
        }
    }

    window.ReportTabs.register('debt', { label: 'Debt', render });
})();
