/**
 * Admin Page Handler — invite codes + user management
 */

function _escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const AdminPage = {
    invites: [],
    users: [],

    init() {
        if (!Auth.isAuthenticated()) {
            window.location.href = '/index.html';
            return;
        }
        const user = Auth.getUser();
        if (!user || !user.is_admin) {
            // Not an admin — the backend would 403 anyway, just bounce.
            window.location.href = 'dashboard.html';
            return;
        }

        Layout.render('admin');

        const mainContent = document.getElementById('main-content');
        const template = document.getElementById('admin-content');
        if (mainContent && template) {
            mainContent.innerHTML = template.innerHTML;
        }

        document.getElementById('createInviteForm').addEventListener('submit', (e) => this.handleCreateInvite(e));

        this.loadInvites();
        this.loadUsers();
    },

    openCreateInviteModal() {
        document.getElementById('inviteLabel').value = '';
        document.getElementById('inviteExpiresDays').value = '';
        document.getElementById('createInviteModal').showModal();
    },

    async handleCreateInvite(e) {
        e.preventDefault();
        const label = document.getElementById('inviteLabel').value.trim() || null;
        const expiresDaysRaw = document.getElementById('inviteExpiresDays').value;
        const expiresInDays = expiresDaysRaw ? Number(expiresDaysRaw) : null;

        try {
            const result = await API.admin.createInvite({
                label,
                expires_in_days: expiresInDays
            });
            document.getElementById('createInviteModal').close();
            document.getElementById('newInviteCode').value = result.code;
            document.getElementById('showInviteModal').showModal();
        } catch (error) {
            Utils.showToast(error.message || 'Failed to create invite code', 'error');
        }
    },

    copyNewInviteCode() {
        const input = document.getElementById('newInviteCode');
        input.select();
        navigator.clipboard?.writeText(input.value).then(() => {
            Utils.showToast('Copied to clipboard', 'success');
        }).catch(() => {
            document.execCommand('copy');
        });
    },

    async loadInvites() {
        const tbody = document.getElementById('invitesTableBody');
        if (!tbody) return;
        try {
            this.invites = await API.admin.listInvites();
            this.renderInvites();
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error py-6">${_escapeHtml(error.message || 'Failed to load invites')}</td></tr>`;
        }
    },

    renderInvites() {
        const tbody = document.getElementById('invitesTableBody');
        if (!tbody) return;

        if (this.invites.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-base-content/50 py-6">No invite codes yet</td></tr>`;
            return;
        }

        const badgeClass = {
            active: 'badge-success',
            used: 'badge-neutral',
            expired: 'badge-warning',
            revoked: 'badge-error'
        };

        tbody.innerHTML = this.invites.map(inv => `
            <tr>
                <td>${_escapeHtml(inv.label || '—')}</td>
                <td><span class="badge badge-sm ${badgeClass[inv.status] || 'badge-ghost'}">${_escapeHtml(inv.status)}</span></td>
                <td>${inv.expires_at ? Utils.formatDate(inv.expires_at) : 'Never'}</td>
                <td>${inv.used_by_user_id ? `#${inv.used_by_user_id}` : '—'}</td>
                <td>${Utils.formatDate(inv.created_at)}</td>
                <td class="text-right">
                    ${inv.status === 'active' ? `<button class="btn btn-ghost btn-xs text-error" onclick="AdminPage.revokeInvite(${inv.id})">Revoke</button>` : ''}
                </td>
            </tr>
        `).join('');
    },

    async revokeInvite(id) {
        if (!confirm('Revoke this invite code? It will no longer be usable.')) return;
        try {
            await API.admin.revokeInvite(id);
            Utils.showToast('Invite revoked', 'success');
            this.loadInvites();
        } catch (error) {
            Utils.showToast(error.message || 'Failed to revoke invite', 'error');
        }
    },

    async loadUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        try {
            this.users = await API.admin.listUsers();
            this.renderUsers();
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-error py-6">${_escapeHtml(error.message || 'Failed to load users')}</td></tr>`;
        }
    },

    renderUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        const currentUser = Auth.getUser();

        tbody.innerHTML = this.users.map(u => `
            <tr>
                <td>${_escapeHtml(u.email)}</td>
                <td>${_escapeHtml(u.full_name || '—')}</td>
                <td>${u.email_verified ? '<span class="badge badge-sm badge-success">Verified</span>' : '<span class="badge badge-sm badge-warning">Pending</span>'}</td>
                <td>${u.is_admin ? '<span class="badge badge-sm badge-primary">Admin</span>' : ''}</td>
                <td>${u.is_active ? '<span class="badge badge-sm badge-success">Active</span>' : '<span class="badge badge-sm badge-ghost">Disabled</span>'}</td>
                <td>${Utils.formatDate(u.created_at)}</td>
                <td class="text-right">
                    ${u.id === currentUser?.id
                        ? '<span class="text-xs opacity-50">You</span>'
                        : `<button class="btn btn-ghost btn-xs ${u.is_active ? 'text-error' : 'text-success'}" onclick="AdminPage.toggleUserActive(${u.id}, ${u.is_active})">${u.is_active ? 'Deactivate' : 'Activate'}</button>`
                    }
                </td>
            </tr>
        `).join('');
    },

    async toggleUserActive(id, currentlyActive) {
        const action = currentlyActive ? 'deactivate' : 'activate';
        if (!confirm(`Are you sure you want to ${action} this user?`)) return;
        try {
            await API.admin.setUserActive(id, !currentlyActive);
            Utils.showToast(`User ${action}d`, 'success');
            this.loadUsers();
        } catch (error) {
            Utils.showToast(error.message || `Failed to ${action} user`, 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => AdminPage.init());
