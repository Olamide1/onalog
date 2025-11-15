<template>
  <div class="recent-searches geometric-block">
    <div class="section-header">
      <h3>Recent Searches</h3>
      <button 
        v-if="searches.length > 0"
        @click="$emit('view-all')" 
        class="btn-link"
      >
        View All
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-bar"></div>
    </div>

    <div v-else-if="searches.length === 0" class="empty-state">
      <div class="empty-icon">—</div>
      <p>No searches yet</p>
      <p class="empty-hint">Start a search to see results here</p>
    </div>

    <div v-else class="searches-list">
      <div
        v-for="search in items"
        :key="search._id"
        class="search-item geometric-block-thin"
        :class="{ deleting: deletingId === search._id }"
        @click="$emit('select-search', search)"
      >
        <div class="search-content">
          <div class="search-query">{{ search.query }}</div>
          <div class="search-meta">
            <span v-if="search.location" class="meta-item">{{ search.location }}</span>
            <span v-if="search.country" class="meta-item">{{ formatCountry(search.country) }}</span>
            <span class="meta-item">{{ formatDate(search.createdAt) }}</span>
          </div>
        </div>
        <div class="search-stats">
          <div class="stat-item">
            <span class="stat-number">{{ search.totalResults || 0 }}</span>
            <span class="stat-label">Results</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{ search.enrichedCount || 0 }}</span>
            <span class="stat-label">Enriched</span>
          </div>
        </div>
        <div class="search-status">
          <span class="status-badge" :class="search.status">
            {{ formatStatus(search.status) }}
          </span>
          <div v-if="isProcessing(search.status)" class="processing-indicator">
            <div class="spinner"></div>
          </div>
          <button class="btn-link small danger" @click.stop="onDelete(search)" :disabled="deletingId === search._id">
            {{ deletingId === search._id ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../services/api';

const props = defineProps({
  searches: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select-search', 'view-all','deleted']);

// Local copy for optimistic UI updates
const items = ref([...props.searches]);
const deletingId = ref(null);

watch(() => props.searches, (v) => {
  items.value = [...(v || [])];
}, { immediate: true, deep: true });

function formatCountry(code) {
  const countries = {
    'ng': 'Nigeria',
    'za': 'South Africa',
    'ke': 'Kenya',
    'gh': 'Ghana',
    'ug': 'Uganda',
    'tz': 'Tanzania'
  };
  return countries[code] || code;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return d.toLocaleDateString();
}

function formatStatus(status) {
  if (!status) return 'unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function isProcessing(status) {
  return status === 'processing' || status === 'queued' || status === 'searching' || status === 'extracting' || status === 'enriching';
}

async function onDelete(search) {
  if (!confirm(`Delete search "${search.query}"?`)) return;
  try {
    deletingId.value = search._id;
    await api.delete(`/search/${search._id}`);
    // Optimistically remove from local list
    items.value = items.value.filter(s => s._id !== search._id);
    emit('deleted', search._id); // parent can refresh if desired
  } catch (e) {
    alert(e.response?.data?.error || 'Failed to delete search');
  } finally {
    deletingId.value = null;
  }
}
</script>

<style scoped>
.recent-searches {
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: var(--border-thick) solid var(--neutral-2);
}

.section-header h3 {
  font-size: 1.25rem;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-link {
  background: none;
  border: none;
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.875rem;
  padding: 0;
}

.btn-link:hover {
  color: var(--neutral-2);
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

.empty-state {
  text-align: center;
  padding: var(--spacing-xxl);
  border: var(--border-medium) dashed var(--neutral-2);
}

.empty-icon {
  font-size: 3rem;
  font-weight: var(--font-weight-bold);
  color: var(--neutral-2);
  margin-bottom: var(--spacing-md);
  line-height: 1;
}

.empty-state p {
  color: #666;
  margin-bottom: var(--spacing-xs);
}

.empty-hint {
  font-size: 0.875rem;
  color: #999;
  margin-top: var(--spacing-sm);
}

.searches-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.search-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  cursor: pointer;
  transition: all 0.2s linear;
}

.search-item:hover {
  border-color: var(--accent);
  background: var(--neutral-1);
}
.search-item.deleting {
  opacity: 0.5;
  pointer-events: none;
}

.search-content {
  flex: 1;
  min-width: 0;
}

.search-query {
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-xs);
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-meta {
  display: flex;
  gap: var(--spacing-xs);
  font-size: 0.875rem;
  color: #666;
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
}

.meta-item:not(:last-child)::after {
  content: '•';
  margin-left: var(--spacing-xs);
  color: #999;
}

.search-stats {
  display: flex;
  gap: var(--spacing-md);
  margin-right: var(--spacing-md);
}

.stat-item {
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 1.25rem;
  font-weight: var(--font-weight-bold);
  color: var(--neutral-2);
  line-height: 1;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: var(--spacing-xs);
}

.search-status {
  flex-shrink: 0;
}

.status-badge {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: var(--border-medium) solid var(--neutral-2);
  font-size: 0.75rem;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.btn-link.small.danger {
  margin-left: var(--spacing-sm);
  color: #d32f2f;
  text-decoration: none;
}
.btn-link.small.danger:hover { text-decoration: underline; }

.status-badge.completed {
  border-color: var(--accent);
  color: var(--accent);
}

.status-badge.processing,
.status-badge.queued,
.status-badge.searching,
.status-badge.extracting,
.status-badge.enriching {
  border-color: #ffa500;
  color: #ffa500;
}

.status-badge.failed {
  border-color: #ff4444;
  color: #ff4444;
}

.processing-indicator {
  display: inline-flex;
  align-items: center;
  margin-left: var(--spacing-sm);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--neutral-2);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .search-item {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .search-stats {
    width: 100%;
    justify-content: space-around;
    margin-right: 0;
    margin-top: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: var(--border-thin) solid var(--neutral-2);
  }
}
</style>

