<template>
  <div class="panel" :class="{ closed: !isOpen }" tabindex="0">
    <!-- Breadcrumb Navigation -->
    <div class="panel-breadcrumb">
      <button @click="close" class="breadcrumb-link">Dashboard</button>
      <span class="breadcrumb-separator">›</span>
      <button @click="close" class="breadcrumb-link">Search Results</button>
      <span class="breadcrumb-separator">›</span>
      <span class="breadcrumb-current">{{ lead.companyName }}</span>
    </div>

    <div class="panel-header">
      <div class="panel-header-left">
        <button @click="goBack" class="btn-back">
          ← Back to Results
        </button>
      <h2>{{ lead.companyName }}</h2>
        <div v-if="searchQuery" class="search-context">From search: "{{ searchQuery }}"</div>
      </div>
      <div class="panel-header-right">
        <div v-if="showNavigation" class="lead-navigation">
          <button 
            @click="navigateToLead('prev')" 
            :disabled="!hasPrevious"
            class="btn-nav"
            title="Previous Lead (←)"
          >
            ←
          </button>
          <span class="nav-counter">{{ currentLeadIndex + 1 }} / {{ totalLeads }}</span>
          <button 
            @click="navigateToLead('next')" 
            :disabled="!hasNext"
            class="btn-nav"
            title="Next Lead (→)"
          >
            →
          </button>
        </div>
        <button @click="close" class="close-btn" title="Close (ESC)">×</button>
      </div>
    </div>

    <div class="panel-content">
      <!-- Enrichment Status Notice -->
      <div v-if="lead.enrichmentStatus === 'skipped'" class="enrichment-notice">
        <p><strong>Enrichment Skipped:</strong> This lead was not enriched due to insufficient credits. Basic contact information is available, but AI-powered insights are missing.</p>
      </div>

      <!-- Company Snapshot -->
      <section class="panel-section">
        <div class="section-header vertical-bar">
          <h3>Company Snapshot</h3>
        </div>
        <div class="section-content">
          <div class="info-grid grid grid-2">
            <div class="info-item">
              <label>Industry</label>
              <div>{{ lead.enrichment?.industry || '—' }}</div>
            </div>
            <div class="info-item">
              <label>Company Size</label>
              <div>{{ lead.enrichment?.companySize || '—' }}</div>
            </div>
            <div class="info-item">
              <label>Revenue Bracket</label>
              <div>{{ lead.enrichment?.revenueBracket || '—' }}</div>
            </div>
            <div class="info-item">
              <label>Signal Strength</label>
              <div class="score-display">
                <div class="score-bar">
                  <div
                    class="score-bar-fill"
                    :style="{ width: (lead.enrichment?.signalStrength || 0) + '%' }"
                  ></div>
                </div>
                <span>{{ lead.enrichment?.signalStrength || 0 }}</span>
              </div>
            </div>
            <div class="info-item" v-if="lead.qualityScore !== null && lead.qualityScore !== undefined">
              <label>
                Quality Score
                <span class="help-icon" :title="getQualityTooltip(lead.qualityScore)">ℹ️</span>
              </label>
              <div class="score-display">
                <div class="score-bar">
                  <div
                    class="score-bar-fill"
                    :class="getQualityClass(lead.qualityScore)"
                    :style="{ width: (lead.qualityScore / 5 * 100) + '%' }"
                  ></div>
                </div>
                <span>{{ lead.qualityScore }}/5</span>
                <span class="quality-label" :class="getQualityClass(lead.qualityScore)">
                  {{ getQualityLabel(lead.qualityScore) }}
                </span>
              </div>
              <p class="score-explanation">{{ getQualityTooltip(lead.qualityScore) }}</p>
            </div>
            <div class="info-item" v-if="lead.enrichment?.verificationScore !== null && lead.enrichment?.verificationScore !== undefined">
              <label>Verification Score</label>
              <div class="score-display">
                <div class="score-bar">
                  <div
                    class="score-bar-fill"
                    :class="getVerificationClass(lead.enrichment.verificationScore)"
                    :style="{ width: (lead.enrichment.verificationScore / 5 * 100) + '%' }"
                  ></div>
                </div>
                <span>{{ lead.enrichment.verificationScore }}/5</span>
                <span class="verification-label" :class="getVerificationClass(lead.enrichment.verificationScore)">
                  {{ getVerificationLabel(lead.enrichment.verificationScore) }}
                </span>
              </div>
              <div v-if="lead.enrichment?.verificationSources && lead.enrichment.verificationSources.length > 0" class="verification-sources">
                <small>Sources: {{ lead.enrichment.verificationSources.join(', ') }}</small>
              </div>
            </div>
          </div>
          <div v-if="lead.enrichment?.businessSummary" class="summary">
            <p>{{ lead.enrichment.businessSummary }}</p>
          </div>
        </div>
      </section>

      <!-- Contact Details -->
      <section class="panel-section">
        <div class="section-header vertical-bar">
          <h3>Contact Details</h3>
        </div>
        <div class="section-content">
          <div class="contact-item" v-if="lead.website">
            <label>Website</label>
            <a :href="lead.website" target="_blank" class="contact-link">
              {{ lead.website }}
            </a>
            <button @click="copyToClipboard(lead.website)" class="copy-btn">Copy</button>
          </div>
          
          <div class="contact-item" v-if="lead.emails?.length > 0">
            <label>Emails</label>
            <div v-for="(email, idx) in lead.emails" :key="idx" class="email-row">
              <a :href="`mailto:${email.email}`" class="contact-link">{{ email.email }}</a>
              <button @click="copyToClipboard(email.email)" class="copy-btn">Copy</button>
            </div>
          </div>
          
          <div class="contact-item" v-if="lead.phoneNumbers?.length > 0">
            <label>Phone Numbers</label>
            <div v-for="(phone, idx) in lead.phoneNumbers" :key="idx" class="phone-row">
              <a :href="`tel:${phone.phone}`" class="contact-link">{{ phone.formatted || phone.phone }}</a>
              <button @click="copyToClipboard(phone.formatted || phone.phone)" class="copy-btn">Copy</button>
              <a
                v-if="phone.formatted || phone.phone"
                :href="`https://wa.me/${phone.phone.replace(/[^\d]/g, '')}`"
                target="_blank"
                class="whatsapp-btn"
              >
                WhatsApp
              </a>
            </div>
          </div>
          
          <div class="contact-item" v-if="lead.address">
            <label>Address</label>
            <div>{{ lead.address }}</div>
          </div>
        </div>
      </section>

      <!-- Social Media -->
      <section class="panel-section" v-if="hasSocials">
        <div class="section-header vertical-bar">
          <h3>Social Media</h3>
        </div>
        <div class="section-content">
          <div class="social-links">
            <a
              v-if="lead.socials?.linkedin"
              :href="lead.socials.linkedin"
              target="_blank"
              class="social-link"
            >
              LinkedIn
            </a>
            <a
              v-if="lead.socials?.twitter"
              :href="lead.socials.twitter"
              target="_blank"
              class="social-link"
            >
              Twitter
            </a>
            <a
              v-if="lead.socials?.facebook"
              :href="lead.socials.facebook"
              target="_blank"
              class="social-link"
            >
              Facebook
            </a>
            <a
              v-if="lead.socials?.instagram"
              :href="lead.socials.instagram"
              target="_blank"
              class="social-link"
            >
              Instagram
            </a>
          </div>
        </div>
      </section>

      <!-- Outreach Assistant -->
      <section class="panel-section">
        <div class="section-header vertical-bar">
          <h3>Outreach Assistant</h3>
        </div>
        <div class="section-content">
          <OutreachAssistant
            :lead="lead"
            :search-query="searchQuery"
            @generate="generateOutreach"
            @copied="$emit('copied', $event)"
          />
        </div>
      </section>
    </div>
  </div>

  <!-- Overlay -->
  <div v-if="isOpen" class="overlay" @click="close"></div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import OutreachAssistant from './OutreachAssistant.vue';

const props = defineProps({
  lead: {
    type: Object,
    required: true
  },
  searchQuery: {
    type: String,
    default: ''
  },
  allLeads: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'navigate-lead', 'copied']);

const isOpen = ref(true);

const hasSocials = computed(() => {
  return props.lead.socials && Object.values(props.lead.socials).some(v => v);
});

const currentLeadIndex = computed(() => {
  if (!props.allLeads || props.allLeads.length === 0) return -1;
  return props.allLeads.findIndex(l => l._id === props.lead._id);
});

const totalLeads = computed(() => {
  return props.allLeads?.length || 0;
});

const hasPrevious = computed(() => {
  return currentLeadIndex.value > 0;
});

const hasNext = computed(() => {
  return currentLeadIndex.value >= 0 && currentLeadIndex.value < totalLeads.value - 1;
});

const showNavigation = computed(() => {
  return totalLeads.value > 1;
});

watch(() => props.lead, () => {
  isOpen.value = true;
});

// ESC key handler
function handleKeydown(event) {
  if (event.key === 'Escape' && isOpen.value) {
    close();
  }
}

// Keyboard navigation (arrow keys)
function handleKeydownNav(event) {
  if (!isOpen.value) return;
  
  if (event.key === 'ArrowLeft' && hasPrevious.value) {
    event.preventDefault();
    navigateToLead('prev');
  } else if (event.key === 'ArrowRight' && hasNext.value) {
    event.preventDefault();
    navigateToLead('next');
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('keydown', handleKeydownNav);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('keydown', handleKeydownNav);
});

function close() {
  isOpen.value = false;
  setTimeout(() => {
    emit('close');
    // Scroll to top of results when closing
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 300);
}

function goBack() {
  close();
}

function navigateToLead(direction) {
  if (!showNavigation.value) return;
  
  let newIndex;
  if (direction === 'prev' && hasPrevious.value) {
    newIndex = currentLeadIndex.value - 1;
  } else if (direction === 'next' && hasNext.value) {
    newIndex = currentLeadIndex.value + 1;
  } else {
    return;
  }
  
  const newLead = props.allLeads[newIndex];
  if (newLead) {
    emit('navigate-lead', newLead);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Emit copy event for toast notification
    emit('copied', { type: 'success', message: 'Copied to clipboard' });
  }).catch(err => {
    console.error('Failed to copy:', err);
    emit('copied', { type: 'error', message: 'Failed to copy' });
  });
}

async function generateOutreach() {
  // Handled by OutreachAssistant component
}

function getQualityClass(score) {
  if (score >= 5) return 'quality-high';
  if (score >= 3) return 'quality-medium';
  if (score >= 1) return 'quality-low';
  return 'quality-very-low';
}

function getQualityLabel(score) {
  if (score >= 5) return 'High';
  if (score >= 3) return 'Medium';
  if (score >= 1) return 'Low';
  return 'Very Low';
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

function getVerificationClass(score) {
  if (score >= 5) return 'verification-high';
  if (score >= 3) return 'verification-medium';
  if (score >= 1) return 'verification-low';
  return 'verification-very-low';
}

function getVerificationLabel(score) {
  if (score >= 5) return 'Highly Verified';
  if (score >= 3) return 'Verified';
  if (score >= 1) return 'Partially Verified';
  return 'Unverified';
}
</script>

<style scoped>
.panel {
  padding: var(--spacing-xl);
}

.panel-breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
  font-size: 0.875rem;
  padding-bottom: var(--spacing-sm);
  border-bottom: var(--border-thin) solid var(--neutral-2);
}

.breadcrumb-link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  text-decoration: none;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.875rem;
}

.breadcrumb-link:hover {
  text-decoration: underline;
}

.breadcrumb-separator {
  color: var(--neutral-3);
  font-weight: var(--font-weight-bold);
}

.breadcrumb-current {
  color: var(--neutral-2);
  font-weight: var(--font-weight-semibold);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: var(--border-thick) solid var(--neutral-2);
  gap: var(--spacing-md);
}

.panel-header-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.panel-header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.btn-back {
  align-self: flex-start;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: var(--border-medium) solid var(--neutral-2);
  background: white;
  color: var(--neutral-2);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: var(--font-weight-semibold);
  transition: all 0.2s linear;
  margin-bottom: var(--spacing-xs);
}

.btn-back:hover {
  background: var(--neutral-1);
  border-color: var(--accent);
  color: var(--accent);
}

.search-context {
  font-size: 0.875rem;
  color: var(--neutral-3);
  font-style: italic;
}

.lead-navigation {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs);
  border: var(--border-thin) solid var(--neutral-2);
}

.btn-nav {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: var(--neutral-2);
  padding: var(--spacing-xs);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s linear;
}

.btn-nav:hover:not(:disabled) {
  background: var(--neutral-1);
  color: var(--accent);
}

.btn-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-counter {
  font-size: 0.875rem;
  color: var(--neutral-3);
  min-width: 50px;
  text-align: center;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: var(--neutral-2);
  line-height: 1;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--neutral-1);
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.section-header {
  margin-bottom: var(--spacing-sm);
}

.section-header h3 {
  font-size: 1.25rem;
}

.section-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.info-grid {
  margin-bottom: var(--spacing-md);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.info-item label {
  font-weight: var(--font-weight-semibold);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--neutral-1);
  border: var(--border-thin) solid var(--neutral-2);
}

.contact-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border: var(--border-thin) solid var(--neutral-2);
}

.contact-item label {
  font-weight: var(--font-weight-semibold);
  font-size: 0.875rem;
  text-transform: uppercase;
}

.email-row,
.phone-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.contact-link {
  color: var(--accent);
  text-decoration: none;
  flex: 1;
}

.contact-link:hover {
  text-decoration: underline;
}

.copy-btn,
.whatsapp-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.875rem;
  border: var(--border-thin) solid var(--neutral-2);
  background: white;
  cursor: pointer;
  min-width: auto;
}

.whatsapp-btn {
  color: #25D366;
  border-color: #25D366;
}

.whatsapp-btn:hover {
  background: #25D366;
  color: white;
}

.social-links {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.social-link {
  padding: var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  text-decoration: none;
  color: var(--neutral-2);
  text-align: center;
  font-weight: var(--font-weight-semibold);
  transition: background 0.2s linear;
}

.social-link:hover {
  background: var(--neutral-1);
}

.score-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.score-display .score-bar {
  flex: 1;
  max-width: 150px;
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  z-index: 999;
}

.enrichment-notice {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  background: #fff3cd;
  border: var(--border-medium) solid #ffc107;
  color: #856404;
}

.enrichment-notice p {
  margin: 0;
  line-height: 1.6;
}

.quality-label,
.verification-label {
  display: inline-block;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-weight: var(--font-weight-semibold);
  border: var(--border-thin) solid;
  margin-left: var(--spacing-xs);
}

.quality-label.quality-high,
.verification-label.verification-high {
  background: #d4edda;
  color: #155724;
  border-color: #28a745;
}

.quality-label.quality-medium,
.verification-label.verification-medium {
  background: #fff3cd;
  color: #856404;
  border-color: #ffc107;
}

.quality-label.quality-low,
.verification-label.verification-low {
  background: #f8d7da;
  color: #721c24;
  border-color: #dc3545;
}

.quality-label.quality-very-low,
.verification-label.verification-very-low {
  background: #e2e3e5;
  color: #383d41;
  border-color: #6c757d;
}

.score-bar-fill.quality-high {
  background: #28a745;
}

.score-bar-fill.quality-medium {
  background: #ffc107;
}

.score-bar-fill.quality-low {
  background: #dc3545;
}

.score-bar-fill.quality-very-low {
  background: #6c757d;
}

.score-bar-fill.verification-high {
  background: #28a745;
}

.score-bar-fill.verification-medium {
  background: #ffc107;
}

.score-bar-fill.verification-low {
  background: #dc3545;
}

.score-bar-fill.verification-very-low {
  background: #6c757d;
}

.verification-sources {
  margin-top: var(--spacing-xs);
  color: #666;
  font-size: 0.75rem;
}

.help-icon {
  display: inline-block;
  margin-left: var(--spacing-xs);
  cursor: help;
  font-size: 0.9rem;
  opacity: 0.7;
}

.help-icon:hover {
  opacity: 1;
}

.score-explanation {
  margin-top: var(--spacing-xs);
  font-size: 0.75rem;
  color: #666;
  font-style: italic;
  line-height: 1.4;
}
</style>

