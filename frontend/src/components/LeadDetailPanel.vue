<template>
  <div class="panel" :class="{ closed: !isOpen }">
    <div class="panel-header">
      <h2>{{ lead.companyName }}</h2>
      <button @click="close" class="close-btn">×</button>
    </div>

    <div class="panel-content">
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
          />
        </div>
      </section>
    </div>
  </div>

  <!-- Overlay -->
  <div v-if="isOpen" class="overlay" @click="close"></div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import OutreachAssistant from './OutreachAssistant.vue';

const props = defineProps({
  lead: {
    type: Object,
    required: true
  },
  searchQuery: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close']);

const isOpen = ref(true);

const hasSocials = computed(() => {
  return props.lead.socials && Object.values(props.lead.socials).some(v => v);
});

watch(() => props.lead, () => {
  isOpen.value = true;
});

function close() {
  isOpen.value = false;
  setTimeout(() => {
    emit('close');
  }, 300);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Could add toast notification here
    console.log('Copied:', text);
  });
}

async function generateOutreach() {
  // Handled by OutreachAssistant component
}
</script>

<style scoped>
.panel {
  padding: var(--spacing-xl);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: var(--border-thick) solid var(--neutral-2);
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
</style>

