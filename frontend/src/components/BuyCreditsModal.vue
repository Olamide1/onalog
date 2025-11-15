<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Buy Credits</h3>
        <button class="btn-link" @click="$emit('close')">Close</button>
      </div>
      <div class="modal-body">
        <div class="usage-row" v-if="usage">
          <div class="usage-item"><strong>Balance:</strong> {{ usage.balance ?? 0 }}</div>
          <div class="usage-item"><strong>Currency:</strong> {{ (usage.currency || 'usd').toUpperCase() }}</div>
          <div class="usage-item"><strong>Provider:</strong> mock (dev)</div>
        </div>
        <p class="hint">Credits apply immediately in mock mode.</p>
        <div class="packs">
          <div
            v-for="p in packs"
            :key="p.id"
            class="pack"
          >
            <div class="pack-title">{{ p.credits }} credits</div>
            <div class="pack-price">\${{ p.price.usd }} | ₦{{ p.price.ngn.toLocaleString() }}</div>
            <button class="btn" :disabled="loading" @click="buy(p.id)">
              {{ loading ? 'Processing...' : 'Buy' }}
            </button>
          </div>
        </div>
        <div v-if="message" class="message">{{ message }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../services/api';

defineEmits(['close','updated']);

const packs = ref([]);
const loading = ref(false);
const message = ref('');
const usage = ref(null);
const defaultPacks = [
  { id: 'pack_100', credits: 100, price: { usd: 29, ngn: 29000 } },
  { id: 'pack_500', credits: 500, price: { usd: 129, ngn: 129000 } },
  { id: 'pack_2000', credits: 2000, price: { usd: 399, ngn: 399000 } }
];

async function load() {
  try {
    const res = await api.get('/billing/usage');
    usage.value = {
      balance: res.data?.balance ?? 0,
      currency: res.data?.currency || 'usd'
    };
    packs.value = (res.data?.packs && res.data.packs.length ? res.data.packs : defaultPacks);
  } catch (e) {
    usage.value = null;
    packs.value = defaultPacks;
  }
}

async function buy(packId) {
  try {
    loading.value = true;
    message.value = '';
    await api.post('/billing/purchase-intent', { packId });
    message.value = 'Credits added successfully.';
    // notify parent to refresh balance
    setTimeout(() => {
      message.value = '';
      // parent can refresh usage
      // and we close the modal
      emit('updated');
      emit('close');
    }, 800);
  } catch (e) {
    message.value = e.response?.data?.error || 'Failed to purchase.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
}
.modal {
  width: 560px;
  max-width: 90%;
  background: #ffffff;
  border: var(--border-medium) solid var(--neutral-3);
  box-shadow: 0 12px 40px rgba(0,0,0,0.35);
  position: relative;
  z-index: 100000;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: var(--border-medium) solid var(--neutral-2);
}
.modal-body {
  padding: var(--spacing-lg);
}
.usage-row {
  display: flex;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-sm);
}
.usage-item { font-size: 0.95rem; }
.packs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}
@media (max-width: 720px) {
  .packs { grid-template-columns: 1fr; }
}
.pack {
  border: var(--border-medium) solid var(--neutral-2);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  background: var(--neutral-0);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.pack-title {
  font-weight: var(--font-weight-bold);
  font-size: 1.05rem;
}
.pack-price {
  color: #444;
}
.hint { color:#555; }
.message { margin-top: var(--spacing-md); color: #2e7d32; font-weight: var(--font-weight-semibold); }
</style>


