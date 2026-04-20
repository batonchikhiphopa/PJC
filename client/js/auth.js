// auth.js — login/register/logout/session

import { auth as authApi, users as usersApi } from './api.js';
import { el, showEl, hideEl, showError, hideError } from './ui.js';
import { setUser } from './state.js';

let authMode = 'login';

export async function checkSession() {
  const token = localStorage.getItem('pjc_token');
  if (!token) return false;
  try {
    const user = await authApi.me();
    setUser(user);
    return user;
  } catch {
    localStorage.removeItem('pjc_token');
    return false;
  }
}

export function initLoginScreen(onSuccess) {
  showEl('login-screen');
  hideEl('app');

  setAuthMode('login');

  el('auth-login-tab').onclick = () => setAuthMode('login');
  el('auth-register-tab').onclick = () => setAuthMode('register');
  el('auth-mode-toggle').onclick = () => {
    setAuthMode(authMode === 'login' ? 'register' : 'login');
  };

  el('login-btn').onclick = async () => {
    const email = el('login-email').value.trim();
    const password = el('login-password').value;
    const confirmPassword = el('register-confirm-password').value;
    hideError('login-error');

    if (!email || !password) {
      showError('login-error', 'Email and password are required');
      return;
    }

    if (authMode === 'register' && password !== confirmPassword) {
      showError('login-error', 'Passwords do not match');
      return;
    }

    el('login-btn').disabled = true;
    el('login-btn').textContent = authMode === 'login' ? 'Signing in...' : 'Creating account...';

    try {
      if (authMode === 'register') {
        await usersApi.create(email, password);
      }

      const res = await authApi.login(email, password);
      localStorage.setItem('pjc_token', res.token);
      setUser(res.user);
      hideEl('login-screen');
      onSuccess(res.user);
    } catch (err) {
      showError('login-error', err.message || (authMode === 'login' ? 'Login failed' : 'Registration failed'));
    } finally {
      el('login-btn').disabled = false;
      el('login-btn').textContent = authMode === 'login' ? 'Sign in' : 'Create account';
    }
  };

  // Enter key
  ['login-email', 'login-password', 'register-confirm-password'].forEach(id => {
    el(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el('login-btn').click();
    });
  });
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';

  hideError('login-error');
  el('auth-title').textContent = isRegister ? 'Create account' : 'Sign in';
  el('auth-subtitle').textContent = isRegister
    ? 'Start tracking every application in one place.'
    : 'Welcome back to your job search tracker.';
  el('login-btn').textContent = isRegister ? 'Create account' : 'Sign in';
  el('auth-mode-toggle').textContent = isRegister
    ? 'Already have an account? Sign in'
    : 'New here? Create an account';
  el('login-password').autocomplete = isRegister ? 'new-password' : 'current-password';

  el('auth-login-tab').classList.toggle('active', !isRegister);
  el('auth-register-tab').classList.toggle('active', isRegister);

  if (isRegister) {
    showEl('confirm-password-field');
  } else {
    hideEl('confirm-password-field');
    el('register-confirm-password').value = '';
  }
}

export function logout() {
  localStorage.removeItem('pjc_token');
  window.location.reload();
}
