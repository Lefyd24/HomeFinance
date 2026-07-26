/**
 * Forgot-password page controller
 */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgotPasswordForm');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        Utils.hideError('errorMessage');
        document.getElementById('successMessage').classList.add('hidden');

        const email = document.getElementById('email').value;

        Utils.toggleLoading(submitBtn, true);
        try {
            const response = await API.auth.forgotPassword(email);
            document.getElementById('successText').textContent =
                response.message || 'If an account with that email exists, a password reset link has been sent.';
            document.getElementById('successMessage').classList.remove('hidden');
            form.reset();
        } catch (error) {
            // The backend always returns 200 for this endpoint (no account
            // enumeration) — an error here means something else went wrong
            // (network, rate limit, etc.), so it's fine to surface it.
            Utils.showError('errorMessage', error.message || 'Something went wrong. Please try again.');
        } finally {
            Utils.toggleLoading(submitBtn, false);
        }
    });
});
