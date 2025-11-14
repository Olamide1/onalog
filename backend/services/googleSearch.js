import puppeteer from 'puppeteer';
import { fetchGoogleResultsHTTP } from './googleSearchFallback.js';
import { searchDuckDuckGo, searchGoogleCustomSearch, searchBing, searchGooglePlaces } from './searchProviders.js';

/**
 * Build optimized Google search query
 */
export function buildGoogleQuery(query, country = null, location = null) {
  let searchQuery = query;
  
  // Add location if specified (more specific than country)
  if (location) {
    searchQuery += ` ${location}`;
  }
  
  // Add country filter if specified
  if (country) {
    searchQuery += ` site:${country.toLowerCase()}`;
  }
  
  // Add B2B business indicators
  searchQuery += ' business company';
  
  return searchQuery;
}

/**
 * Fetch Google search results using Puppeteer
 */
export async function fetchGoogleResults(query, country = null, location = null, maxResults = 50) {
  let browser = null;
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080'
        ],
        timeout: 60000,
        protocolTimeout: 120000,
        ignoreHTTPSErrors: true
      });
      
      const page = await browser.newPage();
      
      // Set longer timeouts
      page.setDefaultNavigationTimeout(45000);
      page.setDefaultTimeout(45000);
      
      // Stealth techniques to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Remove webdriver property
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });
      
      // Add Chrome property
      await page.evaluateOnNewDocument(() => {
        window.chrome = {
          runtime: {},
        };
      });
      
      // Override permissions
      await page.evaluateOnNewDocument(() => {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      
      // Ignore WebSocket errors and other non-critical errors
      page.on('error', (err) => {
        console.warn('Page error (non-critical):', err.message);
      });
      
      page.on('requestfailed', (request) => {
        // Log but don't fail on resource loading errors
        if (!request.url().includes('google.com')) {
          console.warn('Request failed:', request.url());
        }
      });
      
      const searchQuery = buildGoogleQuery(query, country, location);
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${maxResults}`;
      
      console.log(`🔍 Searching (attempt ${attempt}/${maxRetries}): ${searchQuery}`);
      
      // Add random delay to appear more human-like
      await page.waitForTimeout(Math.random() * 1000 + 500);
      
      try {
        await page.goto(googleUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 45000 
        });
        
        // Wait a bit for page to fully load
        await page.waitForTimeout(2000);
        
        // Check if we got blocked or redirected
        const currentUrl = page.url();
        if (currentUrl.includes('sorry') || currentUrl.includes('blocked') || currentUrl.includes('captcha')) {
          throw new Error('Google blocked the request (CAPTCHA or rate limit)');
        }
      } catch (navError) {
        // If navigation fails, try with networkidle0
        try {
          await page.goto(googleUrl, { waitUntil: 'networkidle0', timeout: 45000 });
          await page.waitForTimeout(2000);
        } catch (navError2) {
          // Last resort: just wait for load
          await page.goto(googleUrl, { waitUntil: 'load', timeout: 45000 });
          await page.waitForTimeout(2000);
        }
      }
      
      // Wait for results to load - try multiple selectors as Google changes their structure
      try {
        await page.waitForSelector('div#search, div#rso, div[data-ved]', { timeout: 15000 });
      } catch (e) {
        // If main selector fails, wait a bit and try to find any result elements
        await page.waitForTimeout(2000);
        const hasResults = await page.evaluate(() => {
          return document.querySelectorAll('div.g, div[data-ved], div#rso > div').length > 0;
        });
        if (!hasResults) {
          throw new Error('No search results found - Google may have blocked the request or changed their structure');
        }
      }
      
      // Extract search results - try multiple selectors as Google changes structure
      const results = await page.evaluate((max) => {
        const items = [];
        // Try multiple selectors for Google's changing structure
        let resultElements = document.querySelectorAll('div.g');
        if (resultElements.length === 0) {
          resultElements = document.querySelectorAll('div[data-ved]');
        }
        if (resultElements.length === 0) {
          resultElements = document.querySelectorAll('div#rso > div');
        }
        if (resultElements.length === 0) {
          // Last resort: find divs that contain both h3 and a[href]
          const allDivs = document.querySelectorAll('div');
          resultElements = Array.from(allDivs).filter(div => 
            div.querySelector('h3') && div.querySelector('a[href]')
          );
        }
        
        for (const element of resultElements) {
          if (items.length >= max) break;
          
          const titleElement = element.querySelector('h3, h2, a[href] h3');
          const linkElement = element.querySelector('a[href]');
          const snippetElement = element.querySelector('span[style*="-webkit-line-clamp"]') || 
                                element.querySelector('.VwiC3b') ||
                                element.querySelector('.aCOpRe') ||
                                element.querySelector('span');
          
          if (titleElement && linkElement) {
            const title = titleElement.innerText.trim();
            let link = linkElement.href;
            // Clean up Google redirect URLs
            if (link.startsWith('/url?q=')) {
              const match = link.match(/\/url\?q=([^&]+)/);
              if (match) link = decodeURIComponent(match[1]);
            }
            const snippet = snippetElement ? snippetElement.innerText.trim() : '';
            
            if (title && link && link.startsWith('http')) {
              items.push({
                title,
                link,
                snippet
              });
            }
          }
        }
        
        return items;
      }, maxResults);
      
      console.log(`✅ Found ${results.length} results`);
      
      // Close browser before returning
      await browser.close();
      browser = null;
      
      return results;
      
    } catch (error) {
      lastError = error;
      console.error(`❌ Google search error (attempt ${attempt}/${maxRetries}):`, error.message);
      
      // Close browser if it exists
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          // Ignore close errors
        }
        browser = null;
      }
      
      // If this is the last attempt, try free alternatives
      if (attempt === maxRetries) {
        console.log('⚠️  Puppeteer failed, trying free alternatives...');
        
        // Try 1: Google Places API (good for local businesses, $200 free credit/month)
        try {
          if (process.env.GOOGLE_PLACES_API_KEY) {
            console.log('📍 Trying Google Places API...');
            return await searchGooglePlaces(query, country, location, maxResults);
          }
        } catch (placesError) {
          console.log('⚠️  Google Places API failed or not configured...');
        }
        
        // Try 2: DuckDuckGo (completely free, no API key needed)
        try {
          console.log('🦆 Trying DuckDuckGo...');
          return await searchDuckDuckGo(query, country, location, maxResults);
        } catch (ddgError) {
          console.log('⚠️  DuckDuckGo failed, trying other options...');
        }
        
        // Try 3: Google Custom Search API (free tier: 100/day)
        try {
          if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID) {
            console.log('🔍 Trying Google Custom Search API...');
            return await searchGoogleCustomSearch(query, country, location, maxResults);
          }
        } catch (gcsError) {
          console.log('⚠️  Google Custom Search API failed or not configured...');
        }
        
        // Try 4: Bing Search API (free tier: 3,000/month)
        try {
          if (process.env.BING_API_KEY) {
            console.log('🔍 Trying Bing Search API...');
            return await searchBing(query, country, location, maxResults);
          }
        } catch (bingError) {
          console.log('⚠️  Bing Search API failed or not configured...');
        }
        
        // Try 5: HTTP fallback as last resort
        try {
          console.log('🌐 Trying HTTP fallback...');
          return await fetchGoogleResultsHTTP(query, country, location, maxResults);
        } catch (httpError) {
          throw new Error(`All search methods failed. Last error: ${error.message}. Consider setting up Google Places API ($200 free credit/month) or Google Custom Search API (free: 100 queries/day) for reliable results.`);
        }
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = attempt * 2000;
      console.log(`⏳ Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // Should never reach here, but just in case
  throw new Error(`Failed to fetch Google results: ${lastError?.message || 'Unknown error'}`);
}

