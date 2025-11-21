<template>
  <div class="dashboard">
    <!-- Header - Stella band style -->
    <header class="dashboard-header horizontal-band">
      <div class="container">
        <div class="header-content">
          <div class="header-left">
            <h1>coralgen</h1>
            <div v-if="dashboardStats?.company" class="company-info">
              <span class="company-name">{{ dashboardStats.company.name }}</span>
              <span v-if="dashboardStats.company.memberCount > 1" class="member-count">
                {{ dashboardStats.company.memberCount }} members
              </span>
            </div>
          </div>
          <div class="header-actions">
            <CreditPill :balance="creditBalance" @open-buy="showBuyModal = true" />
            <button class="btn btn-outline" @click="viewAllSearches" style="margin-right: var(--spacing-sm);">
              View All Searches
            </button>
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
        <div v-if="creditBalance !== null && creditBalance <= 0" class="credit-banner danger geometric-block">
          <strong>No credits:</strong> extraction is visible but enrichment is paused. Click “Buy Credits” to continue.
        </div>
        <div v-else-if="creditBalance !== null && creditBalance < 10" class="credit-banner warn geometric-block">
          <strong>Low credits:</strong> enrichment may pause soon. Consider buying more credits.
        </div>
        <div v-if="leadsStore.currentSearch?.previewLimited" class="credit-banner warn geometric-block">
          Showing first {{ leadsStore.currentSearch.previewLimit }} results. Buy credits to see all.
        </div>
        <div v-if="leadsStore.activeBackgroundSearches.length > 0" class="background-searches-banner geometric-block">
          <strong>{{ leadsStore.activeBackgroundSearches.length }} search{{ leadsStore.activeBackgroundSearches.length > 1 ? 'es' : '' }} processing in background</strong>
          <span class="banner-hint">Check "Recent Searches" for updates</span>
        </div>
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
          @deleted="onRecentDeleted"
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
        <div v-if="leadsStore.currentSearch.status === 'processing' || leadsStore.currentSearch.status === 'queued' || leadsStore.currentSearch.status === 'searching' || leadsStore.currentSearch.status === 'extracting' || leadsStore.currentSearch.status === 'enriching'" class="progress-indicator">
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
      <div v-if="leadsStore.currentSearch && leadsStore.currentSearch.status !== 'completed'" class="loading-leads geometric-block">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <h3 v-if="progressPercent < 33">Finding results…</h3>
          <h3 v-else-if="progressPercent < 66">Extracting websites…</h3>
          <h3 v-else>Enriching contacts…</h3>
          <div class="loading-stats">
            <div>Found: {{ leadsStore.currentSearch.totalResults || 0 }}</div>
            <div>Extracted: {{ leadsStore.currentSearch.extractedCount || 0 }}</div>
            <div>Progress: {{ Math.floor(progressPercent) }}%</div>
          </div>
          <div v-if="leadsStore.currentSearch?.providers" class="loading-stats">
            <div>Overpass: {{ leadsStore.currentSearch.providers.overpass || 0 }}</div>
            <div>OSM: {{ leadsStore.currentSearch.providers.osm || 0 }}</div>
            <div>SearxNG: {{ leadsStore.currentSearch.providers.searxng || 0 }}</div>
            <div v-if="leadsStore.currentSearch.providers.bing">Bing: {{ leadsStore.currentSearch.providers.bing }}</div>
            <div v-if="leadsStore.currentSearch.providers.ddg">DDG: {{ leadsStore.currentSearch.providers.ddg }}</div>
          </div>
          <div v-if="leadsStore.currentSearch?.reasonShortfall" class="loading-stats">
            <div>Why fewer results: {{ leadsStore.currentSearch.reasonShortfall }}</div>
          </div>
          <div class="skeleton-list">
            <div v-for="i in 5" :key="i" class="skeleton-row">
              <div class="skeleton-bar" style="width: 40%"></div>
              <div class="skeleton-bar" style="width: 20%"></div>
              <div class="skeleton-bar" style="width: 15%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Lead List -->
      <div v-if="leadsStore.currentSearch?.status === 'completed' && leadsStore.filteredLeads.length > 0" class="fill-banner">
        <span v-if="leadsStore.filteredLeads.length < Math.min(30, leadsStore.currentSearch?.resultCount || 50)">Filling more results in background…</span>
      </div>
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
  
  <BuyCreditsModal v-if="showBuyModal" @close="showBuyModal = false" @updated="refreshCredits" />
  
  <!-- Completion Notifications -->
  <div v-if="completedNotifications.length > 0" class="completion-notifications">
    <div
      v-for="notif in completedNotifications"
      :key="notif.id"
      class="completion-notification"
      :class="notif.success ? 'success' : 'failed'"
      @click="notif.success && notif.searchId ? loadSearch({ _id: notif.searchId }) : null"
      :style="notif.success ? { cursor: 'pointer' } : {}"
    >
      <strong>{{ notif.success ? '✓' : '✗' }} Search {{ notif.success ? 'Complete' : 'Failed' }}:</strong> "{{ notif.search }}"
      <span v-if="notif.success && notif.totalResults > 0" class="notification-details">
        ({{ notif.enrichedCount || 0 }}/{{ notif.totalResults }} enriched) — Ready for export
      </span>
      <span v-else-if="!notif.success && notif.totalResults > 0" class="notification-details">
        — Click to view partial results ({{ notif.totalResults }} found)
      </span>
      <span v-else-if="!notif.success" class="notification-details">
        — No results found. Try adjusting your search query or check API keys (Bing recommended for digital businesses)
      </span>
    </div>
  </div>
      
      <!-- View All Searches Modal -->
      <div v-if="showAllSearches" class="modal-backdrop" @click.self="closeAllSearches">
        <div class="modal geometric-block">
          <div class="modal-header">
            <h3>All Searches</h3>
            <button class="btn-link" @click="closeAllSearches">Close</button>
          </div>
          <RecentSearches
            :searches="allSearches"
            :loading="loadingAll"
            @select-search="selectFromAll"
            @deleted="onRecentDeleted"
          />
        </div>
      </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLeadsStore } from '../stores/leads';
import { useAuthStore } from '../stores/auth';
import SearchForm from '../components/SearchForm.vue';
import LeadList from '../components/LeadList.vue';
import LeadDetailPanel from '../components/LeadDetailPanel.vue';
import DashboardStats from '../components/DashboardStats.vue';
import RecentSearches from '../components/RecentSearches.vue';
import CreditPill from '../components/CreditPill.vue';
import BuyCreditsModal from '../components/BuyCreditsModal.vue';
import api from '../services/api';

const router = useRouter();
const leadsStore = useLeadsStore();
const authStore = useAuthStore();
const selectedLead = ref(null);
const searchFormRef = ref(null);
const dashboardStats = ref(null);
const loadingStats = ref(false);
const showAllSearches = ref(false);
const loadingAll = ref(false);
const allSearches = ref([]);
let pollInterval = null;
let backgroundPollInterval = null;
let statsInterval = null;
let recentSearchesInterval = null;
const showBuyModal = ref(false);
const creditBalance = ref(null);
const completedNotifications = ref([]);

// Check auth on mount
onMounted(async () => {
  // Ensure auth is initialized before we decide on navigation or data loads
  await authStore.initAuth();
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  
  // Load dashboard stats
  await loadDashboardStats();
  // Load credits (safe if billing disabled)
  refreshCredits();
  // Ensure body scroll locked when modal opens
  watch(showBuyModal, (v) => {
    if (v) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  });
  
  // Refresh stats every 30 seconds
  statsInterval = setInterval(loadDashboardStats, 30000);
  
  // Poll recent searches every 10 seconds for real-time updates
  startRecentSearchesPolling();
  
  // Start background polling if there are active background searches
  if (leadsStore.activeBackgroundSearches.length > 0) {
    startBackgroundPolling();
  }
});

onUnmounted(() => {
  stopPolling();
  stopBackgroundPolling();
  stopRecentSearchesPolling();
  if (statsInterval) clearInterval(statsInterval);
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
      searchData.industry,
      searchData.resultCount
    );
    
    // Pass searchId to SearchForm for template saving
    if (searchFormRef.value && search.searchId) {
      searchFormRef.value.setSearchId(search.searchId);
    }
    
    // Start polling for updates
    if (search.searchId) {
      startPolling(search.searchId);
      // Start background polling if not already running
      if (!backgroundPollInterval) {
        startBackgroundPolling();
      }
      // Prime UI immediately (don't wait 2s for first tick)
      await leadsStore.fetchSearch(search.searchId);
    }
  } catch (error) {
    console.error('Search error:', error);
  }
}

function startPolling(searchId) {
  if (pollInterval) clearInterval(pollInterval);
  let failedFetchCount = 0;
  
  pollInterval = setInterval(async () => {
    try {
      const data = await leadsStore.fetchSearch(searchId);
      const requested = data?.search?.resultCount || 50;
      const have = (leadsStore.filteredLeads || []).length;
      const status = (data?.search?.status || '').toLowerCase();
      const searchData = data?.search;
      
      // Refresh credits after each fetch (in case enrichment completed)
      refreshCredits();
      
      // If search just completed, show notification
      if (status === 'completed' && searchData) {
        const wasProcessing = leadsStore.currentSearch?.status === 'searching' || 
                             leadsStore.currentSearch?.status === 'extracting' || 
                             leadsStore.currentSearch?.status === 'enriching';
        if (wasProcessing) {
          // Only show notification if it was processing before (avoid duplicate notifications)
          showCompletionNotification(searchData, true);
        }
      }
      
      // If failed, fetch one more time to get partial results, then stop
      if (status === 'failed') {
        failedFetchCount++;
        if (failedFetchCount >= 2) {
          // Fetched twice after failure - stop polling but keep showing results
          // Show notification for failed search (with or without partial results)
          if (searchData) {
            showCompletionNotification(searchData, false);
          }
          stopPolling();
          return;
        }
        // Continue one more time to get any partial results
      }
      
      // Keep polling while not failed and either not completed yet, or completed but list is short
      // Also continue polling for queued/searching/extracting/enriching statuses
      // Continue polling if completed but we have fewer leads than totalResults (background fill still happening)
      const totalResults = searchData?.totalResults || 0;
      const extractedCount = searchData?.extractedCount || 0;
      const isBackgroundFilling = status === 'completed' && (have < totalResults || extractedCount > have);
      
      const shouldKeepPolling =
        status !== 'failed' && (
          status === 'queued' ||
          status === 'searching' ||
          status === 'extracting' ||
          status === 'enriching' ||
          status === 'processing' ||
          isBackgroundFilling
        );
      if (!shouldKeepPolling && status !== 'failed') stopPolling();
    } catch (error) {
      console.error('Polling error:', error);
      // Don't stop immediately on error - might be transient
      failedFetchCount++;
      if (failedFetchCount >= 3) {
        stopPolling();
      }
    }
  }, 2000); // Poll every 2 seconds
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function startBackgroundPolling() {
  if (backgroundPollInterval) clearInterval(backgroundPollInterval);
  
  backgroundPollInterval = setInterval(async () => {
    const active = leadsStore.activeBackgroundSearches;
    if (active.length === 0) {
      stopBackgroundPolling();
      return;
    }
    
    // Poll each background search (less frequently - every 5s)
    for (const search of active) {
      try {
        const searchId = search._id || search.searchId;
        const data = await leadsStore.fetchSearch(searchId, true);
        const status = (data?.search?.status || '').toLowerCase();
        
        // If search completed or failed, show notification and remove from background
        if (status === 'completed' || status === 'failed') {
          // Use fresh data from fetch for accurate counts
          const searchData = data?.search || search;
          showCompletionNotification(searchData, status === 'completed');
          leadsStore.removeBackgroundSearch(searchId);
        }
      } catch (error) {
        console.error('Background polling error:', error);
      }
    }
  }, 5000); // Poll every 5 seconds for background searches
}

function stopBackgroundPolling() {
  if (backgroundPollInterval) {
    clearInterval(backgroundPollInterval);
    backgroundPollInterval = null;
  }
}

function startRecentSearchesPolling() {
  if (recentSearchesInterval) clearInterval(recentSearchesInterval);
  
  recentSearchesInterval = setInterval(async () => {
    try {
      // Refresh dashboard stats to update recent searches
      await loadDashboardStats();
    } catch (error) {
      console.error('Recent searches polling error:', error);
    }
  }, 10000); // Poll every 10 seconds for real-time updates
}

function stopRecentSearchesPolling() {
  if (recentSearchesInterval) {
    clearInterval(recentSearchesInterval);
    recentSearchesInterval = null;
  }
}

function showCompletionNotification(search, success) {
  const notification = {
    id: Date.now(),
    search: search.query,
    success,
    searchId: search._id || search.searchId,
    totalResults: search.totalResults || 0,
    enrichedCount: search.enrichedCount || 0,
    timestamp: new Date()
  };
  completedNotifications.value.push(notification);
  
  // Auto-remove after 10 seconds (longer for export-ready notification)
  setTimeout(() => {
    completedNotifications.value = completedNotifications.value.filter(n => n.id !== notification.id);
  }, 10000);
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

function onRecentDeleted(id) {
  // Optimistically remove from dashboard stats list
  if (dashboardStats.value?.searches?.recent) {
    dashboardStats.value.searches.recent = dashboardStats.value.searches.recent.filter(s => s._id !== id);
  }
  // If modal list open, remove there too
  if (allSearches.value && allSearches.value.length) {
    allSearches.value = allSearches.value.filter(s => s._id !== id);
  }
  // Refresh stats counts asynchronously
  loadDashboardStats();
}
async function loadSearch(search) {
  try {
    // Switch to this search (moves current to background if needed)
    leadsStore.switchToSearch(search);
    
    // Fetch fresh data
    const data = await leadsStore.fetchSearch(search._id);
    
    // If the selected search is still processing, start polling; otherwise stop
    const status = data?.search?.status || search.status;
    if (status === 'processing' || status === 'queued' || status === 'searching' || status === 'extracting' || status === 'enriching') {
      startPolling(search._id);
    } else {
      stopPolling();
    }
    
    // Ensure background polling is running
    if (!backgroundPollInterval && leadsStore.activeBackgroundSearches.length > 0) {
      startBackgroundPolling();
    }
  } catch (error) {
    console.error('Error loading search:', error);
  }
}

function viewAllSearches() {
  showAllSearches.value = true;
  loadAllSearches();
  document.body.style.overflow = 'hidden';
}

async function refreshCredits() {
  try {
    const res = await api.get('/billing/usage');
    creditBalance.value = res.data?.balance ?? null;
  } catch {
    creditBalance.value = null;
  }
}

async function loadAllSearches() {
  loadingAll.value = true;
  try {
    const res = await api.get('/search', { params: { limit: 200 } });
    allSearches.value = res.data.searches || [];
  } catch (e) {
    console.error('Error loading all searches:', e);
  } finally {
    loadingAll.value = false;
  }
}

function closeAllSearches() {
  showAllSearches.value = false;
  document.body.style.overflow = '';
}

async function selectFromAll(search) {
  showAllSearches.value = false;
  document.body.style.overflow = '';
  await loadSearch(search);
  // Scroll to top to show the selected search header and lead list
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
.credit-banner {
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  background: var(--neutral-1);
}
.credit-banner.warn {
  border-color: #e6a700;
}
.credit-banner.danger {
  border-color: #d32f2f;
}

.background-searches-banner {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
  background: #e3f2fd;
  border-color: #2196f3;
  color: #1565c0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.background-searches-banner .banner-hint {
  font-size: 0.875rem;
  opacity: 0.8;
}

/* Completion Notifications */
.completion-notifications {
  position: fixed;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  max-width: 400px;
}

.completion-notification {
  padding: var(--spacing-md);
  background: white;
  border: var(--border-medium) solid var(--neutral-2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  animation: slideIn 0.3s ease-out;
}

.completion-notification.success {
  border-color: #4caf50;
  background: #e8f5e9;
}

.completion-notification.failed {
  border-color: #f44336;
  background: #ffebee;
}

.completion-notification .notification-details {
  display: block;
  margin-top: var(--spacing-xs);
  font-size: 0.875rem;
  color: var(--neutral-3);
  font-weight: normal;
}

.completion-notification.success .notification-details {
  color: #2e7d32;
}

.completion-notification.failed .notification-details {
  color: #c62828;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
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

.skeleton-list {
  margin-top: var(--spacing-lg);
  display: grid;
  gap: var(--spacing-sm);
}

.skeleton-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--spacing-md);
}

.skeleton-bar {
  height: 12px;
  background: var(--neutral-1);
  border: var(--border-thin) solid var(--neutral-2);
  animation: pulse 1.4s ease-in-out infinite;
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

/* Full-screen modal for All Searches */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
  z-index: 9999;
}

.modal {
  width: 100%;
  max-width: 1200px;
  height: 80vh;
  overflow: auto;
  background: var(--neutral-0);
  border: var(--border-medium) solid var(--neutral-3);
}

.modal-header {
  position: sticky;
  top: 0;
  background: var(--neutral-0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: var(--border-thin) solid var(--neutral-2);
  z-index: 1;
}
</style>

