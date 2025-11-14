<template>
  <div class="dashboard">
    <!-- Header - Stella band style -->
    <header class="dashboard-header horizontal-band">
      <div class="container">
        <div class="header-content">
          <div class="header-left">
            <h1>Onalog</h1>
            <div v-if="dashboardStats?.company" class="company-info">
              <span class="company-name">{{ dashboardStats.company.name }}</span>
              <span v-if="dashboardStats.company.memberCount > 1" class="member-count">
                {{ dashboardStats.company.memberCount }} members
              </span>
            </div>
          </div>
          <div class="header-actions">
            <span class="user-name">{{ authStore.user?.name || 'User' }}</span>
            <span v-if="authStore.user?.role === 'admin'" class="admin-badge">Admin</span>
            <router-link
              to="/settings"
              class="btn"
            >
              Settings
            </router-link>
            <button @click="handleLogout" class="btn">Logout</button>
          </div>
        </div>
      </div>
    </header>
    

    <!-- Search Section - Wide rectangular band -->
    <section class="search-section horizontal-band">
      <div class="container">
        <SearchForm ref="searchFormRef" @search="handleSearch" />
      </div>
    </section>

    <!-- Main Content -->
    <div class="container main-content">
      <!-- Dashboard Overview (when no active search) -->
      <div v-if="!leadsStore.currentSearch" class="dashboard-overview">
        <!-- Stats Cards -->
        <DashboardStats v-if="dashboardStats" :stats="dashboardStats" />
        
        <!-- Recent Searches -->
        <RecentSearches
          :searches="dashboardStats?.searches?.recent || []"
          :loading="loadingStats"
          @select-search="loadSearch"
          @view-all="viewAllSearches"
        />
      </div>

      <!-- Active Search Status -->
      <div v-if="leadsStore.currentSearch" class="search-status geometric-block">
        <div class="status-header">
          <h3>{{ leadsStore.currentSearch.query }}</h3>
          <span class="status-badge" :class="leadsStore.currentSearch.status">
            {{ leadsStore.currentSearch.status }}
          </span>
        </div>
        <div class="status-stats">
          <div class="stat-item">
            <span class="stat-label">Total:</span>
            <span class="stat-value">{{ leadsStore.currentSearch.totalResults || 0 }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Extracted:</span>
            <span class="stat-value">{{ leadsStore.currentSearch.extractedCount || 0 }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Enriched:</span>
            <span class="stat-value">{{ leadsStore.enrichedCount }}</span>
          </div>
        </div>
        <div v-if="leadsStore.currentSearch.status === 'processing'" class="progress-indicator">
          <div class="progress-label">
            Processing leads... {{ leadsStore.currentSearch.extractedCount || 0 }} / {{ leadsStore.currentSearch.totalResults || 0 }}
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
        <button @click="clearSearch" class="btn" style="margin-top: var(--spacing-md);">
          Start New Search
        </button>
      </div>

      <!-- Loading State - When processing but no leads yet -->
      <div v-if="leadsStore.currentSearch && leadsStore.currentSearch.status === 'processing' && leadsStore.filteredLeads.length === 0" class="loading-leads geometric-block">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <h3>Discovering Leads...</h3>
          <p>We're searching and extracting business information. This may take a moment.</p>
          <div class="loading-stats">
            <div>Found: {{ leadsStore.currentSearch.totalResults || 0 }} results</div>
            <div>Extracted: {{ leadsStore.currentSearch.extractedCount || 0 }} leads</div>
          </div>
        </div>
      </div>

      <!-- Lead List -->
      <LeadList 
        v-if="leadsStore.filteredLeads.length > 0"
        :leads="leadsStore.filteredLeads"
        :is-processing="leadsStore.currentSearch?.status === 'processing'"
        @select-lead="openLeadDetail"
        @export="handleExport"
      />

      <!-- Empty State - No Search -->
      <div v-if="!leadsStore.loading && leadsStore.filteredLeads.length === 0 && !leadsStore.currentSearch && !loadingStats" class="empty-state geometric-block">
        <h2>Start a search to discover leads</h2>
        <p>Enter a business query above to begin</p>
      </div>

      <!-- Empty State - Search Completed with 0 Results -->
      <div v-if="leadsStore.currentSearch && leadsStore.currentSearch.status === 'completed' && leadsStore.filteredLeads.length === 0 && !leadsStore.loading" class="empty-state geometric-block">
        <h2>No Results Found</h2>
        <p>Your search for "{{ leadsStore.currentSearch.query }}" returned 0 results.</p>
        <p class="empty-hint">Try adjusting your search query or filters and search again.</p>
        <button @click="clearSearch" class="btn btn-accent" style="margin-top: var(--spacing-md);">
          Start New Search
        </button>
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
import DashboardStats from '../components/DashboardStats.vue';
import RecentSearches from '../components/RecentSearches.vue';
import api from '../services/api';

const router = useRouter();
const leadsStore = useLeadsStore();
const authStore = useAuthStore();
const selectedLead = ref(null);
const searchFormRef = ref(null);
const dashboardStats = ref(null);
const loadingStats = ref(false);
let pollInterval = null;
let statsInterval = null;

// Check auth on mount
onMounted(async () => {
  authStore.initAuth();
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  
  // Load dashboard stats
  await loadDashboardStats();
  
  // Refresh stats every 30 seconds
  statsInterval = setInterval(loadDashboardStats, 30000);
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
    if (searchFormRef.value && search.searchId) {
      searchFormRef.value.setSearchId(search.searchId);
    }
    
    // Start polling for updates
    if (search.searchId) {
      startPolling(search.searchId);
    }
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

async function loadDashboardStats() {
  if (!authStore.isAuthenticated) return;
  
  loadingStats.value = true;
  try {
    const response = await api.get('/company/stats');
    dashboardStats.value = response.data;
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  } finally {
    loadingStats.value = false;
  }
}

async function loadSearch(search) {
  try {
    const data = await leadsStore.fetchSearch(search._id);
    startPolling(search._id);
  } catch (error) {
    console.error('Error loading search:', error);
  }
}

function viewAllSearches() {
  // Could navigate to a searches page or show all in a modal
  // For now, just scroll to search form
  document.querySelector('.search-section')?.scrollIntoView({ behavior: 'smooth' });
}

function clearSearch() {
  leadsStore.currentSearch = null;
  leadsStore.leads = [];
  stopPolling();
  // Refresh stats
  loadDashboardStats();
}

function handleLogout() {
  authStore.clearUser();
  router.push('/');
}

onUnmounted(() => {
  stopPolling();
  if (statsInterval) {
    clearInterval(statsInterval);
  }
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

.header-left {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.company-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 0.875rem;
}

.company-name {
  font-weight: var(--font-weight-semibold);
  color: var(--neutral-2);
}

.member-count {
  color: #666;
  font-size: 0.8125rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.user-name {
  font-weight: var(--font-weight-semibold);
}

.header-actions .btn {
  text-decoration: none;
  display: inline-block;
}

.admin-badge {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: var(--border-medium) solid var(--accent);
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}


.search-section {
  margin-bottom: var(--spacing-xl);
}

.main-content {
  padding-top: var(--spacing-lg);
}

.dashboard-overview {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
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
  margin-top: var(--spacing-md);
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.stat-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--neutral-3);
}

.stat-value {
  font-size: 1.25rem;
  font-weight: var(--font-weight-bold);
  color: var(--accent-color);
}

.progress-label {
  font-size: 0.875rem;
  margin-bottom: var(--spacing-sm);
  color: var(--neutral-3);
}

.loading-leads {
  padding: var(--spacing-xl);
  text-align: center;
  margin-top: var(--spacing-lg);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--neutral-2);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-stats {
  display: flex;
  gap: var(--spacing-lg);
  margin-top: var(--spacing-sm);
  font-size: 0.875rem;
  color: var(--neutral-3);
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

