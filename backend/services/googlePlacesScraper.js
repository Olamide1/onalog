/**
 * Scrape Google Places (Maps) directly - No API needed
 * Improved approach: Extract from embedded JSON data
 */
import puppeteer from 'puppeteer';

// Directory/aggregator sites to filter out - COMPREHENSIVE LIST
const FILTER_DOMAINS = [
  // Data aggregators
  'tomba.io', 'cybo.com', 'cience.com', 'wrkr.com', 'zoominfo.com',
  'opencorporates.com', 'micompanyregistry.com', 'poidata.io',
  'dnb.com', 'f6s.com', 'ensun.io', 'aeroleads.com',
  // Business directories
  'yelp.com', 'yellowpages.com', 'whitepages.com', 'business.com',
  'manta.com', 'bbb.org', 'indeed.com', 'glassdoor.com',
  // Other aggregators
  'wikipedia.org', 'thumbwind.com', 'afrikta.com', 'hospi.info',
  'tannoshealth.com', 'dfuilts.com'
];

function isDirectorySite(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return FILTER_DOMAINS.some(filter => domain.includes(filter));
  } catch {
    return false;
  }
}

export async function scrapeGooglePlaces(query, country = null, location = null, maxResults = 50) {
  let browser = null;
  const maxRetries = 2; // Reduced retries
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[PLACES] Starting Google Places scrape (attempt ${attempt}/${maxRetries})`);
      console.log(`[PLACES] Query: "${query}", Country: ${country || 'none'}, Location: ${location || 'none'}, Max: ${maxResults}`);
      
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ],
        timeout: 90000,
        protocolTimeout: 180000,
        ignoreHTTPSErrors: true
      });
      
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(90000);
      page.setDefaultTimeout(90000);
      
      // Stealth techniques
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      });
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setExtraHTTPHeaders({ 
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });
      
      // Build search query
      let searchQuery = query;
      if (location) {
        searchQuery += ` ${location}`;
      }
      if (country) {
        const countryNames = {
          'ng': 'Nigeria', 'za': 'South Africa', 'ke': 'Kenya', 'gh': 'Ghana',
          'ug': 'Uganda', 'tz': 'Tanzania', 'us': 'United States', 'gb': 'United Kingdom',
          'ca': 'Canada', 'au': 'Australia', 'in': 'India', 'sg': 'Singapore'
        };
        searchQuery += ` ${countryNames[country] || country}`;
      }
      
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
      console.log(`[PLACES] Navigating to: ${mapsUrl}`);
      
      // Navigate with multiple strategies
      try {
        await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      } catch (navError) {
        console.log(`[PLACES] Navigation timeout, trying domcontentloaded...`);
        await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
      
      await page.waitForTimeout(5000); // Wait for results to load
      
      // Try to extract from embedded JSON data first (most reliable)
      console.log(`[PLACES] Attempting to extract from embedded JSON...`);
      let results = await page.evaluate((max) => {
        const items = [];
        
        // Look for embedded JSON data in script tags
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          try {
            const text = script.textContent;
            if (text.includes('"title"') && text.includes('"address"')) {
              // Try to parse as JSON
              const jsonMatch = text.match(/\[{.*?"title".*?}\]/s);
              if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                if (Array.isArray(data)) {
                  for (const item of data) {
                    if (items.length >= max) break;
                    if (item.title && item.address) {
                      items.push({
                        title: item.title,
                        link: item.url || item.website || `https://www.google.com/maps/search/${encodeURIComponent(item.title)}`,
                        snippet: item.address
                      });
                    }
                  }
                }
              }
            }
          } catch (e) {
            // Continue to next script
          }
        }
        
        return items;
      }, maxResults);
      
      // If JSON extraction didn't work, try DOM extraction
      if (results.length === 0) {
        console.log(`[PLACES] JSON extraction failed, trying DOM extraction...`);
        
        // Scroll to load more results
        let scrollAttempts = 0;
        const maxScrolls = Math.ceil(maxResults / 20) * 3;
        
        while (scrollAttempts < maxScrolls && results.length < maxResults) {
          // Scroll the results panel
          await page.evaluate(() => {
            const resultsPanel = document.querySelector('[role="feed"]') || 
                                document.querySelector('div[aria-label*="Results"]') ||
                                document.querySelector('div[aria-label*="results"]');
            if (resultsPanel) {
              resultsPanel.scrollTop = resultsPanel.scrollHeight;
            } else {
              // Fallback: scroll the page
              window.scrollBy(0, 1000);
            }
          });
          
          await page.waitForTimeout(3000);
          
          // Extract visible results
          const newResults = await page.evaluate((max, currentCount) => {
            const items = [];
            const resultElements = document.querySelectorAll('[data-result-index], div[role="article"], div[jsaction*="click"]');
            
            for (const element of resultElements) {
              if (items.length >= max) break;
              
              try {
                const nameEl = element.querySelector('div[role="button"] span, h3, [data-value="Name"], .qBF1Pd') ||
                              element.querySelector('div').querySelector('span');
                const name = nameEl ? nameEl.textContent.trim() : '';
                
                const addressEl = element.querySelector('[data-value="Address"], .W4Efsd span, .fontBodyMedium span');
                const address = addressEl ? addressEl.textContent.trim() : '';
                
                // Try to get link
                const linkEl = element.querySelector('a[href*="maps"], a[href*="place"]');
                const link = linkEl ? linkEl.href : '';
                
                if (name && name.length > 3) {
                  items.push({
                    title: name,
                    link: link || `https://www.google.com/maps/search/${encodeURIComponent(name)}`,
                    snippet: address
                  });
                }
              } catch (e) {
                // Skip this element
              }
            }
            
            return items;
          }, maxResults, results.length);
          
          // Add new unique results
          const existingTitles = new Set(results.map(r => r.title.toLowerCase()));
          for (const result of newResults) {
            if (!existingTitles.has(result.title.toLowerCase()) && result.title.length > 3) {
              results.push(result);
              existingTitles.add(result.title.toLowerCase());
            }
          }
          
          console.log(`[PLACES] Scroll ${scrollAttempts + 1}: Found ${results.length} unique results`);
          
          if (results.length >= maxResults) break;
          scrollAttempts++;
        }
      }
      
      // Filter out directory sites
      const filteredResults = results.filter(result => {
        if (!result.link) return false;
        return !isDirectorySite(result.link);
      });
      
      console.log(`[PLACES] Filtered ${results.length - filteredResults.length} directory sites, ${filteredResults.length} business results`);
      
      await browser.close();
      browser = null;
      
      if (filteredResults.length > 0) {
        console.log(`[PLACES] ✅ Successfully scraped ${filteredResults.length} results`);
        return filteredResults.slice(0, maxResults);
      } else {
        throw new Error('No valid business results found');
      }
      
    } catch (error) {
      console.error(`[PLACES] ❌ Error (attempt ${attempt}/${maxRetries}):`, error.message);
      if (browser) {
        try {
          await browser.close();
        } catch (e) {}
        browser = null;
      }
      
      if (attempt === maxRetries) {
        throw new Error(`Google Places scraping failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
    }
  }
  
  throw new Error('Google Places scraping failed');
}
