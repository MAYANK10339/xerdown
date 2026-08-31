/* ============================================
   XERDOWN — Auth Form Handlers
   Login & Signup page logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');

  // --- Signup ---
  if (signupForm) {
    redirectIfAuth();

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alert = document.getElementById('auth-alert');
      const btn = signupForm.querySelector('button[type="submit"]');

      const username = document.getElementById('signup-username').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;

      // Client-side validation
      if (!username || !email || !password) {
        showAlert(alert, 'All fields are required.', 'error');
        return;
      }

      if (username.length < 3) {
        showAlert(alert, 'Username must be at least 3 characters.', 'error');
        return;
      }

      if (password.length < 6) {
        showAlert(alert, 'Password must be at least 6 characters.', 'error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Creating account...`;

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (!res.ok) {
          showAlert(alert, data.error || 'Signup failed.', 'error');
          btn.disabled = false;
          btn.textContent = 'Create Account';
          return;
        }

        showAlert(alert, 'Account created! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 800);
      } catch (err) {
        showAlert(alert, 'Connection error. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }

  // --- Login ---
  if (loginForm) {
    redirectIfAuth();

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alert = document.getElementById('auth-alert');
      const btn = loginForm.querySelector('button[type="submit"]');

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      if (!email || !password) {
        showAlert(alert, 'Email and password are required.', 'error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Signing in...`;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
          showAlert(alert, data.error || 'Login failed.', 'error');
          btn.disabled = false;
          btn.textContent = 'Sign In';
          return;
        }

        showAlert(alert, 'Logged in! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 800);
      } catch (err) {
        showAlert(alert, 'Connection error. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }

  // --- Password Toggle ---
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = icon('eyeOff');
      } else {
        input.type = 'password';
        btn.innerHTML = icon('eye');
      }
    });
  });
});

function showAlert(el, message, type) {
  el.textContent = message;
  el.className = `auth-alert ${type}`;
}
