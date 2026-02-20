/**
 * Financial Advisor Page Controller
 * Handles all financial calculator tools
 */

let currentTool = null;
let advisorChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    
    Layout.render('advisor');
    
    const template = document.getElementById('advisor-template');
    const mainContent = document.getElementById('main-content');
    if (template && mainContent) {
        mainContent.innerHTML = '';
        mainContent.appendChild(template.content.cloneNode(true));
    }
});

function selectTool(toolId) {
    currentTool = toolId;
    
    document.querySelectorAll('.tool-card').forEach(card => {
        card.classList.remove('border-primary', 'border-secondary', 'border-success', 'border-info', 'bg-primary/5', 'bg-secondary/5', 'bg-success/5', 'bg-info/5');
        card.classList.add('border-transparent');
    });
    
    const selectedCard = document.querySelector(`[data-tool="${toolId}"]`);
    if (selectedCard) {
        const colorMap = {
            investment: 'primary',
            loan: 'secondary',
            emergency: 'success',
            networth: 'info'
        };
        const color = colorMap[toolId];
        selectedCard.classList.remove('border-transparent');
        selectedCard.classList.add(`border-${color}`, `bg-${color}/5`);
    }
    
    document.getElementById('chartPanel').classList.add('hidden');
    if (advisorChart) {
        advisorChart.destroy();
        advisorChart = null;
    }
    
    renderCalculatorForm(toolId);
}

function renderCalculatorForm(toolId) {
    const formContainer = document.getElementById('calculatorForm');
    const titleEl = document.getElementById('calculatorTitle');
    const descEl = document.getElementById('calculatorDescription');
    
    const toolConfig = {
        investment: {
            title: 'Investment Calculator',
            description: 'Calculate compound interest, compare scenarios, and plan your retirement',
            form: renderInvestmentForm
        },
        loan: {
            title: 'Loan Calculator',
            description: 'Calculate loan payments and see how extra payments save you money',
            form: renderLoanForm
        },
        emergency: {
            title: 'Emergency Fund Calculator',
            description: 'Get personalized emergency fund recommendations based on your spending',
            form: renderEmergencyForm
        },
        networth: {
            title: 'Net Worth Tracker',
            description: 'Track your assets, liabilities, and net worth over time',
            form: renderNetWorthForm
        }
    };
    
    const config = toolConfig[toolId];
    if (config) {
        titleEl.textContent = config.title;
        descEl.textContent = config.description;
        formContainer.innerHTML = config.form();
    }
}

function renderInvestmentForm() {
    return `
        <div role='tablist' class="tabs tabs-box mb-4 justify-start overflow-x-auto">
            <button role='tab' class="tab tab-active flex-shrink-0" onclick="switchInvestmentTab('compound', event)">Compound</button>
            <button role='tab' class="tab flex-shrink-0" onclick="switchInvestmentTab('retirement', event)">Retirement</button>
            <button role='tab' class="tab flex-shrink-0" onclick="switchInvestmentTab('compare', event)">Compare</button>
        </div>
        
        <div id="compoundTab">
            <div class="bg-info/10 p-3 rounded-lg mb-4">
                <p class="text-xs text-base-content/70">
                    <strong class="text-info">What this calculates:</strong> See how your money grows over time with compound interest. 
                    Your money earns interest, and that interest also earns interest—creating exponential growth over years.
                </p>
            </div>
            
            <div class="space-y-3">
                <div class="border border-base-300 rounded-lg p-3">
                    <p class="text-xs text-base-content/70 mb-2 font-bold">Your Contributions</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Starting Amount</span>
                            </label>
                            <input type="number" id="inv_principal" class="input input-bordered input-sm" value="10000" min="0" step="100">
                            <span class="text-xs text-base-content/50 mt-1">One-time deposit now</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Monthly Deposit</span>
                            </label>
                            <input type="number" id="inv_monthly" class="input input-bordered input-sm" value="500" min="0" step="50">
                            <span class="text-xs text-base-content/50 mt-1">Regular contributions</span>
                        </div>
                    </div>
                </div>
                
                <div class="border border-base-300 rounded-lg p-3">
                    <p class="text-xs text-base-content/70 mb-2 font-bold">Market Expectations</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Annual Return</span>
                            </label>
                            <input type="number" id="inv_rate" class="input input-bordered input-sm" value="7" min="0" max="30" step="0.5">
                            <span class="text-xs text-base-content/50 mt-1">Stocks: 7-10%, Bonds: 3-5%</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Investment Period</span>
                            </label>
                            <input type="number" id="inv_years" class="input input-bordered input-sm" value="20" min="1" max="50">
                            <span class="text-xs text-base-content/50 mt-1">Years to grow</span>
                        </div>
                    </div>
                </div>
            </div>
            <button onclick="calculateInvestment()" class="btn btn-primary btn-block mt-4">Calculate Growth</button>
        </div>
        
        <div id="retirementTab" class="hidden">
            <div class="bg-info/10 p-3 rounded-lg mb-4">
                <p class="text-xs text-base-content/70">
                    <strong class="text-info">What this calculates:</strong> Estimates how much you'll have at retirement and the monthly income it can generate using the "4% Rule" (a guideline suggesting you can safely withdraw 4% annually for 30+ years).
                </p>
            </div>
            
            <div class="space-y-3">
                <div class="border border-base-300 rounded-lg p-3">
                    <p class="text-xs text-base-content/70 mb-2 font-bold">Your Timeline</p>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Current Age</span>
                            </label>
                            <input type="number" id="ret_age" class="input input-bordered input-sm" value="30" min="18" max="80">
                            <span class="text-xs text-base-content/50 mt-1">Your age now</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Retirement Age</span>
                            </label>
                            <input type="number" id="ret_retire_age" class="input input-bordered input-sm" value="65" min="30" max="90">
                            <span class="text-xs text-base-content/50 mt-1">When you retire</span>
                        </div>
                    </div>
                </div>
                
                <div class="border border-base-300 rounded-lg p-3">
                    <p class="text-xs text-base-content/70 mb-2 font-bold">Your Savings</p>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Current Savings</span>
                            </label>
                            <input type="number" id="ret_savings" class="input input-bordered input-sm" value="50000" min="0">
                            <span class="text-xs text-base-content/50 mt-1">Saved so far</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Monthly Contribution</span>
                            </label>
                            <input type="number" id="ret_monthly" class="input input-bordered input-sm" value="800" min="0">
                            <span class="text-xs text-base-content/50 mt-1">Until retirement</span>
                        </div>
                        <div class="form-control sm:col-span-1 col-span-2">
                            <label class="label py-1">
                                <span class="label-text text-xs">Expected Return</span>
                            </label>
                            <input type="number" id="ret_rate" class="input input-bordered input-sm" value="7" min="0" max="15" step="0.5">
                            <span class="text-xs text-base-content/50 mt-1">Annual %</span>
                        </div>
                    </div>
                </div>
                
                <div class="border border-base-300 rounded-lg p-3">
                    <p class="text-xs text-base-content/70 mb-2 font-bold">Inflation Adjustment</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Expected Inflation</span>
                            </label>
                            <input type="number" id="ret_inflation" class="input input-bordered input-sm" value="2" min="0" max="10" step="0.5">
                            <span class="text-xs text-base-content/50 mt-1">Avg: 2-3%</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Withdrawal Rate</span>
                            </label>
                            <input type="number" class="input input-bordered input-sm" value="4" disabled>
                            <span class="text-xs text-base-content/50 mt-1">Safe withdrawal rule</span>
                        </div>
                    </div>
                </div>
            </div>
            <button onclick="calculateRetirement()" class="btn btn-primary btn-block mt-4">Calculate Retirement</button>
        </div>
        
        <div id="compareTab" class="hidden">
            <div class="bg-info/10 p-3 rounded-lg mb-4">
                <p class="text-xs text-base-content/70">
                    <strong class="text-info">What this calculates:</strong> Compare different investment strategies side-by-side to see how contribution amounts and return rates affect your final balance over time.
                </p>
            </div>
            
            <div class="border border-base-300 rounded-lg p-3 mb-3">
                <p class="text-xs text-base-content/70 mb-2 font-bold">Common Settings</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div class="form-control">
                        <label class="label py-1">
                            <span class="label-text text-xs">Initial Investment</span>
                        </label>
                        <input type="number" id="cmp_principal" class="input input-bordered input-sm" value="10000" min="0">
                        <span class="text-xs text-base-content/50 mt-1">Same for all scenarios</span>
                    </div>
                    <div class="form-control">
                        <label class="label py-1">
                            <span class="label-text text-xs">Investment Period</span>
                        </label>
                        <input type="number" id="cmp_years" class="input input-bordered input-sm" value="20" min="1" max="50">
                        <span class="text-xs text-base-content/50 mt-1">Years to grow</span>
                    </div>
                </div>
            </div>
            
            <div class="divider text-xs">Compare Strategies</div>
            
            <div class="space-y-2">
                <div class="bg-base-200 p-2 sm:p-3 rounded-lg">
                    <p class="text-xs sm:text-sm font-medium mb-2">🟢 A - Conservative (Low Risk)</p>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="label py-0"><span class="label-text-alt text-xs">Monthly</span></label>
                            <input type="number" id="cmp_a_monthly" class="input input-bordered input-sm" value="300">
                        </div>
                        <div>
                            <label class="label py-0"><span class="label-text-alt text-xs">Return %</span></label>
                            <input type="number" id="cmp_a_rate" class="input input-bordered input-sm" value="4">
                        </div>
                    </div>
                    <p class="text-xs text-base-content/50 mt-1">Typical for bonds, savings accounts</p>
                </div>
                <div class="bg-base-200 p-2 sm:p-3 rounded-lg">
                    <p class="text-xs sm:text-sm font-medium mb-2">🔵 B - Moderate (Balanced)</p>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="label py-0"><span class="label-text-alt text-xs">Monthly</span></label>
                            <input type="number" id="cmp_b_monthly" class="input input-bordered input-sm" value="500">
                        </div>
                        <div>
                            <label class="label py-0"><span class="label-text-alt text-xs">Return %</span></label>
                            <input type="number" id="cmp_b_rate" class="input input-bordered input-sm" value="7">
                        </div>
                    </div>
                    <p class="text-xs text-base-content/50 mt-1">Typical for mixed portfolio</p>
                </div>
                <div class="bg-base-200 p-2 sm:p-3 rounded-lg">
                    <p class="text-xs sm:text-sm font-medium mb-2">🔴 C - Aggressive (High Risk)</p>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="label py-0"><span class="label-text-alt text-xs">Monthly</span></label>
                            <input type="number" id="cmp_c_monthly" class="input input-bordered input-sm" value="700">
                        </div>
                        <div>
                            <label class="label py-0"><span class="label-text-alt text-xs">Return %</span></label>
                            <input type="number" id="cmp_c_rate" class="input input-bordered input-sm" value="10">
                        </div>
                    </div>
                    <p class="text-xs text-base-content/50 mt-1">Typical for stocks only</p>
                </div>
            </div>
            
            <button onclick="compareInvestments()" class="btn btn-primary btn-block mt-4">Compare Strategies</button>
        </div>
    `;
}

function switchInvestmentTab(tab, event) {
    event.stopPropagation();
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('tab-active'));
    event.target.classList.add('tab-active');
    
    document.getElementById('compoundTab').classList.toggle('hidden', tab !== 'compound');
    document.getElementById('retirementTab').classList.toggle('hidden', tab !== 'retirement');
    document.getElementById('compareTab').classList.toggle('hidden', tab !== 'compare');
}

async function calculateInvestment() {
    try {
        const principal = parseFloat(document.getElementById('inv_principal').value);
        const monthly = parseFloat(document.getElementById('inv_monthly').value);
        const rate = parseFloat(document.getElementById('inv_rate').value);
        const years = parseInt(document.getElementById('inv_years').value);
        
        const data = await API.advisor.calculateInvestment({
            principal: principal,
            annual_rate: rate / 100,
            years: years,
            monthly_contribution: monthly
        });
        
        renderInvestmentResults(data, { principal, monthly, rate, years });
        renderInvestmentChart(data);
    } catch (error) {
        console.error('Error calculating investment:', error);
        Utils.showToast('Calculation error', 'error');
    }
}

function renderInvestmentResults(data, params) {
    const totalContributed = params.principal + (params.monthly * 12 * params.years);
    const interestPortion = ((data.total_interest_earned / data.final_balance) * 100).toFixed(0);
    const multiplier = (data.final_balance / totalContributed).toFixed(2);
    
    let insight = '';
    if (multiplier >= 3) {
        insight = `Excellent growth! Your money will grow ${multiplier}x over ${params.years} years. The power of compounding is working strongly in your favor.`;
    } else if (multiplier >= 2) {
        insight = `Good growth! Your investment doubles with ${interestPortion}% coming from compound interest. Consider a longer time horizon for even better results.`;
    } else if (multiplier >= 1.5) {
        insight = `Moderate growth. Your money grows by 50%+. To accelerate growth, consider increasing monthly contributions or seeking higher returns.`;
    } else {
        insight = `Conservative growth. For better returns, consider a longer investment period or a slightly higher-return investment option.`;
    }
    
    document.getElementById('resultsPanel').innerHTML = `
        <div class="stats stats-vertical sm:stats-horizontal shadow w-full">
            <div class="stat py-2 sm:py-4">
                <div class="stat-title text-xs sm:text-sm">Final Balance</div>
                <div class="stat-value text-primary text-xl sm:text-2xl">${Utils.formatCurrency(data.final_balance)}</div>
                <div class="stat-desc text-xs">${params.years} years</div>
            </div>
            <div class="stat py-2 sm:py-4">
                <div class="stat-title text-xs sm:text-sm">Contributed</div>
                <div class="stat-value text-lg">${Utils.formatCurrency(data.total_contributions)}</div>
                <div class="stat-desc text-xs">Your deposits</div>
            </div>
            <div class="stat py-2 sm:py-4">
                <div class="stat-title text-xs sm:text-sm">Interest</div>
                <div class="stat-value text-success text-lg">${Utils.formatCurrency(data.total_interest_earned)}</div>
                <div class="stat-desc text-xs">${interestPortion}%</div>
            </div>
        </div>
        
        <div class="mt-3 p-3 sm:p-4 bg-base-200 rounded-lg space-y-2">
            <p class="text-sm font-medium">Analysis</p>
            <p class="text-xs text-base-content/70">${insight}</p>
            <div class="divider my-1"></div>
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <span class="text-base-content/60">Return:</span>
                    <span class="font-medium">${data.effective_return.toFixed(1)}%</span>
                </div>
                <div>
                    <span class="text-base-content/60">Multiplier:</span>
                    <span class="font-medium">${multiplier}x</span>
                </div>
                <div>
                    <span class="text-base-content/60">Monthly:</span>
                    <span class="font-medium">${Utils.formatCurrency(params.monthly)}</span>
                </div>
                <div>
                    <span class="text-base-content/60">Rule of 72:</span>
                    <span class="font-medium">~${Math.round(72 / params.rate)} yrs</span>
                </div>
            </div>
        </div>
        
        <div class="mt-3 p-3 bg-info/10 rounded-lg">
            <p class="text-xs text-base-content/60">
                💡 <strong>Tip:</strong> Rule of 72: at ${params.rate}%, doubles in ~${Math.round(72 / params.rate)} years.
            </p>
        </div>
    `;
}

function renderInvestmentChart(data) {
    const chartPanel = document.getElementById('chartPanel');
    chartPanel.classList.remove('hidden');
    document.getElementById('chartTitle').textContent = 'Investment Growth Over Time';
    
    const ctx = document.getElementById('advisorChart').getContext('2d');
    if (advisorChart) advisorChart.destroy();
    
    const years = data.yearly_breakdown.map(y => `Year ${y.year}`);
    const balances = data.yearly_breakdown.map(y => y.balance);
    const contributions = data.yearly_breakdown.map(y => y.contributions);
    
    advisorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Total Balance',
                    data: balances,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true
                },
                {
                    label: 'Your Contributions',
                    data: contributions,
                    borderColor: '#10B981',
                    borderDash: [5, 5],
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: €${ctx.raw.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    ticks: { callback: v => '€' + (v/1000).toFixed(0) + 'k' }
                }
            }
        }
    });
}

async function compareInvestments() {
    try {
        const principal = parseFloat(document.getElementById('cmp_principal').value);
        const years = parseInt(document.getElementById('cmp_years').value);
        
        const scenarios = [
            { name: 'Conservative', monthly: parseFloat(document.getElementById('cmp_a_monthly').value), rate: parseFloat(document.getElementById('cmp_a_rate').value) / 100, color: '#6B7280' },
            { name: 'Moderate', monthly: parseFloat(document.getElementById('cmp_b_monthly').value), rate: parseFloat(document.getElementById('cmp_b_rate').value) / 100, color: '#3B82F6' },
            { name: 'Aggressive', monthly: parseFloat(document.getElementById('cmp_c_monthly').value), rate: parseFloat(document.getElementById('cmp_c_rate').value) / 100, color: '#10B981' }
        ];
        
        const results = await Promise.all(scenarios.map(s => 
            API.advisor.calculateInvestment({
                principal,
                annual_rate: s.rate,
                years,
                monthly_contribution: s.monthly
            })
        ));
        
        const best = results.reduce((max, r, i) => r.final_balance > max.balance ? { balance: r.final_balance, index: i } : max, { balance: 0, index: 0 });
        
        document.getElementById('resultsPanel').innerHTML = `
            <div class="space-y-4">
                <div class="alert alert-success">
                    <span><strong>${scenarios[best.index].name}</strong> scenario yields the highest returns: ${Utils.formatCurrency(results[best.index].final_balance)}</span>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Scenario</th>
                                <th>Monthly</th>
                                <th>Rate</th>
                                <th>Contributed</th>
                                <th>Final Balance</th>
                                <th>Interest Earned</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results.map((r, i) => `
                                <tr class="${i === best.index ? 'bg-success/10' : ''}">
                                    <td class="font-medium">${scenarios[i].name}</td>
                                    <td>${Utils.formatCurrency(scenarios[i].monthly)}</td>
                                    <td>${(scenarios[i].rate * 100).toFixed(0)}%</td>
                                    <td>${Utils.formatCurrency(r.total_contributions)}</td>
                                    <td class="font-bold">${Utils.formatCurrency(r.final_balance)}</td>
                                    <td class="text-success">${Utils.formatCurrency(r.total_interest_earned)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="p-3 bg-base-200 rounded-lg">
                    <p class="text-xs text-base-content/70">
                        <strong>Analysis:</strong> The difference between ${scenarios[0].name} and ${scenarios[best.index].name} is 
                        <strong>${Utils.formatCurrency(results[best.index].final_balance - results[0].final_balance)}</strong> over ${years} years. 
                        Higher contributions and returns compound significantly over time.
                    </p>
                </div>
            </div>
        `;
        
        const chartPanel = document.getElementById('chartPanel');
        chartPanel.classList.remove('hidden');
        document.getElementById('chartTitle').textContent = 'Scenario Comparison Over Time';
        
        const ctx = document.getElementById('advisorChart').getContext('2d');
        if (advisorChart) advisorChart.destroy();
        
        advisorChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: results[0].yearly_breakdown.map(y => `Year ${y.year}`),
                datasets: results.map((r, i) => ({
                    label: scenarios[i].name,
                    data: r.yearly_breakdown.map(y => y.balance),
                    borderColor: scenarios[i].color,
                    backgroundColor: scenarios[i].color + '20',
                    fill: false
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { ticks: { callback: v => '€' + (v/1000).toFixed(0) + 'k' } }
                }
            }
        });
        
    } catch (error) {
        console.error('Error:', error);
        Utils.showToast('Comparison error', 'error');
    }
}

async function calculateRetirement() {
    try {
        const data = await API.advisor.calculateRetirement({
            current_age: parseInt(document.getElementById('ret_age').value),
            retirement_age: parseInt(document.getElementById('ret_retire_age').value),
            current_savings: parseFloat(document.getElementById('ret_savings').value),
            monthly_contribution: parseFloat(document.getElementById('ret_monthly').value),
            annual_return: parseFloat(document.getElementById('ret_rate').value) / 100,
            inflation_rate: parseFloat(document.getElementById('ret_inflation').value) / 100
        });
        
        renderRetirementResults(data);
        renderRetirementChart(data);
    } catch (error) {
        console.error('Error calculating retirement:', error);
        Utils.showToast('Calculation error', 'error');
    }
}

function renderRetirementResults(data) {
    const currentAge = data.parameters.current_age;
    const retireAge = data.parameters.retirement_age;
    const yearsToRetire = data.years_to_retirement;
    
    let adequacyMessage = '';
    if (data.monthly_retirement_income >= 3000) {
        adequacyMessage = 'Your projected retirement income is excellent and should provide a comfortable lifestyle.';
    } else if (data.monthly_retirement_income >= 2000) {
        adequacyMessage = 'Good retirement outlook. Consider increasing contributions to build more security.';
    } else if (data.monthly_retirement_income >= 1000) {
        adequacyMessage = 'Moderate retirement income. You may want to increase savings or delay retirement.';
    } else {
        adequacyMessage = 'Your projected income is below typical needs. Consider significantly increasing contributions.';
    }
    
    document.getElementById('resultsPanel').innerHTML = `
        <div class="space-y-3">
            <div class="stat bg-primary/10 rounded-lg p-3 sm:p-4">
                <div class="stat-title text-xs sm:text-sm">Balance at ${retireAge}</div>
                <div class="stat-value text-primary text-lg sm:text-xl">${Utils.formatCurrency(data.retirement_balance)}</div>
                <div class="stat-desc text-xs">${Utils.formatCurrency(data.retirement_balance_today_dollars)} today</div>
            </div>
            
            <div class="grid grid-cols-2 gap-2 sm:gap-4">
                <div class="p-2 sm:p-3 bg-success/10 rounded-lg">
                    <p class="text-xs text-base-content/60">Monthly Income</p>
                    <p class="text-lg font-bold text-success">${Utils.formatCurrency(data.monthly_retirement_income)}</p>
                    <p class="text-xs text-base-content/50">4% rule</p>
                </div>
                <div class="p-2 sm:p-3 bg-base-200 rounded-lg">
                    <p class="text-xs text-base-content/60">Years to Retire</p>
                    <p class="text-lg font-bold">${yearsToRetire}</p>
                    <p class="text-xs text-base-content/50">${currentAge} → ${retireAge}</p>
                </div>
            </div>
            
            <div class="p-2 sm:p-3 bg-base-200 rounded-lg">
                <p class="text-sm font-medium mb-1">Outlook</p>
                <p class="text-xs text-base-content/70">${adequacyMessage}</p>
            </div>
            
            ${data.milestones.length > 0 ? `
                <div class="collapse collapse-arrow bg-base-200">
                    <input type="checkbox" />
                    <div class="collapse-title font-medium text-sm py-2">Milestones</div>
                    <div class="collapse-content">
                        <div class="space-y-1">
                            ${data.milestones.map(m => `
                                <div class="flex justify-between text-xs sm:text-sm">
                                    <span>€${(m.target/1000).toFixed(0)}k</span>
                                    <span class="text-base-content/60">Age ${m.age}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <div class="p-2 sm:p-3 bg-info/10 rounded-lg">
                <p class="text-xs text-base-content/60">
                    💡 <strong>4% Rule:</strong> ${Utils.formatCurrency(data.retirement_balance)} → ${Utils.formatCurrency(data.monthly_retirement_income)}/mo.
                </p>
            </div>
        </div>
    `;
}

function renderRetirementChart(data) {
    const chartPanel = document.getElementById('chartPanel');
    chartPanel.classList.remove('hidden');
    document.getElementById('chartTitle').textContent = 'Retirement Savings Projection';
    
    const ctx = document.getElementById('advisorChart').getContext('2d');
    if (advisorChart) advisorChart.destroy();
    
    const ages = data.yearly_projection.map((y, i) => data.parameters.current_age + i + 1);
    const balances = data.yearly_projection.map(y => y.balance);
    
    advisorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ages.map(a => `Age ${a}`),
            datasets: [{
                label: 'Projected Balance',
                data: balances,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { ticks: { callback: v => '€' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });
}

function renderLoanForm() {
    return `
        <div role='tablist' class="tabs tabs-box mb-4 justify-start overflow-x-auto">
            <button role='tab' class="tab tab-active flex-shrink-0" onclick="switchLoanTab('amortization', event)">Amortization</button>
            <button role='tab' class="tab flex-shrink-0" onclick="switchLoanTab('earlyPayoff', event)">Early Payoff</button>
        </div>
        
        <div id="amortizationTab">
            <div class="bg-info/10 p-3 rounded-lg mb-4">
                <p class="text-xs text-base-content/70">
                    <strong class="text-info">What this calculates:</strong> Shows your monthly payment and total interest over the life of the loan. 
                    Early on, most of your payment goes to interest; over time, more goes to principal.
                </p>
            </div>
            
            <div class="space-y-3">
                <div class="border border-base-300 rounded-lg p-3">
                    <p class="text-xs text-base-content/70 mb-2 font-bold">Loan Details</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Loan Amount</span>
                            </label>
                            <input type="number" id="loan_principal" class="input input-bordered input-sm" value="200000" min="1000">
                            <span class="text-xs text-base-content/50 mt-1">Total borrowed</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Interest Rate</span>
                            </label>
                            <input type="number" id="loan_rate" class="input input-bordered input-sm" value="4.5" min="0" max="30" step="0.1">
                            <span class="text-xs text-base-content/50 mt-1">Annual % rate</span>
                        </div>
                        <div class="form-control sm:col-span-2">
                            <label class="label py-1">
                                <span class="label-text text-xs">Loan Term</span>
                            </label>
                            <input type="number" id="loan_years" class="input input-bordered input-sm" value="30" min="1" max="50">
                            <span class="text-xs text-base-content/50 mt-1">Years to repay</span>
                        </div>
                    </div>
                </div>
            </div>
            <button onclick="calculateAmortization()" class="btn btn-secondary btn-block mt-4">Calculate Payment</button>
        </div>
        
        <div id="earlyPayoffTab" class="hidden">
            <div class="bg-info/10 p-3 rounded-lg mb-4">
                <p class="text-xs text-base-content/70">
                    <strong class="text-info">What this calculates:</strong> Shows how making extra payments can save you money by reducing the principal faster. 
                    The less principal you owe, the less interest accumulates over time.
                </p>
            </div>
            
            <div class="space-y-3">
                <div class="border border-base-300 rounded-lg p-3">
                    <p class="text-xs text-base-content/70 mb-2 font-bold">Your Loan</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Loan Amount</span>
                            </label>
                            <input type="number" id="payoff_principal" class="input input-bordered input-sm" value="200000">
                            <span class="text-xs text-base-content/50 mt-1">Remaining balance</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Interest Rate</span>
                            </label>
                            <input type="number" id="payoff_rate" class="input input-bordered input-sm" value="4.5" step="0.1">
                            <span class="text-xs text-base-content/50 mt-1">Annual %</span>
                        </div>
                        <div class="form-control">
                            <label class="label py-1">
                                <span class="label-text text-xs">Remaining Years</span>
                            </label>
                            <input type="number" id="payoff_years" class="input input-bordered input-sm" value="30">
                            <span class="text-xs text-base-content/50 mt-1">Original term</span>
                        </div>
                    </div>
                </div>
                
                <div class="border border-success/30 rounded-lg p-3 bg-success/5">
                    <p class="text-xs text-success mb-2 font-bold">Extra Payment</p>
                    <div class="form-control">
                        <label class="label py-1">
                            <span class="label-text text-xs">Extra Monthly Payment</span>
                        </label>
                        <input type="number" id="payoff_extra" class="input input-bordered input-sm" value="200" min="0">
                        <span class="text-xs text-base-content/50 mt-1">Amount above your regular payment</span>
                    </div>
                </div>
            </div>
            <button onclick="calculateEarlyPayoff()" class="btn btn-secondary btn-block mt-4">Calculate Savings</button>
        </div>
    `;
}

function switchLoanTab(tab, event) {
    event.stopPropagation();
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('tab-active'));
    event.target.classList.add('tab-active');
    
    document.getElementById('amortizationTab').classList.toggle('hidden', tab !== 'amortization');
    document.getElementById('earlyPayoffTab').classList.toggle('hidden', tab !== 'earlyPayoff');
}

async function calculateAmortization() {
    try {
        const principal = parseFloat(document.getElementById('loan_principal').value);
        const rate = parseFloat(document.getElementById('loan_rate').value);
        const years = parseInt(document.getElementById('loan_years').value);
        
        const data = await API.advisor.calculateLoanAmortization({
            principal: principal,
            annual_rate: rate / 100,
            term_months: years * 12
        });
        
        const interestRatio = ((data.total_interest / principal) * 100).toFixed(0);
        
        document.getElementById('resultsPanel').innerHTML = `
            <div class="stats stats-vertical sm:stats-horizontal shadow w-full">
                <div class="stat py-2 sm:py-4">
                    <div class="stat-title text-xs sm:text-sm">Monthly</div>
                    <div class="stat-value text-secondary text-lg sm:text-xl">${Utils.formatCurrency(data.monthly_payment)}</div>
                    <div class="stat-desc text-xs">${years} years</div>
                </div>
                <div class="stat py-2 sm:py-4">
                    <div class="stat-title text-xs sm:text-sm">Total Interest</div>
                    <div class="stat-value text-error text-lg">${Utils.formatCurrency(data.total_interest)}</div>
                    <div class="stat-desc text-xs">${interestRatio}%</div>
                </div>
                <div class="stat py-2 sm:py-4">
                    <div class="stat-title text-xs sm:text-sm">Total Paid</div>
                    <div class="stat-value text-lg">${Utils.formatCurrency(data.total_payments)}</div>
                    <div class="stat-desc text-xs">P + I</div>
                </div>
            </div>
            
            <div class="mt-3 p-3 bg-base-200 rounded-lg">
                <p class="text-xs text-base-content/70">
                    Over ${years} yrs at ${rate}%, pay <strong>${Utils.formatCurrency(data.total_interest)}</strong> interest (${interestRatio}% extra).
                </p>
            </div>
        `;
        
        renderAmortizationChart(data);
    } catch (error) {
        console.error('Error:', error);
        Utils.showToast('Calculation error', 'error');
    }
}

function renderAmortizationChart(data) {
    const chartPanel = document.getElementById('chartPanel');
    chartPanel.classList.remove('hidden');
    document.getElementById('chartTitle').textContent = 'Loan Balance Over Time';
    
    const ctx = document.getElementById('advisorChart').getContext('2d');
    if (advisorChart) advisorChart.destroy();
    
    const balances = data.schedule.map(s => s.balance);
    const labels = data.schedule.map(s => `Month ${s.month}`);
    
    advisorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Remaining Balance',
                data: balances,
                borderColor: '#F59E0B',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { ticks: { callback: v => '€' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });
}

async function calculateEarlyPayoff() {
    try {
        const principal = parseFloat(document.getElementById('payoff_principal').value);
        const rate = parseFloat(document.getElementById('payoff_rate').value);
        const years = parseInt(document.getElementById('payoff_years').value);
        const extra = parseFloat(document.getElementById('payoff_extra').value);
        
        const data = await API.advisor.calculateEarlyPayoff({
            principal: principal,
            annual_rate: rate / 100,
            term_months: years * 12,
            extra_monthly_payment: extra
        });
        
        document.getElementById('resultsPanel').innerHTML = `
            <div class="space-y-3">
                <div class="alert alert-success flex-col sm:flex-row items-start sm:items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <span class="font-bold">Save ${Utils.formatCurrency(data.interest_saved)}</span>
                        <p class="text-xs">+${Utils.formatCurrency(extra)}/month extra</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-2 sm:gap-4">
                    <div class="p-2 sm:p-3 bg-success/10 rounded-lg text-center">
                        <p class="text-xs text-base-content/60">Time Saved</p>
                        <p class="text-lg sm:text-xl font-bold text-success">${data.years_saved} yrs</p>
                        <p class="text-xs">${data.months_saved} months</p>
                    </div>
                    <div class="p-2 sm:p-3 bg-base-200 rounded-lg text-center">
                        <p class="text-xs text-base-content/60">New Term</p>
                        <p class="text-lg sm:text-xl font-bold">${Math.round(data.new_term_months / 12)} yrs</p>
                        <p class="text-xs">vs ${years} yrs</p>
                    </div>
                </div>
                
                <div class="divider text-xs"></div>
                
                <div class="text-xs sm:text-sm space-y-1">
                    <div class="flex justify-between">
                        <span>Original:</span>
                        <span>${Utils.formatCurrency(data.original_monthly_payment)}/mo</span>
                    </div>
                    <div class="flex justify-between font-medium">
                        <span>New:</span>
                        <span>${Utils.formatCurrency(data.new_monthly_payment)}/mo</span>
                    </div>
                    <div class="flex justify-between text-success font-medium">
                        <span>Save:</span>
                        <span>${Utils.formatCurrency(data.interest_saved)}</span>
                    </div>
                </div>
                
                <div class="p-2 sm:p-3 bg-info/10 rounded-lg">
                    <p class="text-xs text-base-content/60">
                        💡 Extra payments go directly to principal, reducing future interest.
                    </p>
                </div>
            </div>
        `;
        
        document.getElementById('chartPanel').classList.add('hidden');
    } catch (error) {
        console.error('Error:', error);
        Utils.showToast('Calculation error', 'error');
    }
}

function renderEmergencyForm() {
    return `
        <div class="space-y-4">
            <div class="bg-info/10 p-4 rounded-lg">
                <p class="text-sm font-medium mb-2">Why You Need an Emergency Fund</p>
                <p class="text-xs text-base-content/70 mb-3">
                    An emergency fund is money set aside for unexpected expenses like medical bills, car repairs, or job loss. 
                    Financial experts recommend having 3-6 months of essential expenses saved.
                </p>
                <ul class="text-xs text-base-content/70 space-y-1 list-disc list-inside">
                    <li><strong>3 months:</strong> Minimum safety net for stable jobs</li>
                    <li><strong>6 months:</strong> Recommended for most people</li>
                    <li><strong>12 months:</strong> For freelancers or volatile income</li>
                </ul>
            </div>
            
            <div class="text-center">
                <p class="text-sm text-base-content/70 mb-4">
                    We'll analyze your actual spending to calculate a personalized recommendation.
                </p>
                <button onclick="loadEmergencyFund()" class="btn btn-success btn-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Analyze My Spending
                </button>
            </div>
        </div>
    `;
}

async function loadEmergencyFund() {
    try {
        document.getElementById('resultsPanel').innerHTML = '<div class="loading loading-spinner loading-lg mx-auto block"></div>';
        
        const data = await API.advisor.getEmergencyFundRecommendation();
        
        // Handle case when there's no expense data
        if (data.status === 'unknown' || data.monthly_expenses <= 0) {
            document.getElementById('resultsPanel').innerHTML = `
                <div class="space-y-4">
                    <div class="alert alert-warning">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                            <span class="font-bold">Not Enough Data</span>
                            <p class="text-sm mt-1">${data.message || 'We need more expense transactions to calculate your emergency fund recommendation. Please add some expense transactions first.'}</p>
                        </div>
                    </div>
                    <div class="p-4 bg-base-200 rounded-lg">
                        <p class="text-sm">To calculate your emergency fund needs, we analyze your spending patterns over the last 6 months. Make sure you have:</p>
                        <ul class="list-disc list-inside text-sm mt-2 space-y-1 text-base-content/70">
                            <li>Expense transactions recorded in your accounts</li>
                            <li>At least a few weeks of spending data</li>
                            <li>Transactions categorized for better analysis</li>
                        </ul>
                    </div>
                </div>
            `;
            document.getElementById('chartPanel').classList.add('hidden');
            return;
        }
        
        const statusColors = {
            excellent: 'success',
            good: 'info',
            fair: 'warning',
            critical: 'error'
        };
        
        const statusExplanations = {
            excellent: 'You have a robust emergency fund that can cover extended periods without income. Great job!',
            good: 'Your emergency fund is solid. Consider continuing to build toward 6+ months for extra security.',
            fair: 'Your emergency fund is below recommended levels. Prioritize building this up before other investments.',
            critical: 'Your emergency fund is critically low. Focus on saving at least 1-2 months of expenses immediately.'
        };
        
        const monthsCovered = data.current_coverage.months_covered;
        const monthlyExpenses = data.monthly_expenses;
        const currentLiquid = data.current_liquid_assets;
        
        document.getElementById('resultsPanel').innerHTML = `
            <div class="space-y-4">
                <div class="alert alert-${statusColors[data.status] || 'info'}">
                    <div>
                        <span class="font-bold">${data.message}</span>
                        <p class="text-sm mt-1">${statusExplanations[data.status] || ''}</p>
                    </div>
                </div>
                
                <div class="stat bg-base-200 rounded-lg">
                    <div class="stat-title">Current Emergency Fund Coverage</div>
                    <div class="stat-value ${monthsCovered >= 6 ? 'text-success' : monthsCovered >= 3 ? 'text-info' : 'text-warning'}">${monthsCovered.toFixed(1)} months</div>
                    <div class="stat-desc">You have ${Utils.formatCurrency(currentLiquid)} in liquid assets</div>
                    <div class="stat-desc mt-1">Your monthly expenses average ${Utils.formatCurrency(monthlyExpenses)}</div>
                    <progress class="progress progress-${statusColors[data.status] || 'info'} w-full mt-2" 
                        value="${Math.min(data.current_coverage.percentage_of_recommended, 100)}" max="100"></progress>
                    <p class="text-xs mt-1">${data.current_coverage.percentage_of_recommended.toFixed(0)}% of recommended 6-month target</p>
                </div>
                
                <div class="p-3 bg-base-200 rounded-lg">
                    <p class="text-sm font-medium mb-2">Your Emergency Fund Targets</p>
                    <p class="text-xs text-base-content/60 mb-3">Based on your monthly expenses of ${Utils.formatCurrency(monthlyExpenses)}</p>
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <div class="p-2 bg-warning/10 rounded border ${monthsCovered >= 3 ? 'border-success' : 'border-transparent'}">
                            <p class="text-xs font-medium">Minimum</p>
                            <p class="font-bold text-lg">${Utils.formatCurrency(data.recommendations.minimum)}</p>
                            <p class="text-xs text-base-content/60">3 months</p>
                            ${monthsCovered >= 3 ? '<span class="badge badge-success badge-xs mt-1">✓ Met</span>' : ''}
                        </div>
                        <div class="p-2 bg-success/10 rounded-lg border-2 ${monthsCovered >= 6 ? 'border-success' : 'border-success/50'}">
                            <p class="text-xs font-medium">Recommended</p>
                            <p class="font-bold text-lg">${Utils.formatCurrency(data.recommendations.recommended)}</p>
                            <p class="text-xs text-base-content/60">6 months</p>
                            ${monthsCovered >= 6 ? '<span class="badge badge-success badge-xs mt-1">✓ Met</span>' : '<span class="badge badge-ghost badge-xs mt-1">Target</span>'}
                        </div>
                        <div class="p-2 bg-info/10 rounded ${monthsCovered >= 12 ? 'border border-success' : 'border-transparent'}">
                            <p class="text-xs font-medium">Maximum</p>
                            <p class="font-bold text-lg">${Utils.formatCurrency(data.recommendations.maximum)}</p>
                            <p class="text-xs text-base-content/60">12 months</p>
                            ${monthsCovered >= 12 ? '<span class="badge badge-success badge-xs mt-1">✓ Met</span>' : ''}
                        </div>
                    </div>
                </div>
                
                ${data.gap_to_recommended > 0 ? `
                    <div class="collapse collapse-arrow bg-base-200">
                        <input type="checkbox" checked />
                        <div class="collapse-title font-medium">
                            <span class="text-sm">Savings Plans to Reach 6-Month Goal</span>
                            <span class="badge badge-warning badge-sm ml-2">Gap: ${Utils.formatCurrency(data.gap_to_recommended)}</span>
                        </div>
                        <div class="collapse-content">
                            <p class="text-xs text-base-content/60 mb-3">
                                Choose a timeline that works with your budget. More aggressive savings gets you protected faster.
                            </p>
                            <div class="space-y-2">
                                ${data.savings_plans.map((plan, i) => `
                                    <div class="flex justify-between items-center text-sm p-3 bg-base-100 rounded ${i === 1 ? 'ring-2 ring-success' : ''}">
                                        <div>
                                            <span class="font-medium">${plan.months} months</span>
                                            ${i === 1 ? '<span class="badge badge-success badge-xs ml-2">Recommended</span>' : ''}
                                        </div>
                                        <span class="font-bold text-primary">${Utils.formatCurrency(plan.monthly_savings)}/month</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="alert alert-success">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Congratulations! You've reached your recommended emergency fund target.</span>
                    </div>
                `}
                
                <div class="p-3 bg-info/10 rounded-lg">
                    <p class="text-xs text-base-content/60">
                        💡 <strong>Tip:</strong> Keep your emergency fund in a high-yield savings account - accessible but earning interest. 
                        Don't invest it in stocks as you may need it quickly during an emergency.
                    </p>
                </div>
            </div>
        `;
        
        document.getElementById('chartPanel').classList.add('hidden');
    } catch (error) {
        console.error('Error:', error);
        Utils.showToast('Error loading recommendation', 'error');
    }
}

function renderNetWorthForm() {
    return `
        <div class="space-y-4">
            <div class="bg-info/10 p-3 rounded-lg">
                <p class="text-xs text-base-content/70">
                    <strong class="text-info">What this calculates:</strong> Net Worth = Total Assets - Total Liabilities. 
                    It's a snapshot of your financial health. A positive net worth means your assets exceed your debts.
                </p>
            </div>
            
            <div class="space-y-2">
                <button onclick="loadCurrentNetWorth()" class="btn btn-info btn-block">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Current Net Worth
                </button>
                
                <button onclick="loadNetWorthHistory()" class="btn btn-outline btn-info btn-block">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Historical Trend
                </button>
                
                <button onclick="loadNetWorthProjection()" class="btn btn-outline btn-info btn-block">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Project Future
                </button>
            </div>
            
            <div class="text-xs text-base-content/50 p-2 bg-base-200 rounded-lg">
                <p><strong>Assets:</strong> Cash, investments, property, vehicles</p>
                <p><strong>Liabilities:</strong> Loans, credit cards, mortgages</p>
            </div>
        </div>
    `;
}

async function loadCurrentNetWorth() {
    try {
        document.getElementById('resultsPanel').innerHTML = '<div class="loading loading-spinner loading-lg mx-auto block"></div>';
        
        const data = await API.advisor.getNetWorth();
        
        let healthMessage = '';
        if (data.debt_to_asset_ratio < 20) {
            healthMessage = 'Excellent! Your debt-to-asset ratio is very healthy.';
        } else if (data.debt_to_asset_ratio < 40) {
            healthMessage = 'Good financial position with manageable debt levels.';
        } else if (data.debt_to_asset_ratio < 60) {
            healthMessage = 'Moderate debt levels. Consider focusing on debt reduction.';
        } else {
            healthMessage = 'High debt ratio. Prioritize paying down liabilities.';
        }
        
        document.getElementById('resultsPanel').innerHTML = `
            <div class="space-y-4">
                <div class="stat bg-gradient-to-r from-info/20 to-primary/20 rounded-lg">
                    <div class="stat-title">Net Worth</div>
                    <div class="stat-value ${data.net_worth >= 0 ? 'text-success' : 'text-error'}">
                        ${Utils.formatCurrency(data.net_worth)}
                    </div>
                    <div class="stat-desc">As of ${data.calculated_at}</div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-3 bg-success/10 rounded-lg">
                        <p class="text-xs text-base-content/60">Total Assets</p>
                        <p class="text-lg font-bold text-success">${Utils.formatCurrency(data.total_assets)}</p>
                        ${Object.entries(data.assets_breakdown).map(([k, v]) => `
                            <div class="flex justify-between text-xs mt-1">
                                <span class="capitalize">${k.replace('_', ' ')}</span>
                                <span>${Utils.formatCurrency(v)}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="p-3 bg-error/10 rounded-lg">
                        <p class="text-xs text-base-content/60">Total Liabilities</p>
                        <p class="text-lg font-bold text-error">${Utils.formatCurrency(data.total_liabilities)}</p>
                        ${Object.entries(data.liabilities_breakdown).map(([k, v]) => `
                            <div class="flex justify-between text-xs mt-1">
                                <span class="capitalize">${k.replace('_', ' ')}</span>
                                <span>${Utils.formatCurrency(v)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="p-3 bg-base-200 rounded-lg">
                    <p class="text-sm"><strong>Debt-to-Asset Ratio:</strong> ${data.debt_to_asset_ratio.toFixed(1)}%</p>
                    <p class="text-xs text-base-content/60 mt-1">${healthMessage}</p>
                </div>
            </div>
        `;
        
        document.getElementById('chartPanel').classList.add('hidden');
    } catch (error) {
        console.error('Error:', error);
        Utils.showToast('Error loading net worth', 'error');
    }
}

async function loadNetWorthHistory() {
    try {
        const data = await API.advisor.getNetWorthHistory(12);
        
        const chartPanel = document.getElementById('chartPanel');
        chartPanel.classList.remove('hidden');
        document.getElementById('chartTitle').textContent = 'Net Worth History (Estimated)';
        
        const ctx = document.getElementById('advisorChart').getContext('2d');
        if (advisorChart) advisorChart.destroy();
        
        advisorChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => new Date(d.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
                datasets: [{
                    label: 'Net Worth',
                    data: data.map(d => d.net_worth),
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { ticks: { callback: v => '€' + (v/1000).toFixed(0) + 'k' } }
                }
            }
        });
        
        const firstValue = data[0]?.net_worth || 0;
        const lastValue = data[data.length - 1]?.net_worth || 0;
        const change = lastValue - firstValue;
        
        document.getElementById('resultsPanel').innerHTML = `
            <div class="space-y-3">
                <div class="alert alert-info">
                    <span>Estimated net worth over the past 12 months based on your transaction history.</span>
                </div>
                <div class="p-3 bg-base-200 rounded-lg">
                    <p class="text-sm">
                        <strong>12-Month Change:</strong> 
                        <span class="${change >= 0 ? 'text-success' : 'text-error'}">${change >= 0 ? '+' : ''}${Utils.formatCurrency(change)}</span>
                    </p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error:', error);
        Utils.showToast('Error loading history', 'error');
    }
}

async function loadNetWorthProjection() {
    try {
        const data = await API.advisor.getNetWorthProjection(12);
        
        const chartPanel = document.getElementById('chartPanel');
        chartPanel.classList.remove('hidden');
        document.getElementById('chartTitle').textContent = 'Net Worth Projection';
        
        const ctx = document.getElementById('advisorChart').getContext('2d');
        if (advisorChart) advisorChart.destroy();
        
        advisorChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Now', ...data.projections.map(p => new Date(p.date).toLocaleDateString('en-GB', { month: 'short' }))],
                datasets: [{
                    label: 'Projected Net Worth',
                    data: [data.current_net_worth, ...data.projections.map(p => p.projected_net_worth)],
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { ticks: { callback: v => '€' + (v/1000).toFixed(0) + 'k' } }
                }
            }
        });
        
        document.getElementById('resultsPanel').innerHTML = `
            <div class="space-y-3">
                <div class="stat bg-base-200 rounded-lg">
                    <div class="stat-title">Projected Growth</div>
                    <div class="stat-value text-success">${Utils.formatCurrency(data.total_growth)}</div>
                    <div class="stat-desc">Based on ${Utils.formatCurrency(data.monthly_savings_rate)}/month average savings</div>
                </div>
                <div class="p-3 bg-success/10 rounded-lg">
                    <p class="text-sm">Projected Net Worth in 12 months:</p>
                    <p class="text-xl font-bold">${Utils.formatCurrency(data.final_projected_net_worth)}</p>
                </div>
                <div class="p-3 bg-info/10 rounded-lg">
                    <p class="text-xs text-base-content/60">
                        💡 This projection assumes your current savings rate continues. Increasing your savings will accelerate growth.
                    </p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error:', error);
        Utils.showToast('Error loading projection', 'error');
    }
}

window.selectTool = selectTool;
window.switchInvestmentTab = switchInvestmentTab;
window.switchLoanTab = switchLoanTab;
window.calculateInvestment = calculateInvestment;
window.calculateRetirement = calculateRetirement;
window.compareInvestments = compareInvestments;
window.calculateAmortization = calculateAmortization;
window.calculateEarlyPayoff = calculateEarlyPayoff;
window.loadEmergencyFund = loadEmergencyFund;
window.loadCurrentNetWorth = loadCurrentNetWorth;
window.loadNetWorthHistory = loadNetWorthHistory;
window.loadNetWorthProjection = loadNetWorthProjection;
