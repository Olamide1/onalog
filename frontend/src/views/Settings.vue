<template>
  <div class="settings-page">
    <!-- Header -->
    <header class="settings-header horizontal-band">
      <div class="container">
        <div class="header-content">
          <div class="header-left">
            <h1>Settings</h1>
            <router-link to="/dashboard" class="back-link">← Back to Dashboard</router-link>
          </div>
        </div>
      </div>
    </header>

    <div class="container settings-content">
      <!-- User Settings -->
      <section class="settings-section geometric-block">
        <h2>Profile Settings</h2>
        
        <div v-if="loading" class="loading-state">
          <div class="loading-bar"></div>
        </div>

        <div v-else class="settings-form">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              v-model="userSettings.name"
              type="text"
              class="input"
              :class="{ 'input-error': fieldErrors.name }"
              placeholder="Your name"
              @input="clearFieldError('name')"
            />
            <span v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">Email</label>
            <input
              :value="userSettings.email"
              type="email"
              class="input"
              disabled
            />
            <span class="field-hint">Email cannot be changed</span>
          </div>

          <div class="form-group">
            <label class="form-label">Default Country</label>
            <select v-model="userSettings.defaultCountry" class="input">
              <option value="">No default</option>
              <optgroup label="Africa">
                <option value="ng">Nigeria</option>
                <option value="za">South Africa</option>
                <option value="ke">Kenya</option>
                <option value="gh">Ghana</option>
                <option value="ug">Uganda</option>
                <option value="tz">Tanzania</option>
                <option value="et">Ethiopia</option>
                <option value="eg">Egypt</option>
                <option value="zm">Zambia</option>
                <option value="zw">Zimbabwe</option>
                <option value="rw">Rwanda</option>
                <option value="sn">Senegal</option>
                <option value="ci">Ivory Coast</option>
                <option value="cm">Cameroon</option>
                <option value="ao">Angola</option>
                <option value="ma">Morocco</option>
                <option value="tn">Tunisia</option>
                <option value="dz">Algeria</option>
                <option value="mg">Madagascar</option>
                <option value="mw">Malawi</option>
              </optgroup>
              <optgroup label="North America">
                <option value="us">United States</option>
                <option value="ca">Canada</option>
                <option value="mx">Mexico</option>
              </optgroup>
              <optgroup label="Europe">
                <option value="gb">United Kingdom</option>
                <option value="de">Germany</option>
                <option value="fr">France</option>
                <option value="it">Italy</option>
                <option value="es">Spain</option>
                <option value="nl">Netherlands</option>
                <option value="be">Belgium</option>
                <option value="ch">Switzerland</option>
                <option value="at">Austria</option>
                <option value="se">Sweden</option>
                <option value="no">Norway</option>
                <option value="dk">Denmark</option>
                <option value="pl">Poland</option>
                <option value="ie">Ireland</option>
                <option value="pt">Portugal</option>
              </optgroup>
              <optgroup label="Asia">
                <option value="in">India</option>
                <option value="cn">China</option>
                <option value="jp">Japan</option>
                <option value="kr">South Korea</option>
                <option value="sg">Singapore</option>
                <option value="my">Malaysia</option>
                <option value="th">Thailand</option>
                <option value="id">Indonesia</option>
                <option value="ph">Philippines</option>
                <option value="vn">Vietnam</option>
                <option value="ae">United Arab Emirates</option>
                <option value="sa">Saudi Arabia</option>
                <option value="il">Israel</option>
                <option value="pk">Pakistan</option>
                <option value="bd">Bangladesh</option>
              </optgroup>
              <optgroup label="Oceania">
                <option value="au">Australia</option>
                <option value="nz">New Zealand</option>
              </optgroup>
              <optgroup label="South America">
                <option value="br">Brazil</option>
                <option value="ar">Argentina</option>
                <option value="co">Colombia</option>
                <option value="cl">Chile</option>
                <option value="pe">Peru</option>
              </optgroup>
            </select>
            <span class="field-hint">This will be pre-selected in new searches</span>
          </div>

          <div class="form-group">
            <label class="form-label">Default Result Count</label>
            <select v-model="userSettings.defaultResultCount" class="input">
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
            </select>
            <span class="field-hint">Default number of results per search</span>
          </div>

          <button
            @click="saveUserSettings"
            class="btn btn-accent"
            :disabled="savingUser"
          >
            {{ savingUser ? 'Saving...' : 'Save Profile Settings' }}
          </button>

          <div v-if="userSaveMessage" class="save-message" :class="userSaveMessage.type">
            {{ userSaveMessage.text }}
          </div>
        </div>
      </section>

      <!-- Password Change -->
      <section class="settings-section geometric-block">
        <h2>Change Password</h2>
        
        <div class="settings-form">
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input
              v-model="passwordForm.currentPassword"
              type="password"
              class="input"
              :class="{ 'input-error': fieldErrors.currentPassword }"
              placeholder="••••••••"
              @input="clearFieldError('currentPassword')"
            />
            <span v-if="fieldErrors.currentPassword" class="field-error">{{ fieldErrors.currentPassword }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">New Password</label>
            <input
              v-model="passwordForm.newPassword"
              type="password"
              class="input"
              :class="{ 'input-error': fieldErrors.newPassword }"
              placeholder="••••••••"
              minlength="6"
              @input="clearFieldError('newPassword')"
            />
            <span v-if="fieldErrors.newPassword" class="field-error">{{ fieldErrors.newPassword }}</span>
            <span v-else class="field-hint">Must be at least 6 characters</span>
          </div>

          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input
              v-model="passwordForm.confirmPassword"
              type="password"
              class="input"
              :class="{ 'input-error': fieldErrors.confirmPassword }"
              placeholder="••••••••"
              @input="clearFieldError('confirmPassword')"
            />
            <span v-if="fieldErrors.confirmPassword" class="field-error">{{ fieldErrors.confirmPassword }}</span>
          </div>

          <button
            @click="changePassword"
            class="btn btn-accent"
            :disabled="savingPassword"
          >
            {{ savingPassword ? 'Changing...' : 'Change Password' }}
          </button>

          <div v-if="passwordMessage" class="save-message" :class="passwordMessage.type">
            {{ passwordMessage.text }}
          </div>
        </div>
      </section>

      <!-- Company Settings (Admin only) -->
      <section v-if="authStore.user?.role === 'admin'" class="settings-section geometric-block">
        <h2>Company Settings</h2>
        <p class="section-subtitle">Control how data is shared within your company</p>
        
        <CompanySettings />
      </section>
      <!-- Billing & Usage (Admin only) -->
      <section v-if="authStore.user?.role === 'admin'" class="settings-section geometric-block">
        <h2>Billing & Usage</h2>
        <p class="section-subtitle">Manage currency and provider, view balance, and buy credits</p>
        <BillingSettings @open-buy="openBuy" />
      </section>
    </div>
    <BuyCreditsModal v-if="showBuy" @close="closeBuy" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import CompanySettings from '../components/CompanySettings.vue';
import BillingSettings from '../components/BillingSettings.vue';
import BuyCreditsModal from '../components/BuyCreditsModal.vue';
import api from '../services/api';

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const savingUser = ref(false);
const savingPassword = ref(false);
const userSettings = ref({
  name: '',
  email: '',
  defaultCountry: '',
  defaultResultCount: 50
});
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});
const fieldErrors = ref({});
const userSaveMessage = ref(null);
const passwordMessage = ref(null);
const showBuy = ref(false);

function clearFieldError(field) {
  if (fieldErrors.value[field]) {
    delete fieldErrors.value[field];
  }
  if (userSaveMessage.value) userSaveMessage.value = null;
  if (passwordMessage.value) passwordMessage.value = null;
}

async function loadUserSettings() {
  loading.value = true;
  try {
    const response = await api.get('/auth/me');
    if (response.data.user) {
      userSettings.value = {
        name: response.data.user.name || '',
        email: response.data.user.email || '',
        defaultCountry: response.data.user.defaultCountry || '',
        defaultResultCount: response.data.user.defaultResultCount || 50
      };
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  } finally {
    loading.value = false;
  }
}

function validateUserSettings() {
  fieldErrors.value = {};
  let isValid = true;

  if (!userSettings.value.name || userSettings.value.name.trim().length < 2) {
    fieldErrors.value.name = 'Name must be at least 2 characters';
    isValid = false;
  }

  return isValid;
}

async function saveUserSettings() {
  if (!validateUserSettings()) return;

  savingUser.value = true;
  userSaveMessage.value = null;
  
  try {
    const response = await api.put('/auth/profile', {
      name: userSettings.value.name.trim(),
      defaultCountry: userSettings.value.defaultCountry || null,
      defaultResultCount: userSettings.value.defaultResultCount
    });
    
    // Update auth store
    authStore.setUser({ ...authStore.user, ...response.data.user });
    
    userSaveMessage.value = {
      type: 'success',
      text: 'Profile settings saved successfully'
    };
    
    // Clear message after 3 seconds
    setTimeout(() => {
      userSaveMessage.value = null;
    }, 3000);
  } catch (error) {
    console.error('Error saving user settings:', error);
    userSaveMessage.value = {
      type: 'error',
      text: error.response?.data?.error || 'Failed to save settings. Please try again.'
    };
  } finally {
    savingUser.value = false;
  }
}

function validatePassword() {
  fieldErrors.value = {};
  let isValid = true;

  if (!passwordForm.value.currentPassword) {
    fieldErrors.value.currentPassword = 'Current password is required';
    isValid = false;
  }

  if (!passwordForm.value.newPassword) {
    fieldErrors.value.newPassword = 'New password is required';
    isValid = false;
  } else if (passwordForm.value.newPassword.length < 6) {
    fieldErrors.value.newPassword = 'Password must be at least 6 characters';
    isValid = false;
  }

  if (!passwordForm.value.confirmPassword) {
    fieldErrors.value.confirmPassword = 'Please confirm your new password';
    isValid = false;
  } else if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    fieldErrors.value.confirmPassword = 'Passwords do not match';
    isValid = false;
  }

  return isValid;
}

async function changePassword() {
  if (!validatePassword()) return;

  savingPassword.value = true;
  passwordMessage.value = null;
  
  try {
    await api.put('/auth/password', {
      currentPassword: passwordForm.value.currentPassword,
      newPassword: passwordForm.value.newPassword
    });
    
    passwordMessage.value = {
      type: 'success',
      text: 'Password changed successfully'
    };
    
    // Clear form
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
    
    // Clear message after 3 seconds
    setTimeout(() => {
      passwordMessage.value = null;
    }, 3000);
  } catch (error) {
    console.error('Error changing password:', error);
    passwordMessage.value = {
      type: 'error',
      text: error.response?.data?.error || 'Failed to change password. Please try again.'
    };
  } finally {
    savingPassword.value = false;
  }
}

onMounted(async () => {
  authStore.initAuth();
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  
  await loadUserSettings();
});

function openBuy() {
  showBuy.value = true;
  document.body.style.overflow = 'hidden';
}
function closeBuy() {
  showBuy.value = false;
  document.body.style.overflow = '';
}
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--neutral-1);
}

.settings-header {
  margin-bottom: var(--spacing-xl);
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--spacing-xl);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.back-link {
  font-size: 0.875rem;
  color: var(--accent);
  text-decoration: none;
  font-weight: var(--font-weight-semibold);
  transition: color 0.2s linear;
}

.back-link:hover {
  color: var(--neutral-2);
  text-decoration: underline;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

.settings-section {
  padding: var(--spacing-xl);
}

.settings-section h2 {
  margin-bottom: var(--spacing-sm);
  font-size: 1.5rem;
  border-bottom: var(--border-thick) solid var(--neutral-2);
  padding-bottom: var(--spacing-sm);
}

.section-subtitle {
  color: #666;
  font-size: 0.875rem;
  margin-bottom: var(--spacing-lg);
}

.loading-state {
  padding: var(--spacing-md);
}

.loading-bar {
  height: 4px;
  background: var(--neutral-2);
  animation: loading 1.5s linear infinite;
}

@keyframes loading {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-top: var(--spacing-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-label {
  font-weight: var(--font-weight-semibold);
  font-size: 0.9375rem;
  color: var(--neutral-2);
}

.input {
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  background: var(--neutral-1);
  font-size: 1rem;
  transition: all 0.2s linear;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
}

.input:disabled {
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}

.input-error {
  border-color: var(--accent) !important;
}

.field-error {
  font-size: 0.875rem;
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
}

.field-hint {
  font-size: 0.75rem;
  color: #666;
}

.btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  border: var(--border-medium) solid var(--neutral-2);
  background: var(--neutral-1);
  color: var(--neutral-2);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: all 0.2s linear;
  align-self: flex-start;
}

.btn:hover:not(:disabled) {
  background: var(--neutral-2);
  color: var(--neutral-1);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-accent {
  background: var(--accent);
  color: var(--neutral-1);
  border-color: var(--accent);
}

.btn-accent:hover:not(:disabled) {
  background: var(--neutral-2);
  border-color: var(--neutral-2);
}

.save-message {
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-medium) solid;
  font-size: 0.875rem;
  font-weight: var(--font-weight-semibold);
}

.save-message.success {
  border-color: #4caf50;
  color: #4caf50;
  background: #f1f8f4;
}

.save-message.error {
  border-color: var(--accent);
  color: var(--accent);
  background: #fff5f5;
}
</style>

