/**
 * Multiple free search providers as fallbacks
 */
import https from 'https';
import * as cheerio from 'cheerio';

/**
 * Option 0: Google Places API (Free tier: $200 credit/month)
 * Requires: GOOGLE_PLACES_API_KEY in .env
 * Good for local business searches
 */
export async function searchGooglePlaces(query, country = null, location = null, maxResults = 50) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google Places API key not configured');
    }
    
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
    
    // Use Text Search API
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
    
    console.log(`📍 Google Places API: ${searchQuery}`);
    
    const data = await new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Onalog/1.0',
        },
        timeout: 15000
      };
      
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned ${res.statusCode}: ${responseData}`));
            return;
          }
          resolve(responseData);
        });
      });
      
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
    
    const json = JSON.parse(data);
    
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      throw new Error(json.error_message || `Places API error: ${json.status}`);
    }
    
    const results = (json.results || []).slice(0, maxResults).map(place => ({
      title: place.name,
      link: place.website || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      snippet: place.formatted_address || place.vicinity || ''
    }));
    
    console.log(`✅ Google Places API found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('❌ Google Places API error:', error.message);
    throw new Error(`Google Places API failed: ${error.message}`);
  }
}

/**
 * Option 1: DuckDuckGo Search (Free, no API key needed, less blocking)
 */
export async function searchDuckDuckGo(query, country = null, location = null, maxResults = 50) {
  try {
    let searchQuery = query;
    if (location) {
      searchQuery += ` ${location}`;
    }
    if (country) {
      const countryNames = {
        'ng': 'Nigeria', 'za': 'South Africa', 'ke': 'Kenya', 'gh': 'Ghana',
        'ug': 'Uganda', 'tz': 'Tanzania', 'et': 'Ethiopia', 'eg': 'Egypt',
        'zm': 'Zambia', 'zw': 'Zimbabwe', 'rw': 'Rwanda', 'sn': 'Senegal',
        'ci': 'Ivory Coast', 'cm': 'Cameroon', 'ao': 'Angola', 'ma': 'Morocco',
        'tn': 'Tunisia', 'dz': 'Algeria', 'mg': 'Madagascar', 'mw': 'Malawi',
        'us': 'United States', 'ca': 'Canada', 'mx': 'Mexico',
        'gb': 'United Kingdom', 'de': 'Germany', 'fr': 'France', 'it': 'Italy',
        'es': 'Spain', 'nl': 'Netherlands', 'be': 'Belgium', 'ch': 'Switzerland',
        'at': 'Austria', 'se': 'Sweden', 'no': 'Norway', 'dk': 'Denmark',
        'pl': 'Poland', 'ie': 'Ireland', 'pt': 'Portugal',
        'in': 'India', 'cn': 'China', 'jp': 'Japan', 'kr': 'South Korea',
        'sg': 'Singapore', 'my': 'Malaysia', 'th': 'Thailand', 'id': 'Indonesia',
        'ph': 'Philippines', 'vn': 'Vietnam', 'ae': 'United Arab Emirates',
        'sa': 'Saudi Arabia', 'il': 'Israel', 'pk': 'Pakistan', 'bd': 'Bangladesh',
        'au': 'Australia', 'nz': 'New Zealand',
        'br': 'Brazil', 'ar': 'Argentina', 'co': 'Colombia', 'cl': 'Chile', 'pe': 'Peru'
      };
      searchQuery += ` ${countryNames[country] || country}`;
    }
    searchQuery += ' business company';
    
    const duckDuckGoUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
    
    console.log(`🦆 DuckDuckGo Search: ${searchQuery}`);
    
    const html = await new Promise((resolve, reject) => {
      const url = new URL(duckDuckGoUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000
      };
      
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          req.destroy();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      
      req.on('error', reject);
      req.setTimeout(20000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
    
    const $ = cheerio.load(html);
    const results = [];
    
    // DuckDuckGo result selectors - try multiple patterns
    let found = false;
    
    // Pattern 1: Standard results
    $('.result, .web-result, .result__body').each((i, element) => {
      if (results.length >= maxResults) return false;
      
      const $el = $(element);
      const titleEl = $el.find('.result__a, a.result__a, h2 a').first();
      const title = titleEl.text().trim();
      let link = titleEl.attr('href') || '';
      const snippet = $el.find('.result__snippet, .result__body').text().trim();
      
      // DuckDuckGo uses redirect URLs, extract actual URL
      if (link.startsWith('/l/?kh=') || link.includes('uddg=')) {
        const match = link.match(/uddg=([^&]+)/);
        if (match) {
          link = decodeURIComponent(match[1]);
        }
      }
      
      if (title && link && link.startsWith('http')) {
        results.push({
          title,
          link,
          snippet
        });
        found = true;
      }
    });
    
    // Pattern 2: Alternative selectors if first didn't work
    if (!found) {
      $('a[href*="http"]').each((i, element) => {
        if (results.length >= maxResults) return false;
        
        const $el = $(element);
        const link = $el.attr('href');
        const title = $el.text().trim();
        
        // Skip DuckDuckGo internal links
        if (link && 
            link.startsWith('http') && 
            !link.includes('duckduckgo.com') &&
            title.length > 10) {
          results.push({
            title: title.substring(0, 100),
            link,
            snippet: ''
          });
        }
      });
    }
    
    console.log(`✅ DuckDuckGo found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('❌ DuckDuckGo search error:', error.message);
    throw new Error(`DuckDuckGo search failed: ${error.message}`);
  }
}

/**
 * Option 2: Google Custom Search API (Free tier: 100 queries/day)
 * Requires: GOOGLE_CSE_ID and GOOGLE_API_KEY in .env
 */
export async function searchGoogleCustomSearch(query, country = null, location = null, maxResults = 50) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    
    if (!apiKey || !cseId) {
      throw new Error('Google Custom Search API credentials not configured');
    }
    
    let searchQuery = query;
    if (location) {
      searchQuery += ` ${location}`;
    }
    if (country) {
      searchQuery += ` site:${country.toLowerCase()}`;
    }
    searchQuery += ' business company';
    
    // Google Custom Search API - free tier: 100 queries/day
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(searchQuery)}&num=${Math.min(maxResults, 10)}`;
    
    console.log(`🔍 Google Custom Search API: ${searchQuery}`);
    
    const data = await new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Onalog/1.0',
        },
        timeout: 15000
      };
      
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned ${res.statusCode}: ${responseData}`));
            return;
          }
          resolve(responseData);
        });
      });
      
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
    
    const json = JSON.parse(data);
    
    if (json.error) {
      throw new Error(json.error.message || 'Google API error');
    }
    
    const results = (json.items || []).map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || ''
    }));
    
    console.log(`✅ Google Custom Search API found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('❌ Google Custom Search API error:', error.message);
    throw new Error(`Google Custom Search API failed: ${error.message}`);
  }
}

/**
 * Option 3: Bing Web Search API (Free tier: 3,000 queries/month)
 * Requires: BING_API_KEY in .env
 */
export async function searchBing(query, country = null, location = null, maxResults = 50) {
  try {
    const apiKey = process.env.BING_API_KEY;
    
    if (!apiKey) {
      throw new Error('Bing API key not configured');
    }
    
    let searchQuery = query;
    if (location) {
      searchQuery += ` ${location}`;
    }
    if (country) {
      searchQuery += ` site:${country.toLowerCase()}`;
    }
    searchQuery += ' business company';
    
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(searchQuery)}&count=${Math.min(maxResults, 50)}`;
    
    console.log(`🔍 Bing Search API: ${searchQuery}`);
    
    const data = await new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'User-Agent': 'Onalog/1.0',
        },
        timeout: 15000
      };
      
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned ${res.statusCode}: ${responseData}`));
            return;
          }
          resolve(responseData);
        });
      });
      
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
    
    const json = JSON.parse(data);
    
    if (json.error) {
      throw new Error(json.error.message || 'Bing API error');
    }
    
    const results = (json.webPages?.value || []).map(item => ({
      title: item.name,
      link: item.url,
      snippet: item.snippet || ''
    }));
    
    console.log(`✅ Bing Search API found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('❌ Bing Search API error:', error.message);
    throw new Error(`Bing Search API failed: ${error.message}`);
  }
}

