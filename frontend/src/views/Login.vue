<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-form geometric-block">
        <h1>Sign In</h1>
        <p class="subtitle">Welcome back to coralgen</p>
        
        <!-- Error Message -->
        <div v-if="error" class="error-message geometric-block">
          <div class="error-content">
            <span class="error-icon">✕</span>
            <div class="error-details">
              <div class="error-title">{{ error.message }}</div>
              <div class="error-help">{{ error.help }}</div>
              <ul v-if="error.suggestions && error.suggestions.length > 0" class="error-suggestions">
                <li v-for="(suggestion, index) in error.suggestions" :key="index">{{ suggestion }}</li>
              </ul>
            </div>
          </div>
        </div>

        <form @submit.prevent="handleLogin" class="form">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input
              v-model="formData.email"
              type="email"
              class="input"
              :class="{ 'input-error': fieldErrors.email }"
              placeholder="your@email.com"
              required
              @input="clearFieldError('email')"
            />
            <span v-if="fieldErrors.email" class="field-error">{{ fieldErrors.email }}</span>
          </div>
          
          <div class="form-group">
            <label class="form-label">Password</label>
            <input
              v-model="formData.password"
              type="password"
              class="input"
              :class="{ 'input-error': fieldErrors.password }"
              placeholder="••••••••"
              required
              @input="clearFieldError('password')"
            />
            <span v-if="fieldErrors.password" class="field-error">{{ fieldErrors.password }}</span>
          </div>
          
          <button type="submit" class="btn btn-accent" :disabled="loading">
            {{ loading ? 'Signing In...' : 'Sign In' }}
          </button>
        </form>
        
        <div class="form-footer">
          <p>Don't have an account? <router-link to="/signin">Sign Up</router-link></p>
          <p><router-link to="/">Back to Home</router-link></p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import api from '../services/api';

const router = useRouter();
const authStore = useAuthStore();

const formData = ref({
  email: '',
  password: ''
});

const loading = ref(false);
const error = ref(null);
const fieldErrors = ref({});

function clearError() {
  error.value = null;
  fieldErrors.value = {};
}

function clearFieldError(field) {
  if (fieldErrors.value[field]) {
    delete fieldErrors.value[field];
  }
}

function getErrorMessage(err) {
  // Check if this is an axios error with a response
  // Axios errors have err.response when there's an HTTP response
  const response = err?.response;
  
  // Network errors (no response from server - connection failed)
  if (!response) {
    // True network error - server didn't respond
    return {
      message: 'Unable to connect to server',
      help: 'Please check your internet connection and try again. If the problem persists, the server may be temporarily unavailable.',
      type: 'network'
    };
  }
  
  // We have a response - this is an HTTP error
  const status = response.status;
  const data = response.data;
  
  // Get error message from response
  let backendMessage = data?.error || data?.message || 'An unexpected error occurred';
  
  // Handle specific error cases with helpful messages
  if (status === 401) {
    // Security: Don't reveal whether email exists or password is wrong
    // Just say "wrong credentials" with helpful suggestions
    return {
      message: 'Wrong credentials',
      help: 'The email or password you entered is incorrect.',
      type: 'credentials',
      suggestions: [
        'Double-check your email address for typos',
        'Verify your password is correct and Caps Lock is off',
        'If you don\'t have an account, try signing up instead'
      ]
    };
  }
  
  if (status === 400) {
    if (backendMessage.includes('required')) {
      return {
        message: 'Missing information',
        help: 'Please fill in all required fields to continue.',
        type: 'validation'
      };
    }
    
    return {
      message: 'Invalid information',
      help: backendMessage,
      type: 'validation'
    };
  }
  
  if (status === 404) {
    return {
      message: 'Account not found',
      help: 'No account exists with this email address. Please check your email or sign up to create a new account.',
      type: 'not_found',
      suggestions: [
        'Check for typos in your email address',
        'Try signing up if you don\'t have an account yet'
      ]
    };
  }
  
  if (status === 429) {
    return {
      message: 'Too many login attempts',
      help: 'Please wait a few minutes before trying again to protect your account.',
      type: 'rate_limit'
    };
  }
  
  if (status >= 500) {
    return {
      message: 'Server error',
      help: 'Something went wrong on our end. Please try again in a few moments. If the problem continues, please contact support.',
      type: 'server'
    };
  }
  
  return {
    message: 'Something went wrong',
    help: backendMessage || 'Please try again. If the problem persists, contact support.',
    type: 'unknown'
  };
}

async function handleLogin() {
  clearError();
  
  // Client-side validation
  if (!formData.value.email.trim()) {
    fieldErrors.value.email = 'Email is required';
    return;
  }
  
  if (!formData.value.password) {
    fieldErrors.value.password = 'Password is required';
    return;
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(formData.value.email)) {
    fieldErrors.value.email = 'Please enter a valid email address';
    return;
  }
  
  loading.value = true;
  try {
    const response = await api.post('/auth/login', {
      email: formData.value.email.trim(),
      password: formData.value.password
    });
    
    // Store token and user
    localStorage.setItem('onalog_token', response.data.token);
    localStorage.setItem('onalog_user', JSON.stringify(response.data.user));
    authStore.setUser(response.data.user);
    authStore.setToken(response.data.token);
    
    router.push('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    error.value = getErrorMessage(err);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--neutral-1);
  padding: var(--spacing-xl);
}

.login-container {
  width: 100%;
  max-width: 500px;
}

.login-form {
  padding: var(--spacing-xxl);
}

.login-form h1 {
  text-align: center;
  margin-bottom: var(--spacing-sm);
  font-size: 2.5rem;
}

.subtitle {
  text-align: center;
  color: #666;
  margin-bottom: var(--spacing-xl);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.form-label {
  font-weight: var(--font-weight-semibold);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-footer {
  margin-top: var(--spacing-xl);
  text-align: center;
  padding-top: var(--spacing-lg);
  border-top: var(--border-thin) solid var(--neutral-2);
}

.form-footer p {
  margin-bottom: var(--spacing-sm);
  color: #666;
}

.form-footer a {
  color: var(--accent);
  text-decoration: none;
  font-weight: var(--font-weight-semibold);
}

.form-footer a:hover {
  text-decoration: underline;
}

.error-message {
  margin-bottom: var(--spacing-lg);
  border-color: var(--accent);
  background: #fff5f5;
}

.error-content {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
}

.error-icon {
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  color: var(--accent);
  flex-shrink: 0;
  margin-top: 2px;
}

.error-details {
  flex: 1;
}

.error-title {
  font-weight: var(--font-weight-bold);
  color: var(--neutral-2);
  font-size: 1.125rem;
  margin-bottom: var(--spacing-xs);
}

.error-help {
  color: #666;
  font-size: 0.9375rem;
  line-height: 1.5;
  margin-bottom: var(--spacing-sm);
}

.error-suggestions {
  margin-top: var(--spacing-sm);
  padding-left: var(--spacing-lg);
  color: #666;
  font-size: 0.875rem;
  line-height: 1.6;
}

.error-suggestions li {
  margin-bottom: var(--spacing-xs);
}

.input-error {
  border-color: var(--accent) !important;
}

.field-error {
  display: block;
  font-size: 0.875rem;
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
  margin-top: var(--spacing-xs);
}
</style>

