/**
 * Reset-password page controller
 */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('resetPasswordForm');
    const submitBtn = document.getElementById('submitBtn');
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
        Utils.showError('errorMessage', 'This reset link is missing its token. Request a new one.');
        form.querySelectorAll('input, button').forEach(el => el.disabled = true);
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        Utils.hideError('errorMessage');
        document.getElementById('successMessage').classList.add('hidden');

        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            Utils.showError('errorMessage', 'Passwords do not match');
            return;
        }
        if (newPassword.length < 8) {
            Utils.showError('errorMessage', 'Password must be at least 8 characters');
            return;
        }

        Utils.toggleLoading(submitBtn, true);
        try {
            const response = await API.auth.resetPassword(token, newPassword);
            document.getElementById('successText').textContent =
                response.message || 'Password has been reset. Please log in with your new password.';
            document.getElementById('successMessage').classList.remove('hidden');
            form.reset();
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 2000);
        } catch (error) {
            Utils.showError('errorMessage', error.message || 'This reset link is invalid or has expired.');
        } finally {
            Utils.toggleLoading(submitBtn, false);
        }
    });
});
