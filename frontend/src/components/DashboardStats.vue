<template>
  <div class="dashboard-stats">
    <div class="stats-grid grid grid-4">
      <!-- Total Searches -->
      <div class="stat-card geometric-block">
        <div class="stat-label">Total Searches</div>
        <div class="stat-value">{{ stats.searches?.total || 0 }}</div>
        <div class="stat-subtitle">{{ stats.searches?.completed || 0 }} completed</div>
      </div>

      <!-- Total Leads -->
      <div class="stat-card geometric-block">
        <div class="stat-label">Total Leads</div>
        <div class="stat-value">{{ stats.leads?.total || 0 }}</div>
        <div class="stat-subtitle">{{ stats.leads?.enriched || 0 }} enriched</div>
      </div>

      <!-- High Signal Leads -->
      <div class="stat-card geometric-block">
        <div class="stat-label">High Signal Leads</div>
        <div class="stat-value">{{ stats.leads?.highSignal || 0 }}</div>
        <div class="stat-subtitle">Score ≥ 70</div>
      </div>

      <!-- Templates -->
      <div class="stat-card geometric-block">
        <div class="stat-label">Templates</div>
        <div class="stat-value">{{ stats.templates?.total || 0 }}</div>
        <div class="stat-subtitle">Saved searches</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  stats: {
    type: Object,
    required: true
  }
});
</script>

<style scoped>
.dashboard-stats {
  margin-bottom: var(--spacing-xl);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-lg);
}

.stat-card {
  padding: var(--spacing-lg);
  border: var(--border-medium) solid var(--neutral-2);
  text-align: center;
}

.stat-label {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin-bottom: var(--spacing-sm);
  font-weight: var(--font-weight-semibold);
}

.stat-value {
  font-size: 2.5rem;
  font-weight: var(--font-weight-bold);
  color: var(--neutral-2);
  line-height: 1;
  margin-bottom: var(--spacing-xs);
}

.stat-subtitle {
  font-size: 0.875rem;
  color: #666;
  margin-top: var(--spacing-xs);
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .stat-value {
    font-size: 2rem;
  }
}
</style>

