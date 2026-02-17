/**
 * Login page controller
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const submitBtn = document.getElementById('submitBtn');
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Hide previous errors
        Utils.hideError('errorMessage');
        
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
            Utils.showError('errorMessage', error.message || 'Invalid email or password');
        } finally {
            // Hide loading
            Utils.toggleLoading(submitBtn, false);
        }
    });
});