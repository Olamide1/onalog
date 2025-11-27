<template>
  <div class="admin-dashboard">
    <!-- Header - Stella horizontal band -->
    <header class="admin-header horizontal-band">
      <div class="container">
        <div class="header-content">
          <h1>Admin Dashboard</h1>
          <div class="header-controls">
            <select v-model="selectedPeriod" @change="loadMetrics" class="input period-select">
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
            <button @click="loadMetrics" class="btn" :disabled="loading">
              {{ loading ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="container admin-content">
      <!-- Loading State -->
      <div v-if="loading && !metrics" class="geometric-block loading-state">
        <p>Loading metrics...</p>
      </div>

      <!-- Error State -->
      <div v-if="error" class="geometric-block error-state">
        <p class="error-message">{{ error }}</p>
        <button @click="loadMetrics" class="btn">Retry</button>
      </div>

      <!-- Metrics Display -->
      <div v-if="metrics && !loading" class="metrics-grid">
        <!-- Performance Reporting - Key Decision Metrics -->
        <section class="geometric-block metrics-section performance-report">
          <h2>Performance Report - Key Decision Metrics</h2>
          <p class="section-explainer">
            Critical metrics for business decisions. Monitor these to understand platform health, user engagement, and operational efficiency.
          </p>
          
          <div class="grid grid-3">
            <div class="kpi-card geometric-block-thin" :class="metrics.performance.searchHealth">
              <h3>Search Health</h3>
              <p class="kpi-value">{{ metrics.searches.successRate }}%</p>
              <p class="kpi-label">Success Rate</p>
              <p class="kpi-explainer">
                Percentage of searches that complete successfully. 
                <strong>Target: ≥80%</strong> indicates healthy system. 
                Below 60% requires investigation.
              </p>
              <div class="health-indicator" :class="metrics.performance.searchHealth">
                {{ metrics.performance.searchHealth === 'healthy' ? '✓ Healthy' : metrics.performance.searchHealth === 'warning' ? '⚠ Warning' : '✗ Critical' }}
              </div>
            </div>
            
            <div class="kpi-card geometric-block-thin" :class="metrics.performance.extractionHealth">
              <h3>Extraction Health</h3>
              <p class="kpi-value">{{ metrics.leads.extractionRate }}%</p>
              <p class="kpi-label">Extraction Rate</p>
              <p class="kpi-explainer">
                Percentage of leads with successfully extracted contact information. 
                <strong>Target: ≥70%</strong> for good data quality. 
                Low rates indicate extraction issues.
              </p>
              <div class="health-indicator" :class="metrics.performance.extractionHealth">
                {{ metrics.performance.extractionHealth === 'healthy' ? '✓ Healthy' : metrics.performance.extractionHealth === 'warning' ? '⚠ Warning' : '✗ Critical' }}
              </div>
            </div>
            
            <div class="kpi-card geometric-block-thin" :class="metrics.performance.enrichmentHealth">
              <h3>Enrichment Health</h3>
              <p class="kpi-value">{{ metrics.leads.enrichmentRate }}%</p>
              <p class="kpi-label">Enrichment Rate</p>
              <p class="kpi-explainer">
                Percentage of extracted leads that get AI enrichment. 
                <strong>Target: ≥60%</strong> for good coverage. 
                Low rates may indicate credit shortages or API issues.
              </p>
              <div class="health-indicator" :class="metrics.performance.enrichmentHealth">
                {{ metrics.performance.enrichmentHealth === 'healthy' ? '✓ Healthy' : metrics.performance.enrichmentHealth === 'warning' ? '⚠ Warning' : '✗ Critical' }}
              </div>
            </div>
          </div>
          
          <div class="grid grid-4">
            <div class="kpi-card geometric-block-thin">
              <h3>Avg Leads per Search</h3>
              <p class="kpi-value">{{ metrics.performance.avgLeadsPerSearch }}</p>
              <p class="kpi-explainer">
                Average number of leads generated per search. 
                Higher = better search quality. 
                <strong>Target: 15-30</strong> leads per search.
              </p>
            </div>
            
            <div class="kpi-card geometric-block-thin">
              <h3>Contact Quality Rate</h3>
              <p class="kpi-value">{{ metrics.performance.contactQualityRate }}%</p>
              <p class="kpi-explainer">
                Percentage of leads with emails or phone numbers. 
                <strong>Target: ≥50%</strong> for actionable leads. 
                Critical for outreach success.
              </p>
            </div>
            
            <div class="kpi-card geometric-block-thin">
              <h3>User Engagement</h3>
              <p class="kpi-value">{{ metrics.performance.avgSearchesPerUser }}</p>
              <p class="kpi-label">Searches per User</p>
              <p class="kpi-explainer">
                Average searches per user indicates platform stickiness. 
                <strong>Target: ≥3</strong> searches per user shows good retention.
              </p>
            </div>
            
            <div class="kpi-card geometric-block-thin">
              <h3>Revenue per User</h3>
              <p class="kpi-value">${{ metrics.performance.revenuePerUser }}</p>
              <p class="kpi-explainer">
                Average revenue generated per user. 
                Helps understand monetization effectiveness and pricing strategy.
              </p>
            </div>
          </div>
          
          <div class="grid grid-3">
            <div class="kpi-card geometric-block-thin">
              <h3>Leads per Credit</h3>
              <p class="kpi-value">{{ metrics.performance.leadsPerCredit }}</p>
              <p class="kpi-explainer">
                Efficiency metric: leads generated per credit consumed. 
                Higher = better cost efficiency. 
                <strong>Target: ≥1.0</strong> leads per credit.
              </p>
            </div>
            
            <div class="kpi-card geometric-block-thin">
              <h3>Avg Completion Time</h3>
              <p class="kpi-value">{{ metrics.performance.avgCompletionTimeMinutes }} min</p>
              <p class="kpi-explainer">
                Average time for searches to complete. 
                <strong>Target: 5-15 minutes</strong>. 
                Longer times may indicate bottlenecks or rate limiting.
              </p>
            </div>
            
            <div class="kpi-card geometric-block-thin">
              <h3>User Engagement Rate</h3>
              <p class="kpi-value">{{ metrics.performance.userEngagementRate }}%</p>
              <p class="kpi-explainer">
                Percentage of users who performed searches in this period. 
                <strong>Target: ≥30%</strong> indicates active user base. 
                Low rates suggest user onboarding issues.
              </p>
            </div>
          </div>
        </section>

        <!-- Overview Cards -->
        <section class="geometric-block metrics-section">
          <h2>Overview</h2>
          <p class="section-explainer">
            High-level platform statistics showing total counts and growth in the selected period.
          </p>
          <div class="grid grid-4">
            <div class="metric-card geometric-block-thin">
              <h3>Total Users</h3>
              <p class="metric-value">{{ metrics.users.total }}</p>
              <p class="metric-change">+{{ metrics.users.new }} new</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Total Companies</h3>
              <p class="metric-value">{{ metrics.companies.total }}</p>
              <p class="metric-change">+{{ metrics.companies.new }} new</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Total Searches</h3>
              <p class="metric-value">{{ metrics.searches.total }}</p>
              <p class="metric-change">{{ metrics.searches.inPeriod }} in period</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Total Leads</h3>
              <p class="metric-value">{{ metrics.leads.total }}</p>
              <p class="metric-change">{{ metrics.leads.inPeriod }} in period</p>
            </div>
          </div>
        </section>

        <!-- Search Metrics -->
        <section class="geometric-block metrics-section">
          <h2>Search Performance</h2>
          <p class="section-explainer">
            Metrics tracking search execution success, failure rates, and average results. 
            Monitor these to identify system issues, rate limiting problems, or search quality degradation.
          </p>
          <div class="grid grid-4">
            <div class="metric-card geometric-block-thin">
              <h3>Success Rate</h3>
              <p class="metric-value">{{ metrics.searches.successRate }}%</p>
              <p class="metric-detail">{{ metrics.searches.completed }} completed / {{ metrics.searches.inPeriod }} total</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Avg Results</h3>
              <p class="metric-value">{{ metrics.searches.avgResultsPerSearch }}</p>
              <p class="metric-detail">per search</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Failed Searches</h3>
              <p class="metric-value">{{ metrics.searches.failed }}</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Pending Searches</h3>
              <p class="metric-value">{{ metrics.searches.pending }}</p>
            </div>
          </div>
          
          <!-- Search Status Breakdown -->
          <div class="status-breakdown">
            <h3>Status Breakdown</h3>
            <div class="grid grid-3">
              <div v-for="(count, status) in metrics.searches.statusBreakdown" :key="status" class="status-item geometric-block-thin">
                <span class="status-label">{{ status }}</span>
                <span class="status-count">{{ count }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Lead Metrics -->
        <section class="geometric-block metrics-section">
          <h2>Lead Quality</h2>
          <p class="section-explainer">
            Data quality metrics showing extraction success, enrichment coverage, and contact information availability. 
            These directly impact lead usability and outreach success rates.
          </p>
          <div class="grid grid-4">
            <div class="metric-card geometric-block-thin">
              <h3>Extraction Rate</h3>
              <p class="metric-value">{{ metrics.leads.extractionRate }}%</p>
              <p class="metric-detail">{{ metrics.leads.extracted }} extracted</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Enrichment Rate</h3>
              <p class="metric-value">{{ metrics.leads.enrichmentRate }}%</p>
              <p class="metric-detail">{{ metrics.leads.enriched }} enriched</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>With Contacts</h3>
              <p class="metric-value">{{ metrics.leads.withContacts }}</p>
              <p class="metric-detail">{{ metrics.leads.withEmails }} emails, {{ metrics.leads.withPhones }} phones</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Duplicates</h3>
              <p class="metric-value">{{ metrics.leads.duplicates }}</p>
              <p class="metric-detail">{{ metrics.leads.duplicateRate }}% rate</p>
            </div>
          </div>
        </section>

        <!-- Revenue & Credits -->
        <section class="geometric-block metrics-section">
          <h2>Revenue & Credits</h2>
          <p class="section-explainer">
            Financial metrics tracking credit purchases, consumption, and revenue. 
            Monitor consumption rate to understand usage patterns and predict credit needs.
          </p>
          <div class="grid grid-4">
            <div class="metric-card geometric-block-thin">
              <h3>Total Revenue</h3>
              <p class="metric-value">${{ metrics.revenue.usd.toLocaleString() }}</p>
              <p class="metric-detail" v-if="metrics.revenue.ngn > 0">
                ₦{{ metrics.revenue.ngn.toLocaleString() }}
              </p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Credits Purchased</h3>
              <p class="metric-value">{{ metrics.credits.totalPurchased.toLocaleString() }}</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Credits Consumed</h3>
              <p class="metric-value">{{ metrics.credits.totalConsumed.toLocaleString() }}</p>
              <p class="metric-detail">{{ metrics.credits.consumptionRate }}% consumption rate</p>
            </div>
            <div class="metric-card geometric-block-thin">
              <h3>Active Balance</h3>
              <p class="metric-value">{{ metrics.credits.activeBalance.toLocaleString() }}</p>
            </div>
          </div>
        </section>

        <!-- Growth Trends -->
        <section class="geometric-block metrics-section">
          <h2>Growth Trends (Last 30 Days)</h2>
          <p class="section-explainer">
            Daily activity trends showing user growth, search volume, and lead generation over time. 
            Use this to identify growth patterns, seasonal trends, and forecast future demand.
          </p>
          <div class="trends-container">
            <div class="trend-item" v-for="day in metrics.trends.daily" :key="day.date">
              <div class="trend-date">{{ formatDate(day.date) }}</div>
              <div class="trend-bars">
                <div class="trend-bar users" :style="{ height: getBarHeight(day.users, maxUsers) + '%' }" :title="`Users: ${day.users}`"></div>
                <div class="trend-bar searches" :style="{ height: getBarHeight(day.searches, maxSearches) + '%' }" :title="`Searches: ${day.searches}`"></div>
                <div class="trend-bar leads" :style="{ height: getBarHeight(day.leads, maxLeads) + '%' }" :title="`Leads: ${day.leads}`"></div>
              </div>
            </div>
          </div>
          <div class="trend-legend">
            <span><span class="legend-color users"></span> Users</span>
            <span><span class="legend-color searches"></span> Searches</span>
            <span><span class="legend-color leads"></span> Leads</span>
          </div>
        </section>

        <!-- Top Users -->
        <section class="geometric-block metrics-section">
          <h2>Top Active Users</h2>
          <p class="section-explainer">
            Most engaged users by search and lead activity. 
            Identify power users for feedback, feature requests, or potential upsell opportunities.
          </p>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Searches</th>
                  <th>Leads</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in metrics.topUsers" :key="user.email">
                  <td>{{ user.name }}</td>
                  <td>{{ user.email }}</td>
                  <td><span class="role-badge" :class="user.role">{{ user.role }}</span></td>
                  <td>{{ user.totalSearches }}</td>
                  <td>{{ user.totalLeads }}</td>
                  <td>{{ formatDate(user.joinedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Distributions -->
        <section class="geometric-block metrics-section">
          <h2>Distributions</h2>
          <p class="section-explainer">
            Industry and company size breakdowns from enriched leads. 
            Helps understand market focus, target segments, and data quality across different business types.
          </p>
          <div class="grid grid-2">
            <div class="distribution-card geometric-block-thin">
              <h3>Top Industries</h3>
              <ul class="distribution-list">
                <li v-for="item in metrics.distributions.industries" :key="item.industry">
                  <span class="dist-label">{{ item.industry || 'Unknown' }}</span>
                  <span class="dist-count">{{ item.count }}</span>
                </li>
                <li v-if="metrics.distributions.industries.length === 0" class="empty-dist">
                  <span>No industry data available</span>
                </li>
              </ul>
            </div>
            <div class="distribution-card geometric-block-thin">
              <h3>Company Sizes</h3>
              <ul class="distribution-list">
                <li v-for="item in metrics.distributions.companySizes" :key="item.size">
                  <span class="dist-label">{{ item.size }}</span>
                  <span class="dist-count">{{ item.count }}</span>
                </li>
                <li v-if="metrics.distributions.companySizes.length === 0" class="empty-dist">
                  <span>No company size data available</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../services/api.js';

const metrics = ref(null);
const loading = ref(false);
const error = ref(null);
const selectedPeriod = ref('all');

const maxUsers = computed(() => {
  if (!metrics.value?.trends?.daily) return 1;
  return Math.max(...metrics.value.trends.daily.map(d => d.users), 1);
});

const maxSearches = computed(() => {
  if (!metrics.value?.trends?.daily) return 1;
  return Math.max(...metrics.value.trends.daily.map(d => d.searches), 1);
});

const maxLeads = computed(() => {
  if (!metrics.value?.trends?.daily) return 1;
  return Math.max(...metrics.value.trends.daily.map(d => d.leads), 1);
});

const loadMetrics = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await api.get('/admin/metrics', {
      params: { period: selectedPeriod.value }
    });
    metrics.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load metrics';
    console.error('Error loading metrics:', err);
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getBarHeight = (value, max) => {
  if (!max || max === 0) return 0;
  return Math.min((value / max) * 100, 100);
};

onMounted(() => {
  loadMetrics();
});
</script>

<style scoped>
.admin-dashboard {
  min-height: 100vh;
  background: var(--neutral-1);
}

.admin-header {
  background: var(--neutral-1);
  padding: var(--spacing-lg) 0;
}

.admin-header .container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.admin-header h1 {
  margin: 0;
  font-size: 2rem;
}

.header-controls {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
}

.period-select {
  width: auto;
  min-width: 150px;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
}

.admin-content {
  padding: var(--spacing-xl) 0;
}

.loading-state,
.error-state {
  text-align: center;
  padding: var(--spacing-xxl);
}

.error-message {
  color: var(--accent);
  font-size: 1.2rem;
  margin-bottom: var(--spacing-md);
}

.metrics-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.metrics-section {
  padding: var(--spacing-xl);
}

.metrics-section h2 {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 1.5rem;
  border-bottom: var(--border-thick) solid var(--neutral-2);
  padding-bottom: var(--spacing-sm);
}

.section-explainer {
  margin: var(--spacing-md) 0 var(--spacing-lg) 0;
  color: #666;
  font-size: 0.9rem;
  line-height: 1.5;
}

.performance-report {
  background: var(--neutral-1);
  border: var(--border-thick) solid var(--accent);
}

.kpi-card {
  padding: var(--spacing-lg);
  position: relative;
}

.kpi-card.healthy {
  border-left: var(--border-thick) solid #27ae60;
}

.kpi-card.warning {
  border-left: var(--border-thick) solid #f39c12;
}

.kpi-card.critical {
  border-left: var(--border-thick) solid var(--accent);
}

.kpi-value {
  font-size: 2.5rem;
  font-weight: var(--font-weight-bold);
  margin: var(--spacing-sm) 0;
  color: var(--neutral-2);
}

.kpi-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #666;
  margin: var(--spacing-xs) 0;
}

.kpi-explainer {
  font-size: 0.85rem;
  line-height: 1.5;
  color: #666;
  margin: var(--spacing-md) 0 0 0;
}

.kpi-explainer strong {
  color: var(--neutral-2);
  font-weight: var(--font-weight-semibold);
}

.health-indicator {
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.75rem;
  font-weight: var(--font-weight-semibold);
  border: var(--border-medium) solid;
}

.health-indicator.healthy {
  background: #d4edda;
  color: #155724;
  border-color: #27ae60;
}

.health-indicator.warning {
  background: #fff3cd;
  color: #856404;
  border-color: #f39c12;
}

.health-indicator.critical {
  background: #f8d7da;
  color: #721c24;
  border-color: var(--accent);
}

.metric-card {
  padding: var(--spacing-lg);
  text-align: center;
}

.metric-card h3 {
  margin: 0 0 var(--spacing-md) 0;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: var(--font-weight-semibold);
}

.metric-value {
  font-size: 2.5rem;
  font-weight: var(--font-weight-bold);
  margin: var(--spacing-sm) 0;
}

.metric-change {
  color: var(--accent);
  font-size: 0.9rem;
  margin: var(--spacing-sm) 0 0 0;
}

.metric-detail {
  font-size: 0.85rem;
  margin: var(--spacing-sm) 0 0 0;
}

.status-breakdown {
  margin-top: var(--spacing-lg);
}

.status-breakdown h3 {
  margin: 0 0 var(--spacing-md) 0;
  font-size: 1.1rem;
}

.status-item {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-md);
}

.status-label {
  text-transform: capitalize;
}

.status-count {
  font-weight: var(--font-weight-bold);
}

.trends-container {
  display: flex;
  gap: var(--spacing-xs);
  align-items: flex-end;
  height: 200px;
  margin: var(--spacing-lg) 0;
  padding: var(--spacing-md);
  background: var(--neutral-1);
  border: var(--border-medium) solid var(--neutral-2);
  overflow-x: auto;
}

.trend-item {
  flex: 1;
  min-width: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.trend-date {
  font-size: 0.7rem;
  margin-bottom: var(--spacing-sm);
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.trend-bars {
  display: flex;
  gap: 2px;
  width: 100%;
  height: calc(100% - 30px);
  align-items: flex-end;
}

.trend-bar {
  flex: 1;
  min-height: 4px;
  border-radius: 0;
  transition: opacity 0.2s linear;
}

.trend-bar:hover {
  opacity: 0.8;
}

.trend-bar.users {
  background: var(--accent);
}

.trend-bar.searches {
  background: var(--stripe-2);
}

.trend-bar.leads {
  background: var(--stripe-1);
}

.trend-legend {
  display: flex;
  gap: var(--spacing-lg);
  justify-content: center;
  margin-top: var(--spacing-md);
}

.legend-color {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: var(--spacing-sm);
  border: var(--border-thin) solid var(--neutral-2);
}

.legend-color.users {
  background: var(--accent);
}

.legend-color.searches {
  background: var(--stripe-2);
}

.legend-color.leads {
  background: var(--stripe-1);
}

.table-container {
  overflow-x: auto;
  margin-top: var(--spacing-md);
}

.role-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-md);
  border: var(--border-medium) solid var(--neutral-2);
  font-size: 0.85rem;
  font-weight: var(--font-weight-semibold);
}

.role-badge.admin {
  background: var(--accent);
  color: var(--neutral-1);
  border-color: var(--accent);
}

.distribution-card {
  padding: var(--spacing-lg);
}

.distribution-card h3 {
  margin: 0 0 var(--spacing-md) 0;
  font-size: 1.1rem;
}

.distribution-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.distribution-list li {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-md) 0;
  border-bottom: var(--border-thin) solid var(--neutral-2);
}

.distribution-list li:last-child {
  border-bottom: none;
}

.empty-dist {
  color: #666;
  font-style: italic;
}

.dist-label {
  text-transform: capitalize;
}

.dist-count {
  font-weight: var(--font-weight-bold);
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .grid-4 {
    grid-template-columns: 1fr;
  }

  .grid-3 {
    grid-template-columns: 1fr;
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }

  .trends-container {
    height: 150px;
  }
}
</style>
