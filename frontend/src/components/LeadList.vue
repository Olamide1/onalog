<template>
  <div class="lead-list">
    <!-- Header - Stella band style -->
    <div class="list-header horizontal-band">
      <div class="header-content">
        <h2>Leads ({{ leads.length }}{{ totalPages > 1 ? ` - Page ${currentPage} of ${totalPages}` : '' }})</h2>
        <div class="header-actions">
          <button @click="handleExport('csv')" class="btn">Export CSV</button>
          <button @click="handleExport('excel')" class="btn">Export Excel</button>
        </div>
      </div>
    </div>

    <!-- Pagination Controls (Top) -->
    <div v-if="totalPages > 1" class="pagination-controls geometric-block">
      <div class="pagination-info">
        <span>Showing {{ startIndex + 1 }}-{{ endIndex }} of {{ leads.length }} leads</span>
        <select v-model="pageSize" class="page-size-select" @change="currentPage = 1">
          <option :value="10">10 per page</option>
          <option :value="25">25 per page</option>
          <option :value="50">50 per page</option>
          <option :value="100">100 per page</option>
        </select>
      </div>
      <div class="pagination-buttons">
        <button 
          @click="currentPage = 1" 
          :disabled="currentPage === 1"
          class="btn btn-sm"
        >
          First
        </button>
        <button 
          @click="currentPage--" 
          :disabled="currentPage === 1"
          class="btn btn-sm"
        >
          Previous
        </button>
        <span class="page-numbers">
          <button
            v-for="page in visiblePages"
            :key="page"
            @click="currentPage = page"
            :class="['btn', 'btn-sm', 'page-number', { active: currentPage === page }]"
          >
            {{ page }}
          </button>
        </span>
        <button 
          @click="currentPage++" 
          :disabled="currentPage === totalPages"
          class="btn btn-sm"
        >
          Next
        </button>
        <button 
          @click="currentPage = totalPages" 
          :disabled="currentPage === totalPages"
          class="btn btn-sm"
        >
          Last
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="table-wrapper geometric-block">
      <table class="table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                @change="toggleAll"
                :checked="allSelected"
              />
            </th>
            <th @click="sort('companyName')" class="sortable">
              Company
              <span v-if="sortBy === 'companyName'" class="sort-indicator">
                {{ sortOrder === 'asc' ? '↑' : '↓' }}
              </span>
            </th>
            <th>Website</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Decision Maker</th>
            <th>Location</th>
            <th @click="sort('signalStrength')" class="sortable">
              Score
              <span v-if="sortBy === 'signalStrength'" class="sort-indicator">
                {{ sortOrder === 'asc' ? '↑' : '↓' }}
              </span>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="lead in paginatedLeads"
            :key="lead._id"
            @click="selectLead(lead)"
            class="lead-row"
          >
            <td @click.stop>
              <input
                type="checkbox"
                :checked="isSelected(lead._id)"
                @change="toggleSelection(lead._id)"
              />
            </td>
            <td class="company-name">{{ lead.companyName }}</td>
            <td class="website-cell">
              <a
                v-if="lead.website"
                :href="lead.website"
                target="_blank"
                @click.stop
                class="website-link"
                :title="lead.website"
              >
                {{ formatUrl(lead.website) }}
              </a>
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              {{ lead.phoneNumbers?.[0]?.formatted || lead.phoneNumbers?.[0]?.phone || '—' }}
            </td>
            <td>
              {{ getPrimaryEmail(lead) || '—' }}
            </td>
            <td class="decision-maker-cell">
              <div v-if="getPrimaryDecisionMaker(lead)" class="decision-maker-info">
                <div class="dm-name">{{ getPrimaryDecisionMaker(lead).name }}</div>
                <div v-if="getPrimaryDecisionMaker(lead).title" class="dm-title">{{ getPrimaryDecisionMaker(lead).title }}</div>
                <div v-if="getPrimaryDecisionMaker(lead).email" class="dm-email">{{ getPrimaryDecisionMaker(lead).email }}</div>
              </div>
              <span v-else class="text-muted">—</span>
            </td>
            <td>{{ lead.address || '—' }}</td>
            <td>
              <div class="score-cell">
                <div v-if="lead.enrichmentStatus === 'skipped'" class="status-badge skipped">
                  Skipped
                </div>
                <div v-else class="score-container">
                  <div class="score-bar">
                    <div
                      class="score-bar-fill"
                      :style="{ width: (lead.enrichment?.signalStrength || 0) + '%' }"
                    ></div>
                  </div>
                  <span class="score-value">{{ lead.enrichment?.signalStrength || 0 }}</span>
                  <span v-if="lead.qualityScore !== null && lead.qualityScore !== undefined" 
                        class="quality-badge" 
                        :class="getQualityClass(lead.qualityScore)"
                        :title="getQualityTooltip(lead.qualityScore)">
                    Q{{ lead.qualityScore }}
                  </span>
                </div>
              </div>
            </td>
            <td @click.stop>
              <button @click="selectLead(lead)" class="btn btn-sm">View</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls (Bottom) -->
    <div v-if="totalPages > 1" class="pagination-controls geometric-block">
      <div class="pagination-info">
        <span>Showing {{ startIndex + 1 }}-{{ endIndex }} of {{ leads.length }} leads</span>
        <select v-model="pageSize" class="page-size-select" @change="currentPage = 1">
          <option :value="10">10 per page</option>
          <option :value="25">25 per page</option>
          <option :value="50">50 per page</option>
          <option :value="100">100 per page</option>
        </select>
      </div>
      <div class="pagination-buttons">
        <button 
          @click="currentPage = 1" 
          :disabled="currentPage === 1"
          class="btn btn-sm"
        >
          First
        </button>
        <button 
          @click="currentPage--" 
          :disabled="currentPage === 1"
          class="btn btn-sm"
        >
          Previous
        </button>
        <span class="page-numbers">
          <button
            v-for="page in visiblePages"
            :key="page"
            @click="currentPage = page"
            :class="['btn', 'btn-sm', 'page-number', { active: currentPage === page }]"
          >
            {{ page }}
          </button>
        </span>
        <button 
          @click="currentPage++" 
          :disabled="currentPage === totalPages"
          class="btn btn-sm"
        >
          Next
        </button>
        <button 
          @click="currentPage = totalPages" 
          :disabled="currentPage === totalPages"
          class="btn btn-sm"
        >
          Last
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  leads: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['select-lead', 'export', 'toast']);

const selectedIds = ref([]);
const sortBy = ref('signalStrength');
const sortOrder = ref('desc');
const currentPage = ref(1);
const pageSize = ref(10);
const previousLeadsRef = ref(null);

const allSelected = computed(() => {
  return paginatedLeads.value.length > 0 && 
    selectedIds.value.filter(id => paginatedLeads.value.some(l => l._id === id)).length === paginatedLeads.value.length;
});

const sortedLeads = computed(() => {
  const sorted = [...props.leads];
  
  sorted.sort((a, b) => {
    let aVal, bVal;
    
    if (sortBy.value === 'companyName') {
      aVal = a.companyName?.toLowerCase() || '';
      bVal = b.companyName?.toLowerCase() || '';
    } else if (sortBy.value === 'signalStrength') {
      aVal = a.enrichment?.signalStrength || 0;
      bVal = b.enrichment?.signalStrength || 0;
    }
    
    if (sortOrder.value === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
  
  return sorted;
});

const totalPages = computed(() => {
  return Math.ceil(sortedLeads.value.length / pageSize.value);
});

const startIndex = computed(() => {
  return (currentPage.value - 1) * pageSize.value;
});

const endIndex = computed(() => {
  return Math.min(startIndex.value + pageSize.value, sortedLeads.value.length);
});

const paginatedLeads = computed(() => {
  return sortedLeads.value.slice(startIndex.value, endIndex.value);
});

const visiblePages = computed(() => {
  const pages = [];
  const maxVisible = 7;
  let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages.value, start + maxVisible - 1);
  
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  return pages;
});

// Reset to page 1 when leads change (watch array reference to detect new searches)
// This fixes the bug where pagination didn't reset when new search had same length
// We track the array reference to detect when a completely new search result set arrives
watch(
  () => props.leads,
  (newLeads) => {
    // Check if this is a new array reference (new search completed)
    // When a new search completes, the store assigns a new array reference to leads.value
    if (previousLeadsRef.value !== newLeads) {
      // Reset to page 1 for new search results
      currentPage.value = 1;
      // Clear selections when switching to new results
      selectedIds.value = [];
      // Update reference for next comparison
      previousLeadsRef.value = newLeads;
    }
  },
  { immediate: true }
);

function isSelected(leadId) {
  return selectedIds.value.includes(leadId);
}

function toggleSelection(leadId) {
  const index = selectedIds.value.indexOf(leadId);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(leadId);
  }
}

function toggleAll() {
  if (allSelected.value) {
    // Deselect all on current page
    paginatedLeads.value.forEach(lead => {
      const index = selectedIds.value.indexOf(lead._id);
      if (index > -1) {
        selectedIds.value.splice(index, 1);
      }
    });
  } else {
    // Select all on current page
    paginatedLeads.value.forEach(lead => {
      if (!selectedIds.value.includes(lead._id)) {
        selectedIds.value.push(lead._id);
      }
    });
  }
}

function sort(field) {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = field;
    sortOrder.value = 'desc';
  }
}

function selectLead(lead) {
  emit('select-lead', lead);
}

function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function handleExport(format) {
  emit('export', format);
  // Emit toast notification (parent will handle)
  emit('toast', {
    type: 'success',
    message: `${format.toUpperCase()} export started. Check your downloads.`,
    duration: 4000
  });
}

function getQualityClass(score) {
  if (score >= 5) return 'quality-high';
  if (score >= 3) return 'quality-medium';
  if (score >= 1) return 'quality-low';
  return 'quality-very-low';
}

function getQualityTooltip(score) {
  const explanations = {
    5: 'Q5 - Excellent: Complete contact info (email + phone), verified website, decision makers found, high data completeness',
    4: 'Q4 - Very Good: Most contact info available, verified website, good data completeness',
    3: 'Q3 - Good: Basic contact info available, website verified, moderate data completeness',
    2: 'Q2 - Fair: Limited contact info, website may be unverified, low data completeness',
    1: 'Q1 - Poor: Minimal contact info, website may be missing or unverified, very low data completeness',
    0: 'Q0 - Very Poor: Missing critical information, unverified data'
  };
  return explanations[score] || `Quality: ${score}/5`;
}

// Get primary email - prioritize decision maker email, fallback to company email
function getPrimaryEmail(lead) {
  // First, try to get email from decision makers (most valuable)
  const primaryDM = getPrimaryDecisionMaker(lead);
  if (primaryDM?.email) {
    return primaryDM.email;
  }
  // Fallback to company email
  return lead.emails?.[0]?.email || null;
}

// Get primary decision maker (first one with email, or first one overall)
function getPrimaryDecisionMaker(lead) {
  if (!lead.decisionMakers || lead.decisionMakers.length === 0) {
    return null;
  }
  // Prefer decision maker with email
  const withEmail = lead.decisionMakers.find(dm => dm.email);
  if (withEmail) {
    return withEmail;
  }
  // Fallback to first decision maker
  return lead.decisionMakers[0];
}
</script>

<style scoped>
.lead-list {
  margin-top: var(--spacing-xl);
}

.list-header {
  margin-bottom: var(--spacing-md);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
}

.table-wrapper {
  overflow-x: auto;
  max-width: 100%;
}

.table {
  width: 100%;
  table-layout: auto;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  vertical-align: top;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 200px;
}

.table th {
  white-space: nowrap;
  font-weight: var(--font-weight-semibold);
  border-bottom: 2px solid var(--neutral-2);
}

.table td {
  white-space: normal;
  word-break: break-word;
}

.sortable {
  cursor: pointer;
  user-select: none;
}

.sortable:hover {
  background: var(--neutral-1);
}

.sort-indicator {
  margin-left: var(--spacing-xs);
  font-weight: var(--font-weight-bold);
}

.lead-row {
  cursor: pointer;
}

.lead-row:hover {
  background: var(--neutral-1);
}

.company-name {
  font-weight: var(--font-weight-semibold);
  max-width: 250px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.table td:nth-child(2) {
  max-width: 250px; /* Company column */
}

.table td:nth-child(3) {
  max-width: 150px; /* Website column */
}

.table td:nth-child(4) {
  max-width: 120px; /* Phone column */
}

.table td:nth-child(5) {
  max-width: 180px; /* Email column */
}

.table td:nth-child(6) {
  max-width: 200px; /* Decision Maker column */
}

.table td:nth-child(7) {
  max-width: 200px; /* Location column */
}

.table td:nth-child(8) {
  max-width: 100px; /* Score column */
}

.table td:nth-child(9) {
  max-width: 80px; /* Actions column */
  white-space: nowrap;
}

.website-cell {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.website-link {
  color: var(--accent);
  text-decoration: none;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.website-link:hover {
  text-decoration: underline;
}

.score-cell {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.score-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.score-bar {
  flex: 1;
  max-width: 100px;
  min-width: 60px;
}

.score-value {
  font-weight: var(--font-weight-semibold);
  min-width: 30px;
  text-align: right;
}

.btn-sm {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.875rem;
  min-width: auto;
}

.text-muted {
  color: #999;
}

.decision-maker-cell {
  max-width: 200px;
}

.decision-maker-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dm-name {
  font-weight: var(--font-weight-semibold);
  font-size: 0.9rem;
  color: var(--text-primary);
}

.dm-title {
  font-size: 0.8rem;
  color: #666;
  font-style: italic;
}

.dm-email {
  font-size: 0.85rem;
  color: var(--accent);
  word-break: break-all;
}

.status-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.75rem;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: var(--border-thin) solid var(--neutral-2);
}

.status-badge.skipped {
  background: #fff3cd;
  color: #856404;
  border-color: #ffc107;
}

.quality-badge {
  display: inline-block;
  padding: 2px 6px;
  font-size: 0.7rem;
  font-weight: var(--font-weight-bold);
  border: var(--border-thin) solid;
  border-radius: 2px;
  white-space: nowrap;
}

.quality-badge.quality-high {
  background: #d4edda;
  color: #155724;
  border-color: #28a745;
}

.quality-badge.quality-medium {
  background: #fff3cd;
  color: #856404;
  border-color: #ffc107;
}

.quality-badge.quality-low {
  background: #f8d7da;
  color: #721c24;
  border-color: #dc3545;
}

.quality-badge.quality-very-low {
  background: #e2e3e5;
  color: #383d41;
  border-color: #6c757d;
}

/* Pagination Styles */
.pagination-controls {
  padding: var(--spacing-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.pagination-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.page-size-select {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: var(--border-medium) solid var(--neutral-2);
  background: var(--neutral-0);
  font-size: 0.875rem;
}

.pagination-buttons {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.page-numbers {
  display: flex;
  gap: var(--spacing-xs);
}

.page-number {
  min-width: 36px;
}

.page-number.active {
  background: var(--accent);
  color: var(--neutral-0);
  border-color: var(--accent);
}

.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

