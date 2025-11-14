import puppeteer from 'puppeteer';

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
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const searchQuery = buildGoogleQuery(query, country, location);
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${maxResults}`;
    
    console.log(`🔍 Searching: ${searchQuery}`);
    await page.goto(googleUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for results to load
    await page.waitForSelector('div#search', { timeout: 10000 });
    
    // Extract search results
    const results = await page.evaluate((max) => {
      const items = [];
      const resultElements = document.querySelectorAll('div.g, div[data-ved]');
      
      for (const element of resultElements) {
        if (items.length >= max) break;
        
        const titleElement = element.querySelector('h3');
        const linkElement = element.querySelector('a[href]');
        const snippetElement = element.querySelector('span[style*="-webkit-line-clamp"]') || 
                              element.querySelector('.VwiC3b') ||
                              element.querySelector('span');
        
        if (titleElement && linkElement) {
          const title = titleElement.innerText.trim();
          const link = linkElement.href;
          const snippet = snippetElement ? snippetElement.innerText.trim() : '';
          
          if (title && link) {
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
    return results;
    
  } catch (error) {
    console.error('❌ Google search error:', error);
    throw new Error(`Failed to fetch Google results: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

