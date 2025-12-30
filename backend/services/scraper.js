/**
 * Hybrid Scraping Service
 * Intelligent fallback chain: ScraperAPI → Puppeteer (stealth) → Enhanced Fetch → Regular Fetch
 * Maintains quality while providing unlimited scraping capability
 */

import puppeteer from 'puppeteer';

// User-agent pool for rotation (realistic, up-to-date user agents)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

/**
 * Get a random user agent from the pool
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Enhanced stealth techniques for Puppeteer
 * Based on proven patterns from googlePlacesScraper.js
 */
async function setupStealthPage(page) {
  // Set realistic user agent
  await page.setUserAgent(getRandomUserAgent());
  
  // Advanced stealth techniques
  await page.evaluateOnNewDocument(() => {
    // Hide webdriver property
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    // Add chrome runtime
    window.chrome = { runtime: {} };
    
    // Fake plugins
    Object.defineProperty(navigator, 'plugins', { 
      get: () => [1, 2, 3, 4, 5] 
    });
    
    // Fake languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    
    // Hide automation indicators
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  });
  
  // Set realistic viewport
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Set realistic headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
  });
}

/**
 * Scrape using Puppeteer with enhanced stealth
 * Best for JavaScript-heavy sites and anti-bot protection
 */
async function scrapeWithPuppeteer(url, options = {}) {
  const {
    timeout = 20000,
    waitUntil = 'networkidle2'
  } = options;
  
  let browser = null;
  
  try {
    console.log(`[SCRAPER] Attempting Puppeteer scrape: ${url}`);
    
    // Launch browser with stealth settings
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ],
      timeout: 30000,
      ignoreHTTPSErrors: true
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeout);
    page.setDefaultTimeout(timeout);
    
    // Apply stealth techniques
    await setupStealthPage(page);
    
    // Navigate with realistic timing
    await page.goto(url, {
      waitUntil: waitUntil,
      timeout: timeout
    });
    
    // Wait a bit for dynamic content (randomized to look human)
    const randomDelay = Math.random() * 1000 + 500; // 500-1500ms
    await page.waitForTimeout(randomDelay);
    
    // Get HTML content
    const html = await page.content();
    
    await browser.close();
    browser = null;
    
    console.log(`[SCRAPER] ✅ Puppeteer scrape successful: ${url}`);
    return html;
    
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    
    console.log(`[SCRAPER] ⚠️  Puppeteer scrape failed: ${error.message}`);
    throw error;
  }
}

/**
 * Enhanced fetch with rotation and better headers
 * Better than regular fetch but lighter than Puppeteer
 */
async function scrapeWithEnhancedFetch(url, options = {}) {
  const {
    timeout = 15000,
    retries = 1
  } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // Rotate user agent
    const userAgent = getRandomUserAgent();
    
    // Enhanced headers
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
      'Referer': 'https://www.google.com/'
    };
    
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          // Random delay between retries (human-like)
          const delay = Math.random() * 2000 + 1000; // 1-3 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const response = await fetch(url, {
          headers: headers,
          signal: controller.signal,
          redirect: 'follow'
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        console.log(`[SCRAPER] ✅ Enhanced fetch successful: ${url}`);
        return html;
        
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          throw new Error(`Timeout after ${timeout}ms`);
        }
        if (attempt < retries) {
          console.log(`[SCRAPER] Retry ${attempt + 1}/${retries} for enhanced fetch...`);
        }
      }
    }
    
    throw lastError;
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.log(`[SCRAPER] ⚠️  Enhanced fetch failed: ${error.message}`);
    throw error;
  }
}

/**
 * Regular fetch (fallback)
 * Simple, reliable, but may be blocked by anti-bot systems
 */
async function scrapeWithRegularFetch(url, options = {}) {
  const { timeout = 10000 } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`[SCRAPER] ✅ Regular fetch successful: ${url}`);
    return html;
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.log(`[SCRAPER] ⚠️  Regular fetch failed: ${error.message}`);
    throw error;
  }
}

/**
 * Main hybrid scraping function
 * Intelligent fallback chain maintaining quality
 * 
 * Strategy:
 * 1. Try ScraperAPI first (if available) - best success rate
 * 2. Try Puppeteer (stealth) - handles JS and anti-bot
 * 3. Try Enhanced Fetch - better headers, rotation
 * 4. Try Regular Fetch - simple fallback
 * 
 * @param {String} url - URL to scrape
 * @param {Object} options - Scraping options
 * @returns {Promise<String>} HTML content
 */
export async function scrapeUrl(url, options = {}) {
  const {
    preferScraperAPI = true, // Try ScraperAPI first if available
    preferPuppeteer = true,  // Try Puppeteer if ScraperAPI fails
    preferEnhancedFetch = true, // Try enhanced fetch if Puppeteer fails
    timeout = 20000
  } = options;
  
  // Strategy 1: Try ScraperAPI first (if available and preferred)
  if (preferScraperAPI && process.env.SCRAPERAPI_API_KEY) {
    try {
      const { scrapeWithScraperAPI } = await import('../utils/scraperAPI.js');
      const html = await scrapeWithScraperAPI(url, { render: false });
      console.log(`[SCRAPER] ✅ ScraperAPI successful: ${url}`);
      return html;
    } catch (error) {
      console.log(`[SCRAPER] ScraperAPI failed, trying next method: ${error.message}`);
      // Continue to next strategy
    }
  }
  
  // Strategy 2: Try Puppeteer with enhanced stealth
  if (preferPuppeteer) {
    try {
      // Check if Puppeteer is available (executable path or default)
      const html = await scrapeWithPuppeteer(url, { timeout });
      return html;
    } catch (error) {
      console.log(`[SCRAPER] Puppeteer failed, trying next method: ${error.message}`);
      // Continue to next strategy
    }
  }
  
  // Strategy 3: Try Enhanced Fetch
  if (preferEnhancedFetch) {
    try {
      const html = await scrapeWithEnhancedFetch(url, { timeout });
      return html;
    } catch (error) {
      console.log(`[SCRAPER] Enhanced fetch failed, trying next method: ${error.message}`);
      // Continue to next strategy
    }
  }
  
  // Strategy 4: Regular Fetch (final fallback)
  try {
    const html = await scrapeWithRegularFetch(url, { timeout });
    return html;
  } catch (error) {
    console.log(`[SCRAPER] ❌ All scraping methods failed for: ${url}`);
    throw new Error(`Failed to scrape ${url}: All methods exhausted. Last error: ${error.message}`);
  }
}

/**
 * Check if a URL likely needs JavaScript rendering
 * Helps decide whether to prioritize Puppeteer
 */
export function needsJavaScriptRendering(url) {
  // Common patterns that indicate JS-heavy sites
  const jsIndicators = [
    'react',
    'vue',
    'angular',
    'spa',
    'single-page',
    'app.',
    'dashboard'
  ];
  
  const urlLower = url.toLowerCase();
  return jsIndicators.some(indicator => urlLower.includes(indicator));
}

