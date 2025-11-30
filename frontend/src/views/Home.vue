<template>
  <div class="home">
    <!-- Search Section - Wide rectangular band -->
    <section class="search-section horizontal-band">
      <div class="container">
        <h1 class="mb-lg">coralgen</h1>
        <SearchForm ref="searchFormRef" @search="handleSearch" />
      </div>
    </section>

    <!-- Main Content -->
    <div class="container main-content">
      <!-- Loading State - Initial Search Creation -->
      <div v-if="leadsStore.loading && !leadsStore.currentSearch" class="loading-state geometric-block">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <h3>Creating your search...</h3>
          <p>Please wait while we prepare your search</p>
        </div>
      </div>
      
      <!-- Loading State - Skeleton Rows While Processing -->
      <div v-if="leadsStore.currentSearch && (leadsStore.currentSearch.status === 'processing' || leadsStore.currentSearch.status === 'queued' || leadsStore.currentSearch.status === 'searching' || leadsStore.currentSearch.status === 'extracting' || leadsStore.currentSearch.status === 'enriching') && leadsStore.filteredLeads.length === 0" class="skeleton-loading geometric-block">
        <div class="skeleton-header">
          <div class="skeleton-bar" style="width: 200px; height: 24px;"></div>
          <div class="skeleton-bar" style="width: 100px; height: 20px;"></div>
        </div>
        <div class="skeleton-table">
          <div v-for="i in 5" :key="i" class="skeleton-row">
            <div class="skeleton-bar" style="width: 20px;"></div>
            <div class="skeleton-bar" style="width: 180px;"></div>
            <div class="skeleton-bar" style="width: 120px;"></div>
            <div class="skeleton-bar" style="width: 100px;"></div>
            <div class="skeleton-bar" style="width: 150px;"></div>
            <div class="skeleton-bar" style="width: 160px;"></div>
            <div class="skeleton-bar" style="width: 150px;"></div>
            <div class="skeleton-bar" style="width: 80px;"></div>
            <div class="skeleton-bar" style="width: 60px;"></div>
          </div>
        </div>
      </div>

      <!-- Search Status -->
      <div v-if="leadsStore.currentSearch" class="search-status geometric-block">
        <div class="status-header">
          <h3>{{ leadsStore.currentSearch.query }}</h3>
          <span class="status-badge" :class="leadsStore.currentSearch.status">
            {{ formatStatus(leadsStore.currentSearch.status) }}
          </span>
        </div>
        <div class="status-stats">
          <div>Total: {{ leadsStore.currentSearch.totalResults || 0 }}</div>
          <div>Extracted: {{ leadsStore.currentSearch.extractedCount || 0 }}</div>
          <div>Enriched: {{ leadsStore.enrichedCount }}</div>
        </div>
        <div v-if="leadsStore.currentSearch.status === 'processing' || leadsStore.currentSearch.status === 'queued' || leadsStore.currentSearch.status === 'searching' || leadsStore.currentSearch.status === 'extracting' || leadsStore.currentSearch.status === 'enriching'" class="progress-indicator">
          <div class="progress-message">
            <span class="progress-icon">⏳</span>
            <span>{{ getProgressMessage(leadsStore.currentSearch.status) }}</span>
          </div>
          <div class="progress-details">
            <div class="progress-section">
              <label>Extraction Progress</label>
              <div class="progress-bar">
                <div class="progress-fill extraction" :style="{ width: extractionPercent + '%' }"></div>
              </div>
              <span class="progress-text">{{ leadsStore.currentSearch.extractedCount || 0 }} / {{ leadsStore.currentSearch.totalResults || 0 }} extracted</span>
            </div>
            <div v-if="leadsStore.currentSearch.extractedCount > 0" class="progress-section">
              <label>Enrichment Progress</label>
              <div class="progress-bar">
                <div class="progress-fill enrichment" :style="{ width: enrichmentPercent + '%' }"></div>
              </div>
              <span class="progress-text">{{ leadsStore.enrichedCount || 0 }} / {{ leadsStore.currentSearch.extractedCount || 0 }} enriched</span>
            </div>
          </div>
          <p class="progress-hint">Best results appear first - check back when complete for full list</p>
          <p v-if="estimatedTimeRemaining" class="progress-time">Estimated time remaining: {{ estimatedTimeRemaining }}</p>
          <div v-if="showRefreshPrompt" class="refresh-prompt">
            <p>⚠️ Updates may have stalled. Click refresh to check for new results.</p>
            <button @click="refreshSearch" class="refresh-button">Refresh</button>
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
import { useLeadsStore } from '../stores/leads';
import SearchForm from '../components/SearchForm.vue';
import LeadList from '../components/LeadList.vue';
import LeadDetailPanel from '../components/LeadDetailPanel.vue';

const leadsStore = useLeadsStore();
const selectedLead = ref(null);
const searchFormRef = ref(null);
let pollInterval = null;
const lastUpdateTime = ref(null);
const lastExtractedCount = ref(0);
const lastEnrichedCount = ref(0);
const lastUpdateTimestamp = ref(Date.now());

const progressPercent = computed(() => {
  if (!leadsStore.currentSearch) return 0;
  const total = leadsStore.currentSearch.totalResults || 1;
  const extracted = leadsStore.currentSearch.extractedCount || 0;
  return Math.min((extracted / total) * 100, 95);
});

const extractionPercent = computed(() => {
  if (!leadsStore.currentSearch) return 0;
  const total = leadsStore.currentSearch.totalResults || 1;
  const extracted = leadsStore.currentSearch.extractedCount || 0;
  return Math.min((extracted / total) * 100, 100);
});

const enrichmentPercent = computed(() => {
  if (!leadsStore.currentSearch || !leadsStore.currentSearch.extractedCount) return 0;
  const extracted = leadsStore.currentSearch.extractedCount || 1;
  const enriched = leadsStore.enrichedCount || 0;
  return Math.min((enriched / extracted) * 100, 100);
});

const estimatedTimeRemaining = computed(() => {
  if (!leadsStore.currentSearch) return null;
  const status = leadsStore.currentSearch.status;
  const total = leadsStore.currentSearch.totalResults || 0;
  const extracted = leadsStore.currentSearch.extractedCount || 0;
  const enriched = leadsStore.enrichedCount || 0;
  
  if (status === 'searching' || status === 'queued') {
    return 'Calculating...';
  }
  
  if (status === 'extracting' && extracted > 0 && total > 0) {
    const remaining = total - extracted;
    // Estimate ~2-3 seconds per lead extraction
    const seconds = remaining * 2.5;
    if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
    return `~${Math.ceil(seconds / 60)} minutes`;
  }
  
  if (status === 'enriching' && enriched > 0 && extracted > 0) {
    const remaining = extracted - enriched;
    // Estimate ~5-8 seconds per lead enrichment
    const seconds = remaining * 6;
    if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
    return `~${Math.ceil(seconds / 60)} minutes`;
  }
  
  return null;
});

// Check if updates have stalled (no change in counts for 30+ seconds while processing)
const showRefreshPrompt = computed(() => {
  if (!leadsStore.currentSearch) return false;
  const status = leadsStore.currentSearch.status;
  const isProcessing = status === 'processing' || status === 'extracting' || status === 'enriching';
  
  if (!isProcessing) return false;
  
  // Check if counts haven't changed in 30 seconds
  const timeSinceLastUpdate = Date.now() - lastUpdateTimestamp.value;
  const countsUnchanged = 
    (leadsStore.currentSearch.extractedCount || 0) === lastExtractedCount.value &&
    leadsStore.enrichedCount === lastEnrichedCount.value;
  
  // Show refresh prompt if counts haven't changed for 30+ seconds
  return countsUnchanged && timeSinceLastUpdate > 30000;
});

async function refreshSearch() {
  if (!leadsStore.currentSearch) return;
  try {
    await leadsStore.fetchSearch(leadsStore.currentSearch.searchId || leadsStore.currentSearch._id);
    // Reset stale detection
    lastUpdateTimestamp.value = Date.now();
    lastExtractedCount.value = leadsStore.currentSearch.extractedCount || 0;
    lastEnrichedCount.value = leadsStore.enrichedCount;
  } catch (error) {
    console.error('Refresh error:', error);
  }
}

async function handleSearch(searchData) {
  try {
    const search = await leadsStore.createSearch(
      searchData.query,
      searchData.country,
      searchData.location || null,
      searchData.industry || null,
      searchData.resultCount
    );
    
    // Pass searchId to SearchForm for template saving
    if (searchFormRef.value) {
      searchFormRef.value.setSearchId(search.searchId);
    }
    
    // Start polling for updates
    startPolling(search.searchId);
    // Prime UI immediately (don't wait 2s for first tick)
    await leadsStore.fetchSearch(search.searchId);
  } catch (error) {
    console.error('Search error:', error);
  }
}

function startPolling(searchId) {
  if (pollInterval) clearInterval(pollInterval);
  
  // Use faster polling (1s) for better real-time updates
  pollInterval = setInterval(async () => {
    try {
      const data = await leadsStore.fetchSearch(searchId);
      const requested = data?.search?.resultCount || 50;
      const have = (leadsStore.filteredLeads || []).length;
      const status = (data?.search?.status || '').toLowerCase();
      const extracted = data?.search?.extractedCount || 0;
      const enriched = leadsStore.enrichedCount || 0;
      
      // Track updates for stale detection
      const countsChanged = 
        extracted !== lastExtractedCount.value || 
        enriched !== lastEnrichedCount.value;
      
      if (countsChanged) {
        // Reset stale detection when counts change
        lastUpdateTimestamp.value = Date.now();
        lastExtractedCount.value = extracted;
        lastEnrichedCount.value = enriched;
      }
      
      // Determine if we should keep polling
      const isActive = status === 'queued' || status === 'searching' || 
                       status === 'extracting' || status === 'enriching' || 
                       status === 'processing' || status === 'processing_backfill';
      
      // Continue polling if:
      // 1. Status is active (queued, searching, extracting, enriching, processing, processing_backfill)
      // 2. Status is completed but we have fewer leads than requested (background enrichment still happening)
      // 3. Status is completed but extracted < requested (still extracting in background)
      // 4. Status is completed but enriched < extracted (still enriching in background)
      const shouldKeepPolling =
        status !== 'failed' && (
          isActive ||
          (status === 'completed' && (have < requested || extracted < requested || enriched < extracted))
        );
      
      if (!shouldKeepPolling) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    } catch (err) {
      // Log error but continue polling (network issues shouldn't stop updates)
      console.warn('Polling error (will retry):', err.message);
    }
  }, 1000); // Poll every 1 second for faster updates
}

function formatStatus(status) {
  const statusMap = {
    'queued': 'Queued',
    'searching': 'Searching',
    'extracting': 'Extracting',
    'enriching': 'Enriching',
    'processing': 'Processing',
    'completed': 'Completed',
    'failed': 'Failed'
  };
  return statusMap[status] || status;
}

function getProgressMessage(status) {
  const messages = {
    'queued': 'Waiting in queue...',
    'searching': 'Searching for businesses...',
    'extracting': 'Extracting contact information...',
    'enriching': 'Enriching leads with additional data...',
    'processing': 'Processing your search...'
  };
  return messages[status] || 'Processing...';
}

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<style scoped>
.home {
  min-height: 100vh;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: var(--spacing-xl);
}

.search-section {
  margin-bottom: var(--spacing-xl);
}

.main-content {
  padding-top: var(--spacing-lg);
}

.loading-state {
  margin-top: var(--spacing-xl);
  padding: var(--spacing-xxl);
  text-align: center;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--neutral-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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

.skeleton-loading {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-lg);
}

.skeleton-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
  gap: var(--spacing-md);
}

.skeleton-table {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.skeleton-row {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  padding: var(--spacing-sm) 0;
}

.skeleton-bar {
  height: 20px;
  background: var(--neutral-1);
  border-radius: 4px;
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

.progress-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--accent);
}

.progress-icon {
  font-size: 1.2rem;
}

.progress-details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.progress-section label {
  font-size: 0.875rem;
  font-weight: var(--font-weight-semibold);
  color: #666;
}

.progress-text {
  font-size: 0.75rem;
  color: #666;
  margin-top: 2px;
}

.progress-fill.extraction {
  background: var(--accent);
}

.progress-fill.enrichment {
  background: #28a745;
}

.progress-hint {
  margin-top: var(--spacing-sm);
  font-size: 0.875rem;
  color: #666;
  font-style: italic;
}

.refresh-prompt {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  align-items: flex-start;
}

.refresh-prompt p {
  margin: 0;
  color: #856404;
  font-size: 0.875rem;
}

.refresh-button {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: var(--font-weight-semibold);
  font-size: 0.875rem;
  transition: background 0.2s;
}

.refresh-button:hover {
  background: var(--accent-dark, #0056b3);
}

.progress-time {
  margin-top: var(--spacing-xs);
  font-size: 0.875rem;
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
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

