<template>
  <div class="landing">
    <!-- Hero Section - Stella geometric -->
    <section class="hero horizontal-band">
      <div class="container">
        <div class="hero-content">
          <h1 class="hero-title">coralgen</h1>
          <p class="hero-subtitle">B2B Lead Discovery. Structured. Fast.</p>
          <p class="hero-description">
            Search. Extract. Enrich. Action.<br>
            Turn any business query into a complete lead list in 25 seconds.
          </p>
          <div class="hero-actions">
            <router-link to="/signin" class="btn btn-accent">Get Started</router-link>
            <router-link to="/login" class="btn">Sign In</router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- Value Proposition Section -->
    <section class="value-prop">
      <div class="container">
        <div class="value-prop-content geometric-block">
          <h2 class="section-title">Why coralgen?</h2>
          <p class="value-prop-lead">
            Hours of manual searching. Scattered contact details. Blank outreach pages.<br>
            We turn that workflow into 25 seconds. Structured. Complete. Ready.
          </p>
          
          <div class="value-points">
            <div class="value-point-row">
              <div class="value-point geometric-block">
                <div class="value-point-stripe"></div>
                <div class="value-point-content">
                  <h3>SPEED</h3>
                  <p>25 seconds from search to structured lead list. No hours wasted on manual collection. Start outreach immediately.</p>
                </div>
              </div>
              
              <div class="value-point geometric-block">
                <div class="value-point-stripe stripe-alt"></div>
                <div class="value-point-content">
                  <h3>LOW COST</h3>
                  <p>Pay for what you use. No enterprise contracts. Scale as you grow. Affordable from day one.</p>
                </div>
              </div>
            </div>
            
            <div class="value-point-row">
              <div class="value-point geometric-block">
                <div class="value-point-stripe stripe-alt-2"></div>
                <div class="value-point-content">
                  <h3>ACTION-READY</h3>
                  <p>Every lead includes outreach templates. WhatsApp. Email. Call scripts. No blank pages. No guesswork.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features">
      <div class="container">
        <h2 class="section-title">Search → Extract → Enrich → Action</h2>
        
        <div class="features-grid grid grid-2">
          <div class="feature-block geometric-block">
            <h3>Search</h3>
            <p>Query any business category. Filter by country and location. Generate lead candidates instantly.</p>
          </div>
          
          <div class="feature-block geometric-block">
            <h3>Extract</h3>
            <p>Convert results into structured data. Emails. Phones. Socials. Websites. Addresses.</p>
          </div>
          
          <div class="feature-block geometric-block">
            <h3>Enrich</h3>
            <p>Use AI to discover decision makers, infer email patterns, and prioritize prospects.</p>
          </div>
          
          <div class="feature-block geometric-block">
            <h3>Action</h3>
            <p>Ready-made outreach emails and WhatsApp messages. Export to CSV/XLSX. Integrations coming soon.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Competitive Advantages Section -->
    <section class="competitive horizontal-band">
      <div class="container">
        <h2 class="section-title">How We Stand Out</h2>
        
        <div class="comparison-grid">
          <div class="comparison-block geometric-block">
            <div class="comparison-header">
              <h3>Other Tools</h3>
            </div>
            <ul class="comparison-list">
              <li><span class="comparison-marker">—</span> Expensive monthly subscriptions</li>
              <li><span class="comparison-marker">—</span> Built for Western markets</li>
              <li><span class="comparison-marker">—</span> Complex setup, requires training</li>
              <li><span class="comparison-marker">—</span> Slow processing times</li>
              <li><span class="comparison-marker">—</span> Generic outreach templates</li>
              <li><span class="comparison-marker">—</span> No location-specific filtering</li>
              <li><span class="comparison-marker">—</span> Poor African phone number handling</li>
            </ul>
          </div>
          
          <div class="comparison-block geometric-block comparison-onalog">
            <div class="comparison-header">
              <h3>Onalog</h3>
            </div>
            <ul class="comparison-list">
              <li><span class="comparison-marker onalog-marker">+</span> Low-cost, pay-as-you-scale</li>
              <li><span class="comparison-marker onalog-marker">+</span> Built specifically for African B2B</li>
              <li><span class="comparison-marker onalog-marker">+</span> Simple, intuitive interface</li>
              <li><span class="comparison-marker onalog-marker">+</span> 25-second search to results</li>
              <li><span class="comparison-marker onalog-marker">+</span> AI-generated, context-aware outreach</li>
              <li><span class="comparison-marker onalog-marker">+</span> Country + location drill-down</li>
              <li><span class="comparison-marker onalog-marker">+</span> Smart African phone formatting</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta">
      <div class="container">
        <div class="cta-content geometric-block">
          <h2>Start generating leads in minutes</h2>
          <p>Sign up and run your first search with coralgen now.</p>
          <div class="cta-actions">
            <router-link to="/signin" class="btn btn-accent">Get Started</router-link>
            <router-link to="/login" class="btn">Sign In</router-link>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
// Landing page - no logic needed
</script>

<style scoped>
.landing {
  min-height: 100vh;
}

.hero {
  padding: var(--spacing-xxl) 0;
  margin-bottom: 0;
  border-bottom: var(--border-thick) solid var(--neutral-2);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
}

.hero-content {
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
}

.hero-title {
  font-size: 4rem;
  margin-bottom: var(--spacing-lg);
  line-height: 1.1;
}

.hero-subtitle {
  font-size: 1.5rem;
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-md);
  color: var(--neutral-2);
}

.hero-description {
  font-size: 1.125rem;
  line-height: 1.8;
  margin-bottom: var(--spacing-xl);
  color: #666;
}

.hero-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
}

.features {
  padding: var(--spacing-xxl) 0;
  border-top: var(--border-thick) solid var(--neutral-2);
  border-bottom: var(--border-thick) solid var(--neutral-2);
}

.section-title {
  text-align: center;
  margin-bottom: var(--spacing-xl);
  font-size: 2.5rem;
}

.features-grid {
  gap: var(--spacing-lg);
  margin-top: var(--spacing-xl);
}

.feature-block {
  padding: 0;
  min-height: 250px;
  display: flex;
  flex-direction: column;
  border: var(--border-thick) solid var(--neutral-2);
  position: relative;
}

.feature-block:nth-child(1) {
  border-right: var(--border-thick) solid var(--neutral-2);
}

.feature-block:nth-child(2) {
  border-left: none;
}

.feature-block:nth-child(3) {
  border-right: var(--border-thick) solid var(--neutral-2);
  border-top: var(--border-thick) solid var(--neutral-2);
}

.feature-block:nth-child(4) {
  border-left: none;
  border-top: var(--border-thick) solid var(--neutral-2);
}

.feature-block::before {
  content: '';
  width: 100%;
  height: 50px;
  background: var(--accent);
  border-bottom: var(--border-thick) solid var(--neutral-2);
}

.feature-block:nth-child(2)::before {
  background: var(--stripe-1);
}

.feature-block:nth-child(3)::before {
  background: var(--stripe-2);
}

.feature-block:nth-child(4)::before {
  background: var(--accent);
}

.feature-block h3 {
  font-size: 1.5rem;
  margin: 0;
  padding: var(--spacing-lg);
  border-bottom: var(--border-medium) solid var(--neutral-2);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.feature-block p {
  flex: 1;
  line-height: 1.6;
  color: var(--neutral-2);
  padding: var(--spacing-lg);
  margin: 0;
}

.cta {
  padding: var(--spacing-xxl) 0;
  text-align: center;
  margin-top: var(--spacing-xxl);
}

.cta h2 {
  font-size: 2.5rem;
  margin-bottom: var(--spacing-lg);
}

/* Value Proposition - Stella Geometric */
.value-prop {
  padding: var(--spacing-xxl) 0;
  background: var(--neutral-1);
}

.value-prop-content {
  padding: var(--spacing-xxl);
  border: var(--border-thick) solid var(--neutral-2);
}

.value-prop-lead {
  font-size: 1.125rem;
  line-height: 1.6;
  text-align: left;
  max-width: none;
  margin: 0 0 var(--spacing-xl) 0;
  color: var(--neutral-2);
  font-weight: var(--font-weight-regular);
  border-bottom: var(--border-thick) solid var(--neutral-2);
  padding-bottom: var(--spacing-lg);
}

.value-points {
  display: flex;
  flex-direction: column;
  gap: var(--border-thick);
  margin-top: var(--spacing-xl);
}

.value-point-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--border-thick);
}

.value-point-row:last-child {
  grid-template-columns: 1fr;
  max-width: 50%;
}

.value-point {
  padding: 0;
  border: var(--border-thick) solid var(--neutral-2);
  background: var(--neutral-1);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.value-point-stripe {
  width: 100%;
  height: 40px;
  background: var(--accent);
  border-bottom: var(--border-thick) solid var(--neutral-2);
}

.value-point-stripe.stripe-alt {
  background: var(--stripe-1);
}

.value-point-stripe.stripe-alt-2 {
  background: var(--stripe-2);
}

.value-point-content {
  padding: var(--spacing-lg);
  flex: 1;
  display: flex;
  flex-direction: column;
}

.value-point-content h3 {
  font-size: 1.5rem;
  margin: 0 0 var(--spacing-md) 0;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-bottom: var(--border-medium) solid var(--neutral-2);
  padding-bottom: var(--spacing-sm);
}

.value-point-content p {
  line-height: 1.6;
  color: var(--neutral-2);
  margin: 0;
  flex: 1;
}

/* Competitive Advantages - Stella Grid */
.competitive {
  padding: var(--spacing-xxl) 0;
  margin-top: var(--spacing-xxl);
  background: var(--neutral-1);
}

.comparison-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--border-thick);
  margin-top: var(--spacing-xl);
}

.comparison-block {
  padding: 0;
  border: var(--border-thick) solid var(--neutral-2);
  background: var(--neutral-1);
}

.comparison-header {
  border-bottom: var(--border-thick) solid var(--neutral-2);
  padding: var(--spacing-lg);
  background: var(--neutral-1);
}

.comparison-header h3 {
  font-size: 1.75rem;
  margin: 0;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.comparison-onalog .comparison-header {
  background: var(--accent);
  color: var(--neutral-1);
}

.comparison-list {
  list-style: none;
  padding: var(--spacing-lg);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.comparison-list li {
  padding: var(--spacing-md) 0;
  line-height: 1.6;
  font-size: 1rem;
  border-bottom: var(--border-thin) solid var(--neutral-2);
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
}

.comparison-list li:last-child {
  border-bottom: none;
}

.comparison-marker {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: var(--border-medium) solid var(--neutral-2);
  background: var(--neutral-1);
  text-align: center;
  line-height: 24px;
  font-weight: var(--font-weight-bold);
  font-size: 1.25rem;
  flex-shrink: 0;
}

.comparison-marker.onalog-marker {
  background: var(--accent);
  color: var(--neutral-1);
  border-color: var(--neutral-2);
}

.comparison-onalog .comparison-list li {
  color: var(--neutral-2);
  font-weight: var(--font-weight-regular);
}

@media (max-width: 768px) {
  .comparison-grid {
    grid-template-columns: 1fr;
  }
  
  .value-point-row {
    grid-template-columns: 1fr;
  }
  
  .features-grid {
    grid-template-columns: 1fr;
  }
  
  .feature-block {
    border: var(--border-thick) solid var(--neutral-2) !important;
    border-top: var(--border-thick) solid var(--neutral-2) !important;
  }
}
</style>

