<template>
  <div class="billing-settings geometric-block">
    <div class="header">
      <h3>Billing & Usage</h3>
      <span v-if="!profile.enabled" class="badge warn">Billing disabled (env)</span>
    </div>
    <div class="row">
      <div class="col">
        <label>Currency</label>
        <select class="input" v-model="form.currency" :disabled="saving || !authStore.isAuthenticated || !isAdmin">
          <option value="usd">USD</option>
          <option value="ngn">NGN</option>
        </select>
      </div>
      <div class="col">
        <label>Provider</label>
        <select class="input" v-model="form.provider" :disabled="saving || !isAdmin">
          <option value="mock">Mock (dev)</option>
          <option value="stripe" disabled>Stripe (soon)</option>
          <option value="paystack" disabled>Paystack (soon)</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="usage">
        <div><strong>Balance:</strong> {{ usage?.balance ?? 0 }}</div>
        <div><strong>Currency:</strong> {{ (usage?.currency || form.currency).toUpperCase() }}</div>
      </div>
      <div class="actions">
        <button class="btn" @click="$emit('open-buy')" :disabled="saving">Buy Credits</button>
        <button class="btn btn-accent" @click="save" :disabled="saving || !isAdmin">Save</button>
      </div>
    </div>
    <div v-if="message" class="message" :class="message.type">{{ message.text }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';

defineEmits(['open-buy']);
const authStore = useAuthStore();

const profile = ref({ enabled: false, profile: { currency: 'usd', provider: 'mock' } });
const usage = ref(null);
const form = ref({ currency: 'usd', provider: 'mock' });
const saving = ref(false);
const message = ref(null);
const isAdmin = computed(() => authStore.user?.role === 'admin');

async function load() {
  try {
    const [p, u] = await Promise.all([
      api.get('/billing/profile'),
      api.get('/billing/usage')
    ]);
    profile.value = { enabled: p.data?.enabled, profile: p.data?.profile };
    form.value = { ...(p.data?.profile || form.value) };
    usage.value = u.data;
  } catch (e) {
    // ignore
  }
}

async function save() {
  try {
    saving.value = true;
    message.value = null;
    await api.put('/billing/profile', form.value);
    message.value = { type: 'success', text: 'Billing settings saved.' };
    setTimeout(() => { message.value = null; }, 1500);
  } catch (e) {
    message.value = { type: 'error', text: e.response?.data?.error || 'Save failed.' };
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.billing-settings { padding: var(--spacing-lg); }
.header { display:flex; align-items:center; justify-content: space-between; margin-bottom: var(--spacing-md); }
.badge.warn { border: var(--border-medium) solid #e6a700; padding: 4px 10px; border-radius: 16px; color: #e6a700; }
.row { display:flex; gap: var(--spacing-lg); align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; }
.col { display:flex; flex-direction: column; gap: 6px; min-width: 220px; }
label { font-size: 0.9rem; color: var(--neutral-2); }
.usage { display:flex; gap: var(--spacing-lg); }
.actions { margin-left: auto; display:flex; gap: var(--spacing-md); }
.message { margin-top: var(--spacing-sm); font-weight: var(--font-weight-semibold); }
.message.success { color: #2e7d32; }
.message.error { color: var(--accent); }
</style>


