<template>
  <div class="outreach-assistant">
    <!-- Generate Button -->
    <button
      v-if="!outreach"
      @click="generate"
      class="btn btn-accent"
      :disabled="generating"
    >
      {{ generating ? 'Generating...' : 'Generate Outreach Lines' }}
    </button>

    <!-- Outreach Tiles - Four tall tiles -->
    <div v-if="outreach" class="outreach-tiles grid grid-2">
      <div class="outreach-tile">
        <div class="tile-header">
          <h4>One-Line Intro</h4>
        </div>
        <div class="tile-content">
          <p>{{ outreach.intro }}</p>
          <button @click="copyToClipboard(outreach.intro)" class="copy-btn">Copy</button>
        </div>
      </div>

      <div class="outreach-tile">
        <div class="tile-header">
          <h4>WhatsApp Opener</h4>
        </div>
        <div class="tile-content">
          <p>{{ outreach.whatsapp }}</p>
          <button @click="copyToClipboard(outreach.whatsapp)" class="copy-btn">Copy</button>
        </div>
      </div>

      <div class="outreach-tile">
        <div class="tile-header">
          <h4>Email Opener</h4>
        </div>
        <div class="tile-content">
          <pre>{{ outreach.email }}</pre>
          <button @click="copyToClipboard(outreach.email)" class="copy-btn">Copy</button>
        </div>
      </div>

      <div class="outreach-tile">
        <div class="tile-header">
          <h4>Call Script</h4>
        </div>
        <div class="tile-content">
          <p>{{ outreach.callScript }}</p>
          <button @click="copyToClipboard(outreach.callScript)" class="copy-btn">Copy</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../services/api';

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

const emit = defineEmits(['generate', 'copied']);

const outreach = ref(null);
const generating = ref(false);

async function generate() {
  generating.value = true;
  
  try {
    // Send richer context so the backend can craft higher-quality outreach
    const response = await api.post(`/leads/${props.lead._id}/outreach`, {
      searchQuery: props.searchQuery,
      companyName: props.lead.companyName,
      website: props.lead.website,
      location: props.lead.address,
      industry: props.lead.enrichment?.industry,
      aboutText: props.lead.aboutText,
      phones: (props.lead.phoneNumbers || []).map(p => p.formatted || p.phone),
      emails: (props.lead.emails || []).map(e => e.email),
      decisionMakers: props.lead.decisionMakers || [],
      enrichment: props.lead.enrichment || null
    });
    
    outreach.value = response.data;
    emit('generate', outreach.value);
  } catch (error) {
    console.error('Error generating outreach:', error);
    alert('Failed to generate outreach. Please try again.');
  } finally {
    generating.value = false;
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('Copied:', text);
    // Emit toast notification (parent will handle)
    emit('copied', { type: 'success', message: 'Copied to clipboard' });
  }).catch(err => {
    console.error('Failed to copy:', err);
    emit('copied', { type: 'error', message: 'Failed to copy' });
  });
}
</script>

<style scoped>
.outreach-assistant {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.outreach-tiles {
  gap: var(--spacing-md);
}

.outreach-tile {
  border: var(--border-thick) solid var(--neutral-2);
  background: white;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.tile-header {
  border-bottom: var(--border-thick) solid var(--neutral-2);
  padding: var(--spacing-md);
  background: var(--neutral-1);
}

.tile-header h4 {
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tile-content {
  padding: var(--spacing-md);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.tile-content p,
.tile-content pre {
  flex: 1;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.tile-content pre {
  font-family: var(--font-family);
  font-size: 0.875rem;
  line-height: 1.6;
}

.copy-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-thin) solid var(--neutral-2);
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
  min-width: auto;
  align-self: flex-start;
}

.copy-btn:hover {
  background: var(--neutral-1);
}
</style>

