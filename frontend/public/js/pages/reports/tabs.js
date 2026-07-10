/**
 * ReportTabs — tab controller for the Reports page.
 *
 * Tab modules register themselves:
 *   ReportTabs.register(key, { label, render(host, filters) })
 *
 * Public API:
 *   ReportTabs.register(key, { label, render })
 *   ReportTabs.init(defaultKey, containerId = 'reportTabs', contentId = 'reportTabContent') -> void
 *   ReportTabs.getActiveKey() -> string
 */
(function () {
    const ReportTabs = {
        _modules: {},
        _order: [],
        _activeKey: null,
        _containerId: 'reportTabs',
        _contentId: 'reportTabContent',
        _unsubscribeFilters: null,

        register(key, moduleDef) {
            if (!key || !moduleDef || typeof moduleDef.render !== 'function') {
                console.error('ReportTabs.register: invalid module definition for', key);
                return;
            }
            if (!this._modules[key]) {
                this._order.push(key);
            }
            this._modules[key] = moduleDef;

            // If tabs were already initialized, re-render the tab strip so the
            // newly registered module shows up (tab modules can load after init).
            if (this._activeKey !== null) {
                this._renderTabStrip();
                if (this._order.length === 1) {
                    this.switchTab(key);
                }
            }
        },

        init(defaultKey, containerId = 'reportTabs', contentId = 'reportTabContent') {
            this._containerId = containerId;
            this._contentId = contentId;

            const preferredKey = (defaultKey && this._modules[defaultKey]) ? defaultKey : this._order[0];
            this._activeKey = preferredKey || null;

            this._renderTabStrip();
            this._renderActiveTab();

            if (window.ReportFilters && typeof window.ReportFilters.onChange === 'function') {
                if (this._unsubscribeFilters) this._unsubscribeFilters();
                this._unsubscribeFilters = window.ReportFilters.onChange(() => this._renderActiveTab());
            }
        },

        getActiveKey() {
            return this._activeKey;
        },

        switchTab(key) {
            if (!this._modules[key]) return;
            this._activeKey = key;
            this._renderTabStrip();
            this._renderActiveTab();
        },

        _renderTabStrip() {
            const container = document.getElementById(this._containerId);
            if (!container) return;

            if (this._order.length === 0) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = `
                <nav class="report-tabs" role="tablist" aria-label="Report sections">
                    ${this._order.map(key => {
                        const mod = this._modules[key];
                        const active = key === this._activeKey;
                        return `
                            <button type="button"
                                role="tab"
                                class="report-tab${active ? ' report-tab-active' : ''}"
                                data-tab-key="${key}"
                                aria-selected="${active}"
                                aria-controls="reportTabContent"
                                tabindex="${active ? '0' : '-1'}"
                                id="report-tab-${key}">
                                <span class="report-tab-label">${mod.label || key}</span>
                            </button>
                        `;
                    }).join('')}
                </nav>
            `;

            container.querySelectorAll('[data-tab-key]').forEach(el => {
                el.addEventListener('click', () => this.switchTab(el.getAttribute('data-tab-key')));
            });

            // Scroll active tab into view on mobile
            const activeBtn = container.querySelector('.report-tab-active');
            if (activeBtn) {
                activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
            }
        },

        _renderActiveTab() {
            const host = document.getElementById(this._contentId);
            if (!host) return;

            if (!this._activeKey || !this._modules[this._activeKey]) {
                host.innerHTML = `
                    <div class="card bg-base-100 shadow-sm">
                        <div class="card-body items-center text-center py-16">
                            <p class="text-base-content/60">No report tabs are available yet.</p>
                        </div>
                    </div>
                `;
                return;
            }

            const filters = window.ReportFilters ? window.ReportFilters.get() : {};
            const mod = this._modules[this._activeKey];

            host.innerHTML = `
                <div class="flex items-center justify-center py-16">
                    <span class="loading loading-spinner loading-md text-primary"></span>
                </div>
            `;

            try {
                const result = mod.render(host, filters);
                if (result && typeof result.catch === 'function') {
                    result.catch(err => {
                        console.error(`ReportTabs: render failed for tab "${this._activeKey}"`, err);
                        host.innerHTML = '<p class="text-error p-4">Failed to load this report.</p>';
                    });
                }
            } catch (err) {
                console.error(`ReportTabs: render threw for tab "${this._activeKey}"`, err);
                host.innerHTML = '<p class="text-error p-4">Failed to load this report.</p>';
            }
        }
    };

    window.ReportTabs = ReportTabs;
})();
