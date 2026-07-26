/**
 * Login page controller
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const submitBtn = document.getElementById('submitBtn');
    const resendBtn = document.getElementById('resendVerificationBtn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide previous errors
        Utils.hideError('errorMessage');
        if (resendBtn) resendBtn.classList.add('hidden');

        // Get form data
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Show loading
        Utils.toggleLoading(submitBtn, true);

        try {
            // Attempt login
            const response = await Auth.login(email, password);

            // Show success
            Utils.showToast('Login successful!', 'success');

            // Redirect to dashboard
            window.location.href = 'pages/dashboard.html';

        } catch (error) {
            // Show error
            const message = error.message || 'Invalid email or password';
            Utils.showError('errorMessage', message);

            // The backend uses a distinct message for unverified accounts —
            // offer a one-click resend instead of leaving the user stuck.
            if (resendBtn && /verify your email/i.test(message)) {
                resendBtn.classList.remove('hidden');
                resendBtn.onclick = async () => {
                    resendBtn.disabled = true;
                    try {
                        await API.auth.resendVerification(email);
                        Utils.showToast('If that account needs verifying, a new link was sent.', 'success');
                    } catch {
                        Utils.showToast('Could not resend verification email.', 'error');
                    } finally {
                        resendBtn.disabled = false;
                    }
                };
            }
        } finally {
            // Hide loading
            Utils.toggleLoading(submitBtn, false);
        }
    });
});