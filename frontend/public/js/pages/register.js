/**
 * Register page controller
 */

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const submitBtn = document.getElementById('submitBtn');
    
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Hide previous errors
        Utils.hideError('errorMessage');
        
        // Get form data
        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const inviteCode = document.getElementById('inviteCode').value.trim();
        
        // Validate passwords match
        if (password !== confirmPassword) {
            Utils.showError('errorMessage', 'Passwords do not match');
            return;
        }
        
        // Validate password length
        if (password.length < 8) {
            Utils.showError('errorMessage', 'Password must be at least 8 characters');
            return;
        }
        
        // Validate email
        if (!Utils.isValidEmail(email)) {
            Utils.showError('errorMessage', 'Please enter a valid email address');
            return;
        }
        
        // Show loading
        Utils.toggleLoading(submitBtn, true);
        
        try {
            // Attempt registration
            const response = await Auth.register({
                fullName,
                email,
                password,
                inviteCode
            });

            // Show success
            Utils.showToast('Registration successful! Check your email to verify your account before logging in.', 'success', 5000);
            
            // Redirect to login
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1500);
            
        } catch (error) {
            // Show error
            Utils.showError('errorMessage', error.message || 'Registration failed');
        } finally {
            // Hide loading
            Utils.toggleLoading(submitBtn, false);
        }
    });
});