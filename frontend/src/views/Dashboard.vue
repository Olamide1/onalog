<template>
  <div class="dashboard">
    <!-- Header - Stella band style -->
    <header class="dashboard-header horizontal-band">
      <div class="container">
        <div class="header-content">
          <h1>Onalog</h1>
          <div class="header-actions">
            <span class="user-name">{{ authStore.user?.name || 'User' }}</span>
            <span v-if="authStore.user?.role === 'admin'" class="admin-badge">Admin</span>
            <button
              v-if="authStore.user?.role === 'admin'"
              @click="showSettings = !showSettings"
              class="btn"
            >
              Settings
            </button>
            <button @click="handleLogout" class="btn">Logout</button>
          </div>
        </div>
      </div>
    </header>
    
    <!-- Company Settings Panel -->
    <div v-if="showSettings && authStore.user?.role === 'admin'" class="settings-panel geometric-block">
      <CompanySettings />
    </div>

    <!-- Search Section - Wide rectangular band -->
    <section class="search-section horizontal-band">
      <div class="container">
        <SearchForm @search="handleSearch" />
      </div>
    </section>

    <!-- Main Content -->
    <div class="container main-content">
      <!-- Loading State -->
      <div v-if="leadsStore.loading && !leadsStore.currentSearch" class="loading-state">
        <div class="loading-tile" v-for="i in 3" :key="i">
          <div class="loading-bar"></div>
        </div>
      </div>

      <!-- Search Status -->
      <div v-if="leadsStore.currentSearch" class="search-status geometric-block">
        <div class="status-header">
          <h3>{{ leadsStore.currentSearch.query }}</h3>
          <span class="status-badge" :class="leadsStore.currentSearch.status">
            {{ leadsStore.currentSearch.status }}
          </span>
        </div>
        <div class="status-stats">
          <div>Total: {{ leadsStore.currentSearch.totalResults || 0 }}</div>
          <div>Extracted: {{ leadsStore.currentSearch.extractedCount || 0 }}</div>
          <div>Enriched: {{ leadsStore.enrichedCount }}</div>
        </div>
        <div v-if="leadsStore.currentSearch.status === 'processing'" class="progress-indicator">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Lead List -->
      <LeadList 
        v-if="leadsStore.filteredLeads.length > 0"
        :leads="leadsStore.filteredLeads"
        @select-lead="openLeadDetail"
        @export="handleExport"
      />

      <!-- Empty State -->
      <div v-if="!leadsStore.loading && leadsStore.filteredLeads.length === 0 && !leadsStore.currentSearch" class="empty-state geometric-block">
        <h2>Start a search to discover leads</h2>
        <p>Enter a business query above to begin</p>
      </div>
    </div>

    <!-- Lead Detail Panel -->
    <LeadDetailPanel
      v-if="selectedLead"
      :lead="selectedLead"
      :search-query="leadsStore.currentSearch?.query"
      @close="closeLeadDetail"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLeadsStore } from '../stores/leads';
import { useAuthStore } from '../stores/auth';
import SearchForm from '../components/SearchForm.vue';
import LeadList from '../components/LeadList.vue';
import LeadDetailPanel from '../components/LeadDetailPanel.vue';
import CompanySettings from '../components/CompanySettings.vue';

const router = useRouter();
const leadsStore = useLeadsStore();
const authStore = useAuthStore();
const selectedLead = ref(null);
const searchFormRef = ref(null);
const showSettings = ref(false);
let pollInterval = null;

// Check auth on mount
onMounted(() => {
  authStore.initAuth();
  if (!authStore.isAuthenticated) {
    router.push('/login');
  }
});

const progressPercent = computed(() => {
  if (!leadsStore.currentSearch) return 0;
  const total = leadsStore.currentSearch.totalResults || 1;
  const extracted = leadsStore.currentSearch.extractedCount || 0;
  return Math.min((extracted / total) * 100, 95);
});

async function handleSearch(searchData) {
  try {
    const search = await leadsStore.createSearch(
      searchData.query,
      searchData.country,
      searchData.location,
      searchData.resultCount
    );
    
    // Pass searchId to SearchForm for template saving
    if (searchFormRef.value) {
      searchFormRef.value.setSearchId(search.searchId);
    }
    
    // Start polling for updates
    startPolling(search.searchId);
  } catch (error) {
    console.error('Search error:', error);
  }
}

function startPolling(searchId) {
  if (pollInterval) clearInterval(pollInterval);
  
  pollInterval = setInterval(async () => {
    try {
      const data = await leadsStore.fetchSearch(searchId);
      
      // Stop polling if completed or failed
      if (data.search.status === 'completed' || data.search.status === 'failed') {
        stopPolling();
      }
    } catch (error) {
      console.error('Polling error:', error);
      stopPolling();
    }
  }, 2000); // Poll every 2 seconds
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function openLeadDetail(lead) {
  try {
    const detail = await leadsStore.fetchLeadDetail(lead._id);
    selectedLead.value = detail;
  } catch (error) {
    console.error('Error fetching lead detail:', error);
  }
}

function closeLeadDetail() {
  selectedLead.value = null;
}

function handleExport(format) {
  const searchId = leadsStore.currentSearch?._id;
  const url = `/api/export/${format}${searchId ? `?searchId=${searchId}` : ''}`;
  window.open(url, '_blank');
}

function handleLogout() {
  authStore.clearUser();
  router.push('/');
}

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: var(--neutral-1);
}

.dashboard-header {
  margin-bottom: var(--spacing-lg);
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: var(--spacing-xl);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.user-name {
  font-weight: var(--font-weight-semibold);
}

.admin-badge {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: var(--border-medium) solid var(--accent);
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.settings-panel {
  margin: var(--spacing-lg) auto;
  max-width: 800px;
}

.search-section {
  margin-bottom: var(--spacing-xl);
}

.main-content {
  padding-top: var(--spacing-lg);
}

.loading-state {
  margin-top: var(--spacing-xl);
}

.loading-tile {
  margin-bottom: var(--spacing-md);
}

.loading-bar {
  height: 20px;
  background: var(--neutral-1);
  border: var(--border-thin) solid var(--neutral-2);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.search-status {
  margin-bottom: var(--spacing-lg);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.status-badge {
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  font-size: 0.875rem;
}

.status-badge.completed {
  border-color: var(--accent);
  color: var(--accent);
}

.status-stats {
  display: flex;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  font-weight: var(--font-weight-semibold);
}

.progress-indicator {
  margin-top: var(--spacing-md);
}

.progress-bar {
  height: 8px;
  background: var(--neutral-1);
  border: var(--border-thin) solid var(--neutral-2);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s linear;
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xxl);
  margin-top: var(--spacing-xl);
}

.empty-state h2 {
  margin-bottom: var(--spacing-md);
}
</style>

