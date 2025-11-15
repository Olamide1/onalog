<template>
  <div class="lead-list">
    <!-- Header - Stella band style -->
    <div class="list-header horizontal-band">
      <div class="header-content">
        <h2>Leads ({{ leads.length }})</h2>
        <div class="header-actions">
          <button @click="handleExport('csv')" class="btn">Export CSV</button>
          <button @click="handleExport('excel')" class="btn">Export Excel</button>
        </div>
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
            v-for="lead in sortedLeads"
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
              {{ lead.emails?.[0]?.email || '—' }}
            </td>
            <td>{{ lead.address || '—' }}</td>
            <td>
              <div class="score-cell">
                <div v-if="lead.enrichmentStatus === 'skipped'" class="status-badge skipped">
                  Skipped
                </div>
                <div v-else class="score-bar">
                  <div
                    class="score-bar-fill"
                    :style="{ width: (lead.enrichment?.signalStrength || 0) + '%' }"
                  ></div>
                </div>
                <span v-if="lead.enrichmentStatus !== 'skipped'" class="score-value">{{ lead.enrichment?.signalStrength || 0 }}</span>
              </div>
            </td>
            <td @click.stop>
              <button @click="selectLead(lead)" class="btn btn-sm">View</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  leads: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['select-lead', 'export']);

const selectedIds = ref([]);
const sortBy = ref('signalStrength');
const sortOrder = ref('desc');

const allSelected = computed(() => {
  return props.leads.length > 0 && selectedIds.value.length === props.leads.length;
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
    selectedIds.value = [];
  } else {
    selectedIds.value = props.leads.map(l => l._id);
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
  max-width: 200px; /* Location column */
}

.table td:nth-child(7) {
  max-width: 100px; /* Score column */
}

.table td:nth-child(8) {
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

.score-bar {
  flex: 1;
  max-width: 100px;
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
</style>

