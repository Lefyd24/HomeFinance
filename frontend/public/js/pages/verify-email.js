/**
 * Verify-email page controller
 */

function showState(id) {
    ['statePending', 'stateSuccess', 'stateError'].forEach(s => {
        document.getElementById(s).classList.toggle('hidden', s !== id);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
        showState('stateError');
        document.getElementById('errorText').textContent = 'This verification link is missing its token.';
        return;
    }

    try {
        await API.auth.verifyEmail(token);
        showState('stateSuccess');
    } catch (error) {
        showState('stateError');
        document.getElementById('errorText').textContent =
            error.message || 'This link is invalid or has expired.';
    }

    document.getElementById('resendBtn').addEventListener('click', async () => {
        const email = document.getElementById('resendEmail').value.trim();
        if (!email) return;
        const btn = document.getElementById('resendBtn');
        btn.disabled = true;
        try {
            await API.auth.resendVerification(email);
            Utils.showToast('If that account needs verifying, a new link was sent.', 'success');
        } catch {
            Utils.showToast('Could not resend verification email.', 'error');
        } finally {
            btn.disabled = false;
        }
    });
});
