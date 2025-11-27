<template>
  <div class="admin-login">
    <div class="login-container geometric-block">
      <h1>Admin Access</h1>
      <p class="login-subtitle">Enter your username to access the admin dashboard</p>
      
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            class="input"
            placeholder="Enter username"
            required
            autofocus
            :disabled="loading"
          />
        </div>
        
        <div v-if="error" class="error-message geometric-block-thin">
          {{ error }}
        </div>
        
        <button type="submit" class="btn" :disabled="loading || !username.trim()">
          {{ loading ? 'Verifying...' : 'Access Dashboard' }}
        </button>
      </form>
      
      <div class="login-footer">
        <router-link to="/login" class="link">Regular Login</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const username = ref('');
const loading = ref(false);
const error = ref('');

const ALLOWED_ADMIN_USERS = ['chuks', 'olamide', 'ola'];

const handleLogin = async () => {
  if (!username.value.trim()) {
    error.value = 'Please enter a username';
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  try {
    const userName = username.value.toLowerCase().trim();
    const isAuthorized = ALLOWED_ADMIN_USERS.includes(userName);
    
    if (!isAuthorized) {
      error.value = 'Access denied. Invalid username.';
      loading.value = false;
      return;
    }
    
    // Generate simple admin token (just for session tracking)
    const adminToken = btoa(`admin:${userName}:${Date.now()}`);
    
    // Store admin session
    sessionStorage.setItem('admin_username', userName);
    sessionStorage.setItem('admin_token', adminToken);
    
    // Success - redirect to admin dashboard
    router.push('/admin');
  } catch (err) {
    error.value = 'An error occurred. Please try again.';
    console.error('Admin login error:', err);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.admin-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--neutral-1);
  padding: var(--spacing-xl);
}

.login-container {
  width: 100%;
  max-width: 400px;
  padding: var(--spacing-xxl);
  text-align: center;
}

.login-container h1 {
  margin: 0 0 var(--spacing-md) 0;
  font-size: 2rem;
}

.login-subtitle {
  margin: 0 0 var(--spacing-xl) 0;
  color: #666;
  font-size: 0.9rem;
}

.login-form {
  text-align: left;
}

.form-group {
  margin-bottom: var(--spacing-lg);
}

.form-group label {
  display: block;
  margin-bottom: var(--spacing-sm);
  font-weight: var(--font-weight-semibold);
  font-size: 0.9rem;
}

.input {
  width: 100%;
  padding: var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  background: var(--neutral-1);
  font-family: var(--font-family);
  font-size: 1rem;
  color: var(--neutral-2);
}

.input:focus {
  outline: none;
  border-width: var(--border-thick);
}

.input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
  background: #f8d7da;
  color: #721c24;
  border-color: var(--accent);
}

.btn {
  width: 100%;
  padding: var(--spacing-md) var(--spacing-xl);
  border: var(--border-thick) solid var(--neutral-2);
  background: var(--neutral-1);
  color: var(--neutral-2);
  font-weight: var(--font-weight-semibold);
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s linear, color 0.2s linear;
}

.btn:hover:not(:disabled) {
  background: var(--neutral-2);
  color: white;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-footer {
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-lg);
  border-top: var(--border-thin) solid var(--neutral-2);
}

.link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9rem;
}

.link:hover {
  text-decoration: underline;
}
</style>

