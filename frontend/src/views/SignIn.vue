<template>
  <div class="signin-page">
    <div class="signin-container">
      <div class="signin-form geometric-block">
        <h1>Sign Up</h1>
        <p class="subtitle">Create your Onalog account</p>
        
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

        <form @submit.prevent="handleSignIn" class="form">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              v-model="formData.name"
              type="text"
              class="input"
              :class="{ 'input-error': fieldErrors.name }"
              placeholder="Your name"
              required
              @input="clearFieldError('name')"
            />
            <span v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name }}</span>
          </div>
          
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
              minlength="6"
              @input="clearFieldError('password')"
            />
            <span v-if="fieldErrors.password" class="field-error">{{ fieldErrors.password }}</span>
            <span v-else class="field-hint">Must be at least 6 characters</span>
          </div>
          
          <div class="form-group">
            <label class="form-label">Company Name</label>
            <input
              v-model="formData.companyName"
              type="text"
              class="input"
              :class="{ 'input-error': fieldErrors.companyName }"
              placeholder="Your company name"
              required
              minlength="2"
              @input="clearFieldError('companyName')"
            />
            <span v-if="fieldErrors.companyName" class="field-error">{{ fieldErrors.companyName }}</span>
          </div>
          
          <!-- Company confirmation (shown if similar company found) -->
          <div v-if="companyConfirmation" class="company-confirmation geometric-block">
            <p class="confirmation-message">{{ companyConfirmation.message }}</p>
            <div class="confirmation-actions">
              <button
                type="button"
                class="btn btn-accent"
                @click="joinExistingCompany"
              >
                Join "{{ companyConfirmation.suggestedCompany.name }}"
              </button>
              <button
                type="button"
                class="btn"
                @click="createNewCompany"
              >
                Create New "{{ formData.companyName }}"
              </button>
            </div>
          </div>
          
          <button
            v-else
            type="submit"
            class="btn btn-accent"
            :disabled="loading"
          >
            {{ loading ? 'Creating Account...' : 'Sign Up' }}
          </button>
        </form>
        
        <div class="form-footer">
          <p>Already have an account? <router-link to="/login">Sign In</router-link></p>
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
  name: '',
  email: '',
  password: '',
  companyName: ''
});

const loading = ref(false);
const error = ref(null);
const fieldErrors = ref({});
const companyConfirmation = ref(null);

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
  const response = err?.response;
  
  // Network errors (no response from server - connection failed)
  if (!response) {
    // Check if error message indicates it's actually a wrapped HTTP error
    const errorMessage = err?.message || String(err || '');
    
    // If the error message contains API error info, try to extract it
    if (errorMessage.includes('already exists') || errorMessage.includes('User with this email')) {
      return {
        message: 'Email already registered',
        help: 'An account with this email address already exists. Please sign in instead or use a different email.',
        type: 'duplicate',
        suggestions: [
          'Try signing in instead if this is your account',
          'Use a different email address to create a new account',
          'Check if you used a different email when signing up'
        ]
      };
    }
    
    // True network error
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
  if (status === 400) {
    if (backendMessage.includes('already exists') || backendMessage.includes('User with this email')) {
      return {
        message: 'Email already registered',
        help: 'An account with this email address already exists.',
        type: 'duplicate',
        suggestions: [
          'Try signing in instead if this is your account',
          'Use a different email address to create a new account',
          'Check if you used a different email when signing up'
        ]
      };
    }
    
    if (backendMessage.includes('password') && (backendMessage.includes('6') || backendMessage.includes('length'))) {
      return {
        message: 'Password too short',
        help: 'Your password must be at least 6 characters long for security.',
        type: 'validation',
        suggestions: [
          'Use at least 6 characters',
          'Consider using a mix of letters and numbers for better security'
        ]
      };
    }
    
    if (backendMessage.includes('company name') && (backendMessage.includes('2') || backendMessage.includes('length'))) {
      return {
        message: 'Company name too short',
        help: 'Company name must be at least 2 characters long.',
        type: 'validation'
      };
    }
    
    if (backendMessage.includes('required')) {
      return {
        message: 'Missing information',
        help: 'Please fill in all required fields to create your account.',
        type: 'validation'
      };
    }
    
    return {
      message: 'Invalid information',
      help: backendMessage,
      type: 'validation'
    };
  }
  
  if (status === 409) {
    return {
      message: 'Email already registered',
      help: 'This email address is already in use. Please sign in instead or use a different email.',
      type: 'duplicate',
      suggestions: [
        'Click "Sign In" to log into your existing account',
        'Use a different email address if you want to create a new account'
      ]
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

function validateForm() {
  clearError();
  let isValid = true;
  
  // Name validation
  if (!formData.value.name || !formData.value.name.trim()) {
    fieldErrors.value.name = 'Name is required';
    isValid = false;
  } else if (formData.value.name.trim().length < 2) {
    fieldErrors.value.name = 'Name must be at least 2 characters';
    isValid = false;
  }
  
  // Email validation
  if (!formData.value.email || !formData.value.email.trim()) {
    fieldErrors.value.email = 'Email is required';
    isValid = false;
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.value.email.trim())) {
      fieldErrors.value.email = 'Please enter a valid email address';
      isValid = false;
    }
  }
  
  // Password validation
  if (!formData.value.password) {
    fieldErrors.value.password = 'Password is required';
    isValid = false;
  } else if (formData.value.password.length < 6) {
    fieldErrors.value.password = 'Password must be at least 6 characters';
    isValid = false;
  }
  
  // Company name validation
  if (!formData.value.companyName || !formData.value.companyName.trim()) {
    fieldErrors.value.companyName = 'Company name is required';
    isValid = false;
  } else if (formData.value.companyName.trim().length < 2) {
    fieldErrors.value.companyName = 'Company name must be at least 2 characters';
    isValid = false;
  }
  
  return isValid;
}

async function handleSignIn() {
  if (!validateForm()) {
    return;
  }
  
  loading.value = true;
  try {
    const response = await api.post('/auth/signup', {
      name: formData.value.name.trim(),
      email: formData.value.email.trim(),
      password: formData.value.password,
      companyName: formData.value.companyName.trim()
    });
    
    // Check if confirmation is required
    if (response.data.requiresConfirmation) {
      companyConfirmation.value = {
        suggestedCompany: response.data.suggestedCompany,
        message: response.data.message
      };
      loading.value = false;
      return;
    }
    
    // Store token and user
    localStorage.setItem('onalog_token', response.data.token);
    localStorage.setItem('onalog_user', JSON.stringify(response.data.user));
    authStore.setUser(response.data.user);
    authStore.setToken(response.data.token);
    
    router.push('/dashboard');
  } catch (err) {
    console.error('Sign in error:', err);
    error.value = getErrorMessage(err);
    
    // Set field-specific errors if available
    if (err.response?.data?.fieldErrors) {
      fieldErrors.value = { ...fieldErrors.value, ...err.response.data.fieldErrors };
    }
  } finally {
    loading.value = false;
  }
}

async function joinExistingCompany() {
  clearError();
  loading.value = true;
  try {
    const response = await api.post('/auth/signup', {
      name: formData.value.name.trim(),
      email: formData.value.email.trim(),
      password: formData.value.password,
      companyName: formData.value.companyName.trim(),
      joinCompanyId: companyConfirmation.value.suggestedCompany.id
    });
    
    // Store token and user
    localStorage.setItem('onalog_token', response.data.token);
    localStorage.setItem('onalog_user', JSON.stringify(response.data.user));
    authStore.setUser(response.data.user);
    authStore.setToken(response.data.token);
    
    router.push('/dashboard');
  } catch (err) {
    console.error('Sign in error:', err);
    error.value = getErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function createNewCompany() {
  companyConfirmation.value = null;
  // Retry signup - will create new company
  handleSignIn();
}
</script>

<style scoped>
.signin-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--neutral-1);
  padding: var(--spacing-xl);
}

.signin-container {
  width: 100%;
  max-width: 500px;
}

.signin-form {
  padding: var(--spacing-xxl);
}

.signin-form h1 {
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

.company-confirmation {
  padding: var(--spacing-lg);
  margin-top: var(--spacing-md);
  border: var(--border-thick) solid var(--accent);
}

.confirmation-message {
  margin-bottom: var(--spacing-md);
  font-weight: var(--font-weight-semibold);
}

.confirmation-actions {
  display: flex;
  gap: var(--spacing-md);
  flex-direction: column;
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

.field-hint {
  display: block;
  font-size: 0.75rem;
  color: #666;
  margin-top: var(--spacing-xs);
}
</style>

