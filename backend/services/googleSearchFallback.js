/**
 * Fallback Google Search using HTTP requests (simpler, but may be blocked)
 * This is a backup method if Puppeteer fails
 */
import * as cheerio from 'cheerio';
import https from 'https';

export async function fetchGoogleResultsHTTP(query, country = null, location = null, maxResults = 50) {
  try {
    // Build search query
    let searchQuery = query;
    if (location) {
      searchQuery += ` ${location}`;
    }
    if (country) {
      searchQuery += ` site:${country.toLowerCase()}`;
    }
    searchQuery += ' business company';
    
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${maxResults}`;
    
    console.log(`🔍 HTTP Search (fallback): ${searchQuery}`);
    
    // Use native https module to avoid axios dependency
    const html = await new Promise((resolve, reject) => {
      const url = new URL(googleUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.google.com/',
        },
        timeout: 25000
      };
      
      const req = https.request(options, (res) => {
        // Check status code
        if (res.statusCode !== 200) {
          req.destroy();
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // Check if we got HTML
          if (!data || data.length < 100) {
            reject(new Error('Received empty or invalid response from Google'));
            return;
          }
          resolve(data);
        });
      });
      
      req.on('error', reject);
      req.setTimeout(25000, () => {
        req.destroy();
        reject(new Error('Request timeout after 25 seconds'));
      });
      req.end();
    });
    
    // Debug: Log response length and check for blocks
    console.log(`📄 Received ${html.length} bytes from Google`);
    
    // Check if we got blocked or JavaScript challenge
    if (html.includes('sorry') || 
        html.includes('blocked') || 
        html.includes('captcha') || 
        html.includes('unusual traffic') || 
        html.includes('Our systems have detected') ||
        html.includes('/httpservice/retry/enablejs') ||
        (html.includes('enablejs') && html.includes('noscript')) ||
        (html.includes('noscript') && html.includes('refresh'))) {
      console.log('⚠️  Google blocked the request - detected JavaScript challenge/CAPTCHA page');
      throw new Error('Google is requiring JavaScript verification. HTTP requests cannot bypass this. Consider using a third-party API service like SerpAPI or ScraperAPI for reliable results.');
    }
    
    // Check if we got a valid HTML page
    if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
      console.log('⚠️  Received non-HTML response from Google');
      throw new Error('Google returned an invalid response (not HTML)');
    }
    
    const $ = cheerio.load(html);
    const results = [];
    
    // Try multiple selector strategies
    let found = false;
    
    // Strategy 1: Standard Google results
    $('div.g, div[data-ved], div[class*="g "]').each((i, element) => {
      if (results.length >= maxResults) return false;
      
      const $el = $(element);
      const title = $el.find('h3, h2').first().text().trim();
      let link = $el.find('a[href]').first().attr('href') || '';
      
      // Clean up Google redirect URLs
      if (link.startsWith('/url?q=')) {
        const match = link.match(/\/url\?q=([^&]+)/);
        if (match) link = decodeURIComponent(match[1]);
      }
      
      const snippet = $el.find('.VwiC3b, .aCOpRe, .s, span').first().text().trim();
      
      if (title && link && (link.startsWith('http') || link.startsWith('www.'))) {
        if (!link.startsWith('http')) {
          link = 'https://' + link;
        }
        results.push({
          title,
          link,
          snippet
        });
        found = true;
      }
    });
    
    // Strategy 2: If no results, try alternative selectors
    if (!found) {
      $('a[href*="http"]').each((i, element) => {
        if (results.length >= maxResults) return false;
        
        const $el = $(element);
        const link = $el.attr('href');
        const title = $el.find('h3, h2').text().trim() || $el.text().trim();
        
        // Skip Google internal links
        if (link && 
            link.startsWith('http') && 
            !link.includes('google.com') && 
            !link.includes('googleusercontent.com') &&
            title.length > 5) {
          results.push({
            title: title.substring(0, 100),
            link,
            snippet: ''
          });
        }
      });
    }
    
    if (results.length === 0) {
      // Debug: Try to see what we actually got
      const hasSearchContainer = html.includes('id="search"') || html.includes('id="rso"');
      const hasResultsDivs = html.includes('class="g"') || html.includes('data-ved');
      console.log(`⚠️  No results found. Has search container: ${hasSearchContainer}, Has result divs: ${hasResultsDivs}`);
      console.log(`📄 HTML preview (first 500 chars): ${html.substring(0, 500)}`);
    }
    
    console.log(`✅ HTTP Search found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('❌ HTTP Search error:', error.message);
    throw new Error(`HTTP search failed: ${error.message}`);
  }
}

