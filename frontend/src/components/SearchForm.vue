<template>
  <form @submit.prevent="handleSubmit" class="search-form geometric-block">
    <!-- Search Input - Wide rectangular band -->
    <div class="search-input-wrapper">
      <input
        v-model="formData.query"
        type="text"
        placeholder="Search for businesses..."
        class="input search-input"
        required
      />
    </div>

    <!-- Filters - Flat geometric blocks -->
    <div class="filters-grid grid grid-4">
      <div class="filter-block">
        <label class="filter-label">Country</label>
        <select v-model="formData.country" class="input">
          <option value="">All Countries</option>
          <optgroup label="Africa">
            <option value="ng">Nigeria</option>
            <option value="za">South Africa</option>
            <option value="ke">Kenya</option>
            <option value="gh">Ghana</option>
            <option value="ug">Uganda</option>
            <option value="tz">Tanzania</option>
            <option value="et">Ethiopia</option>
            <option value="eg">Egypt</option>
            <option value="zm">Zambia</option>
            <option value="zw">Zimbabwe</option>
            <option value="rw">Rwanda</option>
            <option value="sn">Senegal</option>
            <option value="ci">Ivory Coast</option>
            <option value="cm">Cameroon</option>
            <option value="ao">Angola</option>
            <option value="ma">Morocco</option>
            <option value="tn">Tunisia</option>
            <option value="dz">Algeria</option>
            <option value="mg">Madagascar</option>
            <option value="mw">Malawi</option>
          </optgroup>
          <optgroup label="North America">
            <option value="us">United States</option>
            <option value="ca">Canada</option>
            <option value="mx">Mexico</option>
          </optgroup>
          <optgroup label="Europe">
            <option value="gb">United Kingdom</option>
            <option value="de">Germany</option>
            <option value="fr">France</option>
            <option value="it">Italy</option>
            <option value="es">Spain</option>
            <option value="nl">Netherlands</option>
            <option value="be">Belgium</option>
            <option value="ch">Switzerland</option>
            <option value="at">Austria</option>
            <option value="se">Sweden</option>
            <option value="no">Norway</option>
            <option value="dk">Denmark</option>
            <option value="pl">Poland</option>
            <option value="ie">Ireland</option>
            <option value="pt">Portugal</option>
          </optgroup>
          <optgroup label="Asia">
            <option value="in">India</option>
            <option value="cn">China</option>
            <option value="jp">Japan</option>
            <option value="kr">South Korea</option>
            <option value="sg">Singapore</option>
            <option value="my">Malaysia</option>
            <option value="th">Thailand</option>
            <option value="id">Indonesia</option>
            <option value="ph">Philippines</option>
            <option value="vn">Vietnam</option>
            <option value="ae">United Arab Emirates</option>
            <option value="sa">Saudi Arabia</option>
            <option value="il">Israel</option>
            <option value="pk">Pakistan</option>
            <option value="bd">Bangladesh</option>
          </optgroup>
          <optgroup label="Oceania">
            <option value="au">Australia</option>
            <option value="nz">New Zealand</option>
          </optgroup>
          <optgroup label="South America">
            <option value="br">Brazil</option>
            <option value="ar">Argentina</option>
            <option value="co">Colombia</option>
            <option value="cl">Chile</option>
            <option value="pe">Peru</option>
          </optgroup>
        </select>
      </div>

      <div class="filter-block">
        <label class="filter-label">Location</label>
        <input
          v-model="formData.location"
          type="text"
          class="input"
          placeholder="e.g., Lagos, Nairobi, Accra"
        />
      </div>

      <div class="filter-block">
        <label class="filter-label">Industry</label>
        <select v-model="formData.industry" class="input">
          <option value="">All Industries</option>
          <option value="Technology">Technology</option>
          <option value="Software">Software</option>
          <option value="Healthcare">Healthcare</option>
          <option value="Finance">Finance</option>
          <option value="Banking">Banking</option>
          <option value="Real Estate">Real Estate</option>
          <option value="Retail">Retail</option>
          <option value="Manufacturing">Manufacturing</option>
          <option value="Education">Education</option>
          <option value="Hospitality">Hospitality</option>
          <option value="Food & Beverage">Food & Beverage</option>
          <option value="Construction">Construction</option>
          <option value="Transportation">Transportation</option>
          <option value="Logistics">Logistics</option>
          <option value="Energy">Energy</option>
          <option value="Telecommunications">Telecommunications</option>
          <option value="Media & Entertainment">Media & Entertainment</option>
          <option value="Advertising & Marketing">Advertising & Marketing</option>
          <option value="Consulting">Consulting</option>
          <option value="Legal">Legal</option>
          <option value="Professional Services">Professional Services</option>
          <option value="Non-Profit">Non-Profit</option>
          <option value="Government">Government</option>
          <option value="Agriculture">Agriculture</option>
          <option value="Mining">Mining</option>
          <option value="Utilities">Utilities</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="filter-block">
        <label class="filter-label">Result Count</label>
        <select v-model="formData.resultCount" class="input">
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </select>
      </div>
    </div>

    <!-- Submit Button -->
    <div class="search-actions">
      <button type="submit" class="btn btn-accent" :disabled="loading">
        {{ loading ? 'Searching...' : 'Search' }}
      </button>
      <button 
        type="button" 
        class="btn"
        @click="toggleTemplates"
        :disabled="loadingTemplates"
      >
        {{ showTemplates ? 'Hide' : 'Load' }} Template
      </button>
      <button 
        v-if="currentSearchId && formData.query.trim()"
        type="button" 
        class="btn"
        @click="saveAsTemplate"
        :disabled="loading"
        title="Save this search as a template"
      >
        Save Template
      </button>
    </div>

    <!-- Templates Section -->
    <div v-if="showTemplates" class="templates-section geometric-block">
      <div class="templates-header">
        <h3>Saved Templates</h3>
        <button 
          type="button"
          class="btn-icon"
          @click="refreshTemplates"
          :disabled="loadingTemplates"
          title="Refresh templates"
        >
          ↻
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loadingTemplates" class="templates-loading">
        <div class="loading-bar"></div>
      </div>

      <!-- Templates List -->
      <div v-else-if="savedSearches.length > 0" class="templates-list">
        <div
          v-for="template in savedSearches"
          :key="template._id"
          class="template-item geometric-block"
          @click="loadTemplate(template)"
        >
          <div class="template-content">
            <div class="template-name">{{ template.templateName || template.query }}</div>
            <div class="template-meta">
              <span class="template-query">{{ template.query }}</span>
              <span class="template-separator">•</span>
              <span class="template-location">{{ formatLocation(template) }}</span>
              <span v-if="template.resultCount" class="template-count">{{ template.resultCount }} results</span>
            </div>
          </div>
          <div class="template-action">→</div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="templates-empty geometric-block">
        <div class="empty-icon">—</div>
        <h4>No Templates Yet</h4>
        <p>Save your search queries as templates to reuse them later</p>
        <p class="empty-hint">Run a search and click "Save Template" to get started</p>
      </div>
    </div>
  </form>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';

const emit = defineEmits(['search']);

const formData = ref({
  query: '',
  country: '',
  location: '',
  industry: '',
  resultCount: 50
});

const loading = ref(false);
const savedSearches = ref([]);
const showTemplates = ref(false);
const loadingTemplates = ref(false);
const currentSearchId = ref(null);
const authStore = useAuthStore();

async function handleSubmit() {
  if (!formData.value.query.trim()) return;
  
  loading.value = true;
  const searchData = { ...formData.value };
  emit('search', searchData);
  // Note: searchId will be set by parent component
  loading.value = false;
}

async function saveAsTemplate() {
  if (!currentSearchId.value) {
    alert('Please start a search first');
    return;
  }
  
  if (!formData.value.query.trim()) {
    alert('Please enter a search query first');
    return;
  }
  
  const templateName = prompt('Enter template name:', formData.value.query);
  if (!templateName || !templateName.trim()) return;
  
  try {
    loading.value = true;
    await api.post(`/search/${currentSearchId.value}/save`, {
      templateName: templateName.trim()
    });
    await loadTemplates();
    // Show templates section after saving
    if (!showTemplates.value) {
      showTemplates.value = true;
    }
  } catch (error) {
    console.error('Error saving template:', error);
    alert(error.response?.data?.error || 'Failed to save template');
  } finally {
    loading.value = false;
  }
}

async function loadTemplates() {
  loadingTemplates.value = true;
  try {
    const response = await api.get('/search/templates/list');
    savedSearches.value = response.data || [];
  } catch (error) {
    console.error('Error loading templates:', error);
    savedSearches.value = [];
  } finally {
    loadingTemplates.value = false;
  }
}

async function toggleTemplates() {
  if (!showTemplates.value) {
    // Loading templates when opening
    await loadTemplates();
  }
  showTemplates.value = !showTemplates.value;
}

async function refreshTemplates() {
  await loadTemplates();
}

function loadTemplate(template) {
  if (!template) return;
  
  formData.value.query = template.query || '';
  formData.value.country = template.country || '';
  formData.value.location = template.location || '';
  formData.value.industry = template.industry || '';
  formData.value.resultCount = template.resultCount || 50;
  
  // Close templates section after loading
  showTemplates.value = false;
}

function formatLocation(template) {
  const parts = [];
  if (template.location) parts.push(template.location);
  if (template.country) {
    const countryNames = {
      'ng': 'Nigeria',
      'za': 'South Africa',
      'ke': 'Kenya',
      'gh': 'Ghana',
      'ug': 'Uganda',
      'tz': 'Tanzania'
    };
    parts.push(countryNames[template.country] || template.country);
  }
  return parts.length > 0 ? parts.join(', ') : 'All locations';
}

function setSearchId(searchId) {
  currentSearchId.value = searchId;
}

defineExpose({
  setSearchId
});

// Watch for template changes and refresh when section is opened
watch(showTemplates, async (newVal) => {
  if (newVal && savedSearches.value.length === 0 && !loadingTemplates.value) {
    await loadTemplates();
  }
});

onMounted(() => {
  // Initialize default result count from user preference if available
  // (User can still change per-search via the selector.)
  try {
    if (authStore?.user?.defaultResultCount) {
      formData.value.resultCount = Number(authStore.user.defaultResultCount) || 50;
    }
  } catch {}
  // Don't load templates on mount - only when user opens the section
  // This improves initial page load
});
</script>

<style scoped>
.search-form {
  padding: var(--spacing-xl);
}

.search-input-wrapper {
  margin-bottom: var(--spacing-lg);
}

.search-input {
  font-size: 1.25rem;
  padding: var(--spacing-md) var(--spacing-lg);
}

.filters-grid {
  margin-bottom: var(--spacing-lg);
}

@media (max-width: 1200px) {
  .filters-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .filters-grid {
    grid-template-columns: 1fr;
  }
}

.filter-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.filter-label {
  font-weight: var(--font-weight-semibold);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search-actions {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.templates-section {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-lg);
  border-top: var(--border-thick) solid var(--neutral-2);
}

.templates-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: var(--border-medium) solid var(--neutral-2);
}

.templates-header h3 {
  font-size: 1.125rem;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-icon {
  background: none;
  border: var(--border-medium) solid var(--neutral-2);
  padding: var(--spacing-xs) var(--spacing-sm);
  cursor: pointer;
  font-size: 1.25rem;
  font-weight: var(--font-weight-bold);
  transition: all 0.2s linear;
  min-width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover:not(:disabled) {
  background: var(--neutral-2);
  color: var(--neutral-1);
  border-color: var(--neutral-2);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.templates-loading {
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

.templates-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.template-item {
  padding: var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s linear;
  position: relative;
}

.template-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0;
  background: var(--accent);
  transition: width 0.2s linear;
}

.template-item:hover {
  border-color: var(--accent);
  background: var(--neutral-1);
}

.template-item:hover::before {
  width: 4px;
}

.template-content {
  flex: 1;
}

.template-name {
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-xs);
  font-size: 1rem;
}

.template-meta {
  font-size: 0.875rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.template-query {
  font-weight: var(--font-weight-semibold);
}

.template-separator {
  color: #999;
}

.template-location {
  color: #666;
}

.template-count {
  margin-left: auto;
  padding: 2px var(--spacing-xs);
  background: var(--neutral-2);
  color: var(--neutral-1);
  font-size: 0.75rem;
  font-weight: var(--font-weight-semibold);
}

.template-action {
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  color: var(--neutral-2);
  margin-left: var(--spacing-md);
  transition: transform 0.2s linear;
}

.template-item:hover .template-action {
  transform: translateX(4px);
  color: var(--accent);
}

.templates-empty {
  padding: var(--spacing-xxl);
  text-align: center;
  border: var(--border-medium) dashed var(--neutral-2);
}

.empty-icon {
  font-size: 4rem;
  font-weight: var(--font-weight-bold);
  color: var(--neutral-2);
  margin-bottom: var(--spacing-md);
  line-height: 1;
}

.templates-empty h4 {
  font-size: 1.125rem;
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.templates-empty p {
  color: #666;
  margin-bottom: var(--spacing-xs);
  font-size: 0.9375rem;
}

.empty-hint {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: var(--border-thin) solid var(--neutral-2);
  font-size: 0.875rem;
  color: #999;
}
</style>

