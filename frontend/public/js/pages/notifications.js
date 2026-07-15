/**
 * Notifications Settings Page Handler
 */

const NotificationPage = {
    settings: null,
    rules: [],
    accounts: [],
    budgets: [],
    deletingRuleId: null,

    init() {
        if (!Auth.isAuthenticated()) {
            window.location.href = '/index.html';
            return;
        }

        Layout.render('notifications');

        const mainContent = document.getElementById('main-content');
        const template = document.getElementById('notifications-content');
        if (mainContent && template) {
            mainContent.innerHTML = template.innerHTML;
        }

        this.populateHourSelects();
        this.wireEvents();
        this.loadAll();
        this.refreshDesktopPushStatus();
    },

    populateHourSelects() {
        ['quietHoursStart', 'quietHoursEnd'].forEach((id) => {
            const select = document.getElementById(id);
            if (!select) return;
            for (let h = 0; h <= 23; h++) {
                const opt = document.createElement('option');
                opt.value = String(h);
                opt.textContent = `${String(h).padStart(2, '0')}:00`;
                select.appendChild(opt);
            }
        });
    },

    wireEvents() {
        document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        document.getElementById('smtpForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        document.getElementById('channelsForm')?.addEventListener('change', () => {
            this.saveChannelToggles();
        });

        document.getElementById('testEmailBtn')?.addEventListener('click', () => {
            this.sendTest('email');
        });

        document.getElementById('testPushBtn')?.addEventListener('click', () => {
            this.sendTest('push');
        });

        document.getElementById('runRulesBtn')?.addEventListener('click', () => {
            this.runRulesNow();
        });

        document.getElementById('enableDesktopBtn')?.addEventListener('click', () => {
            this.enableDesktopNotifications();
        });

        document.getElementById('disableDesktopBtn')?.addEventListener('click', () => {
            this.disableDesktopNotifications();
        });

        document.getElementById('addRuleBtn')?.addEventListener('click', () => {
            this.openRuleModal();
        });

        document.getElementById('ruleForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRule();
        });

        document.getElementById('ruleType')?.addEventListener('change', () => {
            this.updateRuleFormFields();
        });

        document.getElementById('ruleScheduleKind')?.addEventListener('change', () => {
            this.updateScheduleValueField();
        });

        document.getElementById('confirmDeleteRuleBtn')?.addEventListener('click', () => {
            this.confirmDeleteRule();
        });
    },

    async loadAll() {
        try {
            const [settings, rules, accounts, budgets] = await Promise.all([
                API.notifications.getSettings(),
                API.notifications.listRules(),
                API.accounts.list(),
                API.budgets.list(false),
            ]);
            this.settings = settings;
            this.rules = rules;
            this.accounts = accounts;
            this.budgets = budgets;
            this.populateSettingsForm(settings);
            this.renderRules();
        } catch (error) {
            console.error('Failed to load notifications:', error);
            Utils.showToast('Failed to load notification settings', 'error');
            const container = document.getElementById('rulesListContainer');
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-error">
                        <span>Failed to load rules. Please refresh the page.</span>
                    </div>
                `;
            }
        }
    },

    populateSettingsForm(settings) {
        document.getElementById('emailEnabled').checked = !!settings.email_enabled;
        document.getElementById('pushEnabled').checked = !!settings.push_enabled;
        document.getElementById('defaultDaysBefore').value = settings.default_days_before ?? 3;
        document.getElementById('quietHoursStart').value =
            settings.quiet_hours_start != null ? String(settings.quiet_hours_start) : '';
        document.getElementById('quietHoursEnd').value =
            settings.quiet_hours_end != null ? String(settings.quiet_hours_end) : '';

        document.getElementById('smtpHost').value = settings.smtp_host || '';
        document.getElementById('smtpPort').value = settings.smtp_port ?? '';
        document.getElementById('smtpUser').value = settings.smtp_user || '';
        document.getElementById('smtpFrom').value = settings.smtp_from || '';
        document.getElementById('smtpUseTls').checked = settings.smtp_use_tls !== false;
        document.getElementById('smtpPassword').value = '';

        const hint = document.getElementById('smtpPasswordHint');
        if (hint) {
            hint.classList.toggle('hidden', !settings.smtp_password_set);
        }
    },

    buildSettingsPayload() {
        const payload = {
            email_enabled: document.getElementById('emailEnabled').checked,
            push_enabled: document.getElementById('pushEnabled').checked,
            default_days_before: parseInt(document.getElementById('defaultDaysBefore').value, 10) || 3,
            quiet_hours_start: this.parseOptionalHour('quietHoursStart'),
            quiet_hours_end: this.parseOptionalHour('quietHoursEnd'),
            smtp_host: document.getElementById('smtpHost').value.trim() || null,
            smtp_port: document.getElementById('smtpPort').value
                ? parseInt(document.getElementById('smtpPort').value, 10)
                : null,
            smtp_user: document.getElementById('smtpUser').value.trim() || null,
            smtp_from: document.getElementById('smtpFrom').value.trim() || null,
            smtp_use_tls: document.getElementById('smtpUseTls').checked,
        };

        const password = document.getElementById('smtpPassword').value;
        if (password) {
            payload.smtp_password = password;
        }

        return payload;
    },

    parseOptionalHour(selectId) {
        const val = document.getElementById(selectId)?.value;
        if (val === '' || val == null) return null;
        return parseInt(val, 10);
    },

    async saveSettings() {
        try {
            const payload = this.buildSettingsPayload();
            this.settings = await API.notifications.updateSettings(payload);
            this.populateSettingsForm(this.settings);
            Utils.showToast('Notification settings saved', 'success');
        } catch (error) {
            console.error('Failed to save settings:', error);
            Utils.showToast('Failed to save settings: ' + error.message, 'error');
        }
    },

    async saveChannelToggles() {
        try {
            const payload = {
                email_enabled: document.getElementById('emailEnabled').checked,
                push_enabled: document.getElementById('pushEnabled').checked,
            };
            this.settings = await API.notifications.updateSettings(payload);
            Utils.showToast('Channel preferences updated', 'success');
        } catch (error) {
            console.error('Failed to update channels:', error);
            Utils.showToast('Failed to update channels: ' + error.message, 'error');
            if (this.settings) this.populateSettingsForm(this.settings);
        }
    },

    async refreshDesktopPushStatus() {
        const statusEl = document.getElementById('desktopPushStatus');
        const enableBtn = document.getElementById('enableDesktopBtn');
        const disableBtn = document.getElementById('disableDesktopBtn');

        if (!PushNotifications.isSupported()) {
            if (statusEl) statusEl.textContent = 'Desktop notifications are not supported in this browser';
            if (enableBtn) {
                enableBtn.disabled = true;
                enableBtn.classList.remove('hidden');
            }
            if (disableBtn) disableBtn.classList.add('hidden');
            return;
        }

        let serverStatus = null;
        try {
            serverStatus = await API.notifications.pushStatus();
        } catch (e) {
            console.warn('Could not load push status', e);
        }

        const browserSubscribed = await PushNotifications.isSubscribed();
        const serverSubs = serverStatus?.subscription_count ?? 0;

        if (statusEl) {
            if (!serverStatus?.vapid_configured) {
                statusEl.textContent = 'Server push not configured — restart backend after setting VAPID keys in .env';
            } else if (browserSubscribed && serverSubs > 0) {
                statusEl.textContent = 'Desktop notifications are enabled for this browser';
            } else if (browserSubscribed && serverSubs === 0) {
                statusEl.textContent = 'Browser subscribed but not registered on server — click Enable again';
            } else {
                statusEl.textContent = 'Click Enable to allow browser notifications';
            }
        }

        const ready = browserSubscribed && serverSubs > 0;
        if (enableBtn) {
            enableBtn.disabled = false;
            enableBtn.classList.toggle('hidden', ready);
        }
        if (disableBtn) disableBtn.classList.toggle('hidden', !ready);
    },

    async enableDesktopNotifications() {
        const btn = document.getElementById('enableDesktopBtn');
        if (btn) btn.disabled = true;
        try {
            await PushNotifications.subscribe({ forceRefresh: true });
            this.settings = await API.notifications.updateSettings({ push_enabled: true });
            document.getElementById('pushEnabled').checked = true;
            await this.refreshDesktopPushStatus();
            Utils.showToast('Desktop notifications enabled', 'success');
        } catch (error) {
            console.error('Desktop notification setup failed:', error);
            Utils.showToast(error.message || 'Failed to enable desktop notifications', 'error');
        } finally {
            await this.refreshDesktopPushStatus();
        }
    },

    async disableDesktopNotifications() {
        const btn = document.getElementById('disableDesktopBtn');
        if (btn) btn.disabled = true;
        try {
            await PushNotifications.unsubscribe();
            this.settings = await API.notifications.updateSettings({ push_enabled: false });
            document.getElementById('pushEnabled').checked = false;
            await this.refreshDesktopPushStatus();
            Utils.showToast('Desktop notifications disabled', 'success');
        } catch (error) {
            console.error('Failed to disable desktop notifications:', error);
            Utils.showToast(error.message || 'Failed to disable desktop notifications', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    async runRulesNow() {
        const btn = document.getElementById('runRulesBtn');
        if (btn) btn.disabled = true;
        try {
            const result = await API.notifications.run();
            const level = result.sent > 0 ? 'success' : (result.evaluated > 0 ? 'warning' : 'info');
            Utils.showToast(result.message || 'Rules checked', level);
        } catch (error) {
            console.error('Rule check failed:', error);
            Utils.showToast('Failed to check rules: ' + error.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    async sendTest(channel) {
        const btnId = channel === 'email' ? 'testEmailBtn' : 'testPushBtn';
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = true;
        try {
            const result = await API.notifications.test(channel);
            if (channel === 'email') {
                if (result.email) {
                    Utils.showToast('Test email sent — check your inbox', 'success');
                } else {
                    Utils.showToast('Test email failed: ' + (result.email_detail || 'check SMTP settings'), 'error');
                }
            } else {
                if (result.push) {
                    Utils.showToast('Test desktop notification sent', 'success');
                } else {
                    Utils.showToast('Test push failed: ' + (result.push_detail || 'check configuration'), 'error');
                }
            }
        } catch (error) {
            console.error('Test notification failed:', error);
            Utils.showToast('Test failed: ' + error.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    renderRules() {
        const container = document.getElementById('rulesListContainer');
        if (!container) return;

        if (!this.rules.length) {
            container.innerHTML = `
                <div class="bg-base-200 border-2 border-dashed border-base-300 rounded-lg p-8 text-center">
                    <p class="text-base-content/70 text-sm">No notification rules yet. Add one to get started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Details</th>
                            <th>Channels</th>
                            <th>Status</th>
                            <th class="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.rules.map((rule) => `
                            <tr>
                                <td class="font-medium">${this.escapeHtml(rule.name)}</td>
                                <td><span class="badge badge-outline badge-sm">${this.formatRuleType(rule.type)}</span></td>
                                <td class="text-sm text-base-content/70">${this.escapeHtml(this.describeRule(rule))}</td>
                                <td class="text-sm">${this.escapeHtml(rule.channels || 'email')}</td>
                                <td>
                                    <span class="badge badge-sm ${rule.is_active ? 'badge-success' : 'badge-ghost'}">
                                        ${rule.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td class="text-right">
                                    <div class="flex justify-end gap-1">
                                        <button type="button" class="btn btn-ghost btn-xs" onclick="NotificationPage.openRuleModal(${rule.id})">Edit</button>
                                        <button type="button" class="btn btn-ghost btn-xs text-error" onclick="NotificationPage.openDeleteModal(${rule.id})">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    formatRuleType(type) {
        const labels = {
            balance_below: 'Balance',
            budget_percent: 'Budget',
            scheduled_report: 'Report',
        };
        return labels[type] || type;
    },

    describeRule(rule) {
        if (rule.type === 'balance_below') {
            const acc = this.accounts.find((a) => a.id === rule.target_id);
            return `${acc ? acc.name : 'Account #' + rule.target_id} below €${rule.threshold ?? 0}`;
        }
        if (rule.type === 'budget_percent') {
            const budget = this.budgets.find((b) => b.id === rule.target_id);
            return `${budget ? budget.name : 'Budget #' + rule.target_id} at ${rule.threshold ?? 0}%`;
        }
        if (rule.type === 'scheduled_report') {
            const schedule = rule.schedule_kind === 'every_n_days'
                ? `every ${rule.schedule_value || 7} days`
                : rule.schedule_kind || 'scheduled';
            return `${rule.report_type || 'report'}, ${schedule}`;
        }
        return '';
    },

    openRuleModal(ruleId = null) {
        const modal = document.getElementById('ruleModal');
        const form = document.getElementById('ruleForm');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('ruleId').value = '';
        document.getElementById('ruleIsActive').checked = true;
        document.getElementById('ruleChannelEmail').checked = true;
        document.getElementById('ruleChannelPush').checked = false;
        document.getElementById('ruleScheduleValue').value = '7';

        if (ruleId) {
            const rule = this.rules.find((r) => r.id === ruleId);
            if (!rule) return;
            document.getElementById('ruleModalTitle').textContent = 'Edit notification rule';
            document.getElementById('ruleId').value = String(rule.id);
            document.getElementById('ruleType').value = rule.type;
            document.getElementById('ruleName').value = rule.name;
            document.getElementById('ruleThreshold').value = rule.threshold ?? '';
            document.getElementById('ruleReportType').value = rule.report_type || 'spending';
            document.getElementById('ruleScheduleKind').value = rule.schedule_kind || 'every_n_days';
            document.getElementById('ruleScheduleValue').value = rule.schedule_value ?? 7;
            document.getElementById('ruleIsActive').checked = !!rule.is_active;
            const channels = (rule.channels || 'email').split(',').map((c) => c.trim());
            document.getElementById('ruleChannelEmail').checked = channels.includes('email');
            document.getElementById('ruleChannelPush').checked = channels.includes('push');
        } else {
            document.getElementById('ruleModalTitle').textContent = 'Add notification rule';
        }

        this.updateRuleFormFields();

        if (ruleId) {
            const rule = this.rules.find((r) => r.id === ruleId);
            if (rule?.target_id) {
                document.getElementById('ruleTargetId').value = String(rule.target_id);
            }
        }

        modal.showModal();
        setupModalBackdropDismiss?.();
    },

    updateRuleFormFields() {
        const type = document.getElementById('ruleType').value;
        const targetField = document.getElementById('ruleTargetField');
        const thresholdField = document.getElementById('ruleThresholdField');
        const scheduleFields = document.getElementById('ruleScheduleFields');
        const targetSelect = document.getElementById('ruleTargetId');
        const targetLabel = document.getElementById('ruleTargetLabel');
        const thresholdLabel = document.getElementById('ruleThresholdLabel');

        if (type === 'scheduled_report') {
            targetField.classList.add('hidden');
            thresholdField.classList.add('hidden');
            scheduleFields.classList.remove('hidden');
            this.updateScheduleValueField();
            return;
        }

        scheduleFields.classList.add('hidden');
        targetField.classList.remove('hidden');
        thresholdField.classList.remove('hidden');

        if (type === 'balance_below') {
            targetLabel.textContent = 'Account';
            thresholdLabel.textContent = 'Balance threshold (€)';
            targetSelect.innerHTML = '<option value="">Select account…</option>' +
                this.accounts.map((a) => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
        } else if (type === 'budget_percent') {
            targetLabel.textContent = 'Budget';
            thresholdLabel.textContent = 'Usage threshold (%)';
            targetSelect.innerHTML = '<option value="">Select budget…</option>' +
                this.budgets.map((b) => `<option value="${b.id}">${this.escapeHtml(b.name)}</option>`).join('');
        }
    },

    updateScheduleValueField() {
        const kind = document.getElementById('ruleScheduleKind').value;
        const field = document.getElementById('ruleScheduleValueField');
        const legend = field?.querySelector('.fieldset-legend');
        if (!field) return;

        if (kind === 'every_n_days') {
            field.classList.remove('hidden');
            if (legend) legend.textContent = 'Every (days)';
        } else {
            field.classList.add('hidden');
        }
    },

    buildRulePayload() {
        const type = document.getElementById('ruleType').value;
        const channels = [];
        if (document.getElementById('ruleChannelEmail').checked) channels.push('email');
        if (document.getElementById('ruleChannelPush').checked) channels.push('push');

        const payload = {
            type,
            name: document.getElementById('ruleName').value.trim(),
            channels: channels.length ? channels.join(',') : 'email',
            is_active: document.getElementById('ruleIsActive').checked,
        };

        if (type === 'balance_below' || type === 'budget_percent') {
            const targetId = document.getElementById('ruleTargetId').value;
            if (!targetId) throw new Error('Please select a target');
            payload.target_id = parseInt(targetId, 10);
            const threshold = parseFloat(document.getElementById('ruleThreshold').value);
            if (Number.isNaN(threshold)) throw new Error('Please enter a valid threshold');
            payload.threshold = threshold;
        }

        if (type === 'scheduled_report') {
            payload.report_type = document.getElementById('ruleReportType').value;
            payload.schedule_kind = document.getElementById('ruleScheduleKind').value;
            if (payload.schedule_kind === 'every_n_days') {
                payload.schedule_value = parseInt(document.getElementById('ruleScheduleValue').value, 10) || 7;
            }
        }

        return payload;
    },

    async saveRule() {
        try {
            const payload = this.buildRulePayload();
            const ruleId = document.getElementById('ruleId').value;

            if (ruleId) {
                await API.notifications.updateRule(parseInt(ruleId, 10), payload);
                Utils.showToast('Rule updated', 'success');
            } else {
                await API.notifications.createRule(payload);
                Utils.showToast('Rule created', 'success');
            }

            document.getElementById('ruleModal')?.close();
            this.rules = await API.notifications.listRules();
            this.renderRules();
        } catch (error) {
            console.error('Failed to save rule:', error);
            Utils.showToast(error.message || 'Failed to save rule', 'error');
        }
    },

    openDeleteModal(ruleId) {
        const rule = this.rules.find((r) => r.id === ruleId);
        if (!rule) return;
        this.deletingRuleId = ruleId;
        document.getElementById('deleteRuleName').textContent = rule.name;
        document.getElementById('deleteRuleModal')?.showModal();
    },

    async confirmDeleteRule() {
        if (!this.deletingRuleId) return;
        try {
            await API.notifications.deleteRule(this.deletingRuleId);
            document.getElementById('deleteRuleModal')?.close();
            Utils.showToast('Rule deleted', 'success');
            this.deletingRuleId = null;
            this.rules = await API.notifications.listRules();
            this.renderRules();
        } catch (error) {
            console.error('Failed to delete rule:', error);
            Utils.showToast('Failed to delete rule: ' + error.message, 'error');
        }
    },

    escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },
};

document.addEventListener('DOMContentLoaded', () => {
    NotificationPage.init();
});

window.NotificationPage = NotificationPage;
