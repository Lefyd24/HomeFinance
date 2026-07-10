/**
 * ReportFilters — global filter bar for the Reports page.
 *
 * Public API:
 *   ReportFilters.init(containerId = 'reportFilterBar') -> Promise<void>
 *   ReportFilters.get() -> { range, startDate, endDate, accountIds: number[], categoryIds: number[] }
 *   ReportFilters.params() -> { start_date, end_date, account_ids?, category_ids? }
 *   ReportFilters.onChange(cb) -> unsubscribe function
 */
(function () {
    const PRESETS = [
        { key: 'mtd', label: 'MTD' },
        { key: '30d', label: '30D' },
        { key: '3m', label: '3M' },
        { key: '6m', label: '6M' },
        { key: 'ytd', label: 'YTD' },
        { key: '1y', label: '1Y' },
        { key: 'custom', label: 'Custom' }
    ];

    function pad(n) { return String(n).padStart(2, '0'); }
    function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

    function computeRange(range) {
        const today = new Date();
        const end = toISO(today);
        let start;
        switch (range) {
            case 'mtd':
                start = toISO(new Date(today.getFullYear(), today.getMonth(), 1));
                break;
            case '30d':
                start = toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
                break;
            case '3m':
                start = toISO(new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()));
                break;
            case '6m':
                start = toISO(new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()));
                break;
            case 'ytd':
                start = toISO(new Date(today.getFullYear(), 0, 1));
                break;
            case '1y':
                start = toISO(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
                break;
            default:
                start = toISO(new Date(today.getFullYear(), today.getMonth(), 1));
        }
        return { startDate: start, endDate: end };
    }

    const ReportFilters = {
        _state: {
            range: '30d',
            startDate: '',
            endDate: '',
            accountIds: [],
            categoryIds: []
        },
        _listeners: [],
        _accounts: [],
        _categories: [],
        _containerId: 'reportFilterBar',
        _initialized: false,

        async init(containerId = 'reportFilterBar') {
            this._containerId = containerId;

            const initial = computeRange('30d');
            this._state.startDate = initial.startDate;
            this._state.endDate = initial.endDate;

            try {
                const [accounts, categories] = await Promise.all([
                    API.accounts.list().catch(() => []),
                    API.categories.list().catch(() => [])
                ]);
                this._accounts = accounts || [];
                this._categories = categories || [];
            } catch (e) {
                console.error('ReportFilters: failed to load accounts/categories', e);
                this._accounts = [];
                this._categories = [];
            }

            this._render();
            this._initialized = true;
        },

        get() {
            return {
                range: this._state.range,
                startDate: this._state.startDate,
                endDate: this._state.endDate,
                accountIds: [...this._state.accountIds],
                categoryIds: [...this._state.categoryIds]
            };
        },

        params() {
            const p = {
                start_date: this._state.startDate,
                end_date: this._state.endDate
            };
            if (this._state.accountIds.length) {
                p.account_ids = this._state.accountIds.join(',');
            }
            if (this._state.categoryIds.length) {
                p.category_ids = this._state.categoryIds.join(',');
            }
            return p;
        },

        onChange(cb) {
            this._listeners.push(cb);
            return () => {
                this._listeners = this._listeners.filter(fn => fn !== cb);
            };
        },

        _emit() {
            const snapshot = this.get();
            this._listeners.forEach(cb => {
                try { cb(snapshot); } catch (e) { console.error('ReportFilters listener error', e); }
            });
        },

        _render() {
            const container = document.getElementById(this._containerId);
            if (!container) {
                console.error(`ReportFilters: container #${this._containerId} not found`);
                return;
            }

            const isCustom = this._state.range === 'custom';

            const presetButtons = PRESETS.map(p => `
                <button type="button"
                    class="btn btn-sm join-item ${this._state.range === p.key ? 'btn-primary' : 'btn-ghost'}"
                    data-preset="${p.key}">${p.label}</button>
            `).join('');

            const accountOptions = this._accounts.map(a => `
                <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input type="checkbox" class="checkbox checkbox-xs" data-account-id="${a.id}"
                        ${this._state.accountIds.includes(a.id) ? 'checked' : ''}>
                    <span class="label-text text-sm">${a.name}</span>
                </label>
            `).join('') || '<p class="px-2 py-1 text-sm text-base-content/50">No accounts</p>';

            const categoryOptions = this._categories.map(c => `
                <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input type="checkbox" class="checkbox checkbox-xs" data-category-id="${c.id}"
                        ${this._state.categoryIds.includes(c.id) ? 'checked' : ''}>
                    <span class="label-text text-sm">${c.name}</span>
                </label>
            `).join('') || '<p class="px-2 py-1 text-sm text-base-content/50">No categories</p>';

            const accountCount = this._state.accountIds.length;
            const categoryCount = this._state.categoryIds.length;

            container.innerHTML = `
                <div class="report-filter-card card bg-base-100 shadow-sm">
                    <div class="card-body p-3 sm:p-4 overflow-visible">
                        <div class="flex flex-wrap items-center gap-3">
                            <div class="join report-preset-join">${presetButtons}</div>

                            <div class="flex items-center gap-2 ${isCustom ? '' : 'hidden'}" id="reportCustomDates">
                                <input type="date" id="reportStartDate" class="input input-bordered input-sm"
                                    value="${this._state.startDate}">
                                <span class="text-base-content/50">to</span>
                                <input type="date" id="reportEndDate" class="input input-bordered input-sm"
                                    value="${this._state.endDate}">
                            </div>

                            <div class="dropdown dropdown-bottom report-filter-dropdown">
                                <label tabindex="0" class="btn btn-sm btn-outline gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    <span class="report-filter-dropdown-label">Accounts${accountCount ? ` (${accountCount})` : ''}</span>
                                </label>
                                <div tabindex="0" class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-56 max-h-64 overflow-y-auto flex-nowrap border border-base-200">
                                    <div class="flex justify-between items-center px-2 pb-1 border-b border-base-200 mb-1">
                                        <span class="text-xs font-semibold text-base-content/60">Accounts</span>
                                        <button type="button" class="btn btn-xs btn-ghost" id="reportAccountsClear">Clear</button>
                                    </div>
                                    <div id="reportAccountsList">${accountOptions}</div>
                                </div>
                            </div>

                            <div class="dropdown dropdown-bottom report-filter-dropdown">
                                <label tabindex="0" class="btn btn-sm btn-outline gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    <span class="report-filter-dropdown-label">Categories${categoryCount ? ` (${categoryCount})` : ''}</span>
                                </label>
                                <div tabindex="0" class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-56 max-h-64 overflow-y-auto flex-nowrap border border-base-200">
                                    <div class="flex justify-between items-center px-2 pb-1 border-b border-base-200 mb-1">
                                        <span class="text-xs font-semibold text-base-content/60">Categories</span>
                                        <button type="button" class="btn btn-xs btn-ghost" id="reportCategoriesClear">Clear</button>
                                    </div>
                                    <div id="reportCategoriesList">${categoryOptions}</div>
                                </div>
                            </div>

                            <div class="flex-1"></div>

                            <button type="button" id="reportSaveViewBtn" class="btn btn-sm btn-ghost gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                                Save view
                            </button>
                            <button type="button" id="reportExportBtn" class="btn btn-sm btn-outline gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export
                            </button>
                        </div>
                    </div>
                </div>
            `;

            this._bindEvents(container);
        },

        _bindEvents(container) {
            container.querySelectorAll('[data-preset]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-preset');
                    this._state.range = key;
                    if (key !== 'custom') {
                        const { startDate, endDate } = computeRange(key);
                        this._state.startDate = startDate;
                        this._state.endDate = endDate;
                    }
                    this._render();
                    this._emit();
                });
            });

            const startInput = container.querySelector('#reportStartDate');
            const endInput = container.querySelector('#reportEndDate');
            if (startInput) {
                startInput.addEventListener('change', () => {
                    this._state.startDate = startInput.value;
                    this._emit();
                });
            }
            if (endInput) {
                endInput.addEventListener('change', () => {
                    this._state.endDate = endInput.value;
                    this._emit();
                });
            }

            container.querySelectorAll('[data-account-id]').forEach(cb => {
                cb.addEventListener('change', () => {
                    const id = Number(cb.getAttribute('data-account-id'));
                    if (cb.checked) {
                        if (!this._state.accountIds.includes(id)) this._state.accountIds.push(id);
                    } else {
                        this._state.accountIds = this._state.accountIds.filter(x => x !== id);
                    }
                    this._updateBadges(container);
                    this._emit();
                });
            });

            container.querySelectorAll('[data-category-id]').forEach(cb => {
                cb.addEventListener('change', () => {
                    const id = Number(cb.getAttribute('data-category-id'));
                    if (cb.checked) {
                        if (!this._state.categoryIds.includes(id)) this._state.categoryIds.push(id);
                    } else {
                        this._state.categoryIds = this._state.categoryIds.filter(x => x !== id);
                    }
                    this._updateBadges(container);
                    this._emit();
                });
            });

            const accountsClear = container.querySelector('#reportAccountsClear');
            if (accountsClear) {
                accountsClear.addEventListener('click', () => {
                    this._state.accountIds = [];
                    this._render();
                    this._emit();
                });
            }

            const categoriesClear = container.querySelector('#reportCategoriesClear');
            if (categoriesClear) {
                categoriesClear.addEventListener('click', () => {
                    this._state.categoryIds = [];
                    this._render();
                    this._emit();
                });
            }

            const saveBtn = container.querySelector('#reportSaveViewBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => this._handleSaveView());
            }

            const exportBtn = container.querySelector('#reportExportBtn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this._handleExport());
            }
        },

        _updateBadges(container) {
            const accountCount = this._state.accountIds.length;
            const categoryCount = this._state.categoryIds.length;
            const labels = container.querySelectorAll('.report-filter-dropdown-label');
            if (labels[0]) labels[0].textContent = `Accounts${accountCount ? ` (${accountCount})` : ''}`;
            if (labels[1]) labels[1].textContent = `Categories${categoryCount ? ` (${categoryCount})` : ''}`;
        },

        async _handleSaveView() {
            const name = prompt('Enter a name for this saved view:');
            if (!name) return;
            try {
                const activeTab = (window.ReportTabs && window.ReportTabs.getActiveKey)
                    ? window.ReportTabs.getActiveKey()
                    : 'overview';
                await API.reports.save(name, activeTab, this.get());
                Utils.showToast(`View "${name}" saved`, 'success');
            } catch (e) {
                console.error('Failed to save view', e);
                Utils.showToast('Failed to save view', 'error');
            }
        },

        async _handleExport() {
            const activeTab = (window.ReportTabs && window.ReportTabs.getActiveKey)
                ? window.ReportTabs.getActiveKey()
                : 'overview';
            // Map tab keys to the backend's known /reports/export report identifiers.
            const reportMap = {
                overview: 'spending',
                spending: 'spending',
                income: 'income',
                cashflow: 'cashflow',
                'net-worth': 'net-worth',
                savings: 'savings-rate',
                merchants: 'top-merchants'
            };
            const reportKey = reportMap[activeTab] || 'spending';

            try {
                const query = new URLSearchParams({
                    report: reportKey,
                    start_date: this._state.startDate,
                    end_date: this._state.endDate
                }).toString();

                const token = localStorage.getItem('token');
                const response = await fetch(`${API.baseURL}/reports/export?${query}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${reportKey}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } catch (e) {
                console.error('Export failed', e);
                Utils.showToast('Export failed', 'error');
            }
        }
    };

    window.ReportFilters = ReportFilters;
})();
