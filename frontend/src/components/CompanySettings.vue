<template>
  <div class="company-settings geometric-block">
    <div class="settings-header">
      <div class="header-top">
        <h2>Company Settings</h2>
        <button v-if="showClose" @click="$emit('close')" class="btn-close">×</button>
      </div>
      <p v-if="authStore.user?.role !== 'admin'" class="admin-only">
        Only admins can change these settings
      </p>
    </div>
    
    <div v-if="authStore.user?.role === 'admin'" class="settings-content">
      <div class="setting-item">
        <div class="setting-info">
          <h3>Share Searches</h3>
          <p>Allow all company members to see each other's searches</p>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            v-model="settings.shareSearches"
            @change="updateSettings"
            :disabled="saving"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div class="setting-item">
        <div class="setting-info">
          <h3>Share Leads</h3>
          <p>Allow all company members to see each other's leads</p>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            v-model="settings.shareLeads"
            @change="updateSettings"
            :disabled="saving"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div class="setting-item">
        <div class="setting-info">
          <h3>Share Templates</h3>
          <p>Allow all company members to see each other's search templates</p>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            v-model="settings.shareTemplates"
            @change="updateSettings"
            :disabled="saving"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div v-if="saving" class="saving-indicator">
        Saving...
      </div>
      <div v-if="saved" class="saved-indicator">
        Saved
      </div>
    </div>
    
    <div v-else class="settings-readonly">
      <p>Contact your company admin to change these settings</p>
      <div class="setting-item">
        <div class="setting-info">
          <h3>Share Searches</h3>
        </div>
        <span class="badge" :class="{ on: settings.shareSearches }">{{ settings.shareSearches ? 'On' : 'Off' }}</span>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <h3>Share Leads</h3>
        </div>
        <span class="badge" :class="{ on: settings.shareLeads }">{{ settings.shareLeads ? 'On' : 'Off' }}</span>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <h3>Share Templates</h3>
        </div>
        <span class="badge" :class="{ on: settings.shareTemplates }">{{ settings.shareTemplates ? 'On' : 'Off' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import api from '../services/api';

defineProps({
  showClose: {
    type: Boolean,
    default: false
  }
});

defineEmits(['close']);

const authStore = useAuthStore();
const settings = ref({
  shareSearches: true,
  shareLeads: true,
  shareTemplates: true
});
const saving = ref(false);
const saved = ref(false);

async function loadSettings() {
  try {
    const response = await api.get('/company');
    if (response.data.settings) {
      settings.value = response.data.settings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function updateSettings() {
  saving.value = true;
  try {
    await api.put('/company/settings', settings.value);
    // Reload to get updated settings
    await loadSettings();
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 1500);
  } catch (error) {
    console.error('Error updating settings:', error);
    alert('Failed to update settings. Please try again.');
    // Reload to revert
    await loadSettings();
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.company-settings {
  padding: var(--spacing-xl);
}

.settings-header {
  border-bottom: var(--border-thick) solid var(--neutral-2);
  padding-bottom: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.settings-header h2 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: var(--neutral-2);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s linear;
}

.btn-close:hover {
  color: var(--accent);
}

.admin-only {
  color: #666;
  font-size: 0.875rem;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  border: var(--border-thin) solid var(--neutral-2);
}

.setting-info {
  flex: 1;
}

.setting-info h3 {
  font-size: 1.125rem;
  margin-bottom: var(--spacing-xs);
}

.setting-info p {
  font-size: 0.875rem;
  color: #666;
  margin: 0;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 30px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--neutral-1);
  border: var(--border-medium) solid var(--neutral-2);
  transition: 0.3s linear;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 22px;
  width: 22px;
  left: 4px;
  bottom: 3px;
  background-color: var(--neutral-2);
  transition: 0.3s linear;
}

input:checked + .toggle-slider {
  background-color: var(--accent);
  border-color: var(--accent);
}

input:checked + .toggle-slider:before {
  transform: translateX(30px);
  background-color: white;
}

input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.saving-indicator {
  text-align: center;
  padding: var(--spacing-md);
  color: #666;
}
.saved-indicator {
  text-align: center;
  padding: var(--spacing-xs);
  color: #2e7d32;
  font-weight: var(--font-weight-semibold);
}

.settings-readonly {
  padding: var(--spacing-lg);
  text-align: center;
  color: #666;
}
.badge {
  border: var(--border-medium) solid var(--neutral-2);
  padding: 4px 10px;
  border-radius: 16px;
  font-weight: var(--font-weight-semibold);
}
.badge.on {
  border-color: var(--accent);
  color: var(--accent);
}
</style>

