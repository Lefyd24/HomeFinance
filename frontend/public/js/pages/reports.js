/**
 * Reports page controller — shell.
 *
 * Renders the sticky global filter bar (ReportFilters) and the tab
 * controller (ReportTabs). Tab content modules register themselves via
 * `ReportTabs.register(key, { label, render })` (see js/pages/reports/*.js
 * modules added in later tasks). This file only wires the shell together.
 */
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;

    // Render layout
    Layout.render('reports');

    const mainContent = document.getElementById('main-content');

    mainContent.innerHTML = `
        <div class="report-shell space-y-4">
            <p class="text-sm text-base-content/60">
                Analyze your finances with spending breakdowns, income trends, cash flow, and balance history.
                Filter below, switch tabs to explore, and save or export the view you care about.
            </p>

            <div id="reportFilterBar" class="report-filter-bar"></div>
            <div id="reportTabs" class="report-tabs-wrap"></div>
            <div id="reportTabContent" class="report-tab-content"></div>
        </div>
    `;

    try {
        await ReportFilters.init('reportFilterBar');
    } catch (error) {
        console.error('Error initializing report filters:', error);
        Utils.showToast('Failed to load filters', 'error');
    }

    ReportTabs.init('overview', 'reportTabs', 'reportTabContent');
});
