/**
 * Multiple free search providers as fallbacks
 */
import https from 'https';
import * as cheerio from 'cheerio';
 import http from 'http';

// Directory/aggregator sites to filter out - COMPREHENSIVE LIST
const FILTER_DOMAINS = [
  // Data aggregators
  'tomba.io', 'cybo.com', 'cience.com', 'wrkr.com', 'zoominfo.com',
  'opencorporates.com', 'micompanyregistry.com', 'poidata.io',
  'dnb.com', 'f6s.com', 'ensun.io', 'aeroleads.com',
  'tracxn.com', 'ghanayello.com', 'techcartel.net', 'yen.com.gh', 'tremhost.com',
  // Business directories
  'yelp.com', 'yellowpages.com', 'whitepages.com', 'business.com',
  'manta.com', 'bbb.org', 'indeed.com', 'glassdoor.com',
  // Other aggregators
  'wikipedia.org', 'thumbwind.com', 'afrikta.com', 'hospi.info',
  'tannoshealth.com', 'dfuilts.com',
  // Real-estate/listing/review aggregators we must expand/block (not final leads)
  'goodfirms.co', 'kyero.com', 'properstar.com', 'realting.com', 'jamesedition.com',
  'tripadvisor.com', 'yelp.com', 'zomato.com', 'foursquare.com', 'opentable.com',
  'google.com/maps', 'restaurantguru.com', 'eircode.ie', 'food.ireland724.info', 'coffeeee-ai.com',
  // Regional directory/listicle domains (trigger expansion instead of treating as leads)
  'finelib.com', 'worldorgs.com', 'infoaboutcompanies.com', 'starofservice.com.ng',
  'africabizinfo.com', 'nigeria24.me', 'businesslist.com.ng',
  // OpenStreetMap pages (not actual business websites)
  'openstreetmap.org'
];

export function isDirectorySite(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = (urlObj.pathname || '').toLowerCase();
    // Domain-based block
    if (FILTER_DOMAINS.some(filter => domain.includes(filter))) return true;
    // Path heuristics that commonly indicate lists/aggregators
    if (path.match(/\/(category|tags|companies|agencies|estate-agents|real-estate-agents|company-directory|partners)\b/) ||
        path.includes('/top-') || path.includes('/best') || path.includes('/list') || path.includes('/explore/') ||
        path.includes('sharearticle')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Check if URL is an OpenStreetMap node/page (not a real business website)
function isOSMNodePage(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('openstreetmap.org');
  } catch {
    return false;
  }
}

/**
 * Normalize and validate a URL, small helper for HTTP/HTTPS GET
 */
function safeHttpGet(urlString, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(urlString);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Onalog/1.0',
          ...headers
        },
        timeout: timeoutMs
      };
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data?.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * New Provider: Overpass API (OpenStreetMap, structured tag search)
 */
export async function searchOverpass(query, country = null, location = null, maxResults = 50) {
  try {
    const q = (query || '').toLowerCase();
    const tagSets = [];
    const addAmenity = (v) => tagSets.push(`node['amenity'='${v}'](area.a);way['amenity'='${v}'](area.a);relation['amenity'='${v}'](area.a);`);
    const addTourism = (v) => tagSets.push(`node['tourism'='${v}'](area.a);way['tourism'='${v}'](area.a);relation['tourism'='${v}'](area.a);`);
    const addShop = (v) => tagSets.push(`node['shop'='${v}'](area.a);way['shop'='${v}'](area.a);relation['shop'='${v}'](area.a);`);
    const addOffice = (v) => tagSets.push(`node['office'='${v}'](area.a);way['office'='${v}'](area.a);relation['office'='${v}'](area.a);`);
    if (q.includes('bank')) addAmenity('bank');
    if (q.includes('restaurant')) addAmenity('restaurant');
    if (q.includes('cafe')) addAmenity('cafe');
    if (q.includes('bar')) addAmenity('bar');
    if (q.includes('pharmacy')) addAmenity('pharmacy');
    if (q.includes('hospital')) addAmenity('hospital');
    if (q.includes('clinic')) addAmenity('clinic');
    if (q.includes('hotel')) addTourism('hotel');
    if (q.includes('supermarket')) addShop('supermarket');
    if (q.includes('company') || q.includes('agency') || q.includes('firm')) addOffice('company');
    // Real estate mapping
    if (q.includes('real estate') || q.includes('estate agent') || q.includes('realtor') || q.includes('imobili')) {
      addOffice('estate_agent');
    }
    const qName = q.replace(/[^a-z0-9 áéíóúàâêôãõç\-]/g, '').replace(/\s+/g, ' ');
    const extraNames = [];
    if (q.includes('real estate') || q.includes('estate') || q.includes('realtor')) extraNames.push('real estate', 'estate agent', 'realtor');
    if (q.includes('imobili') || q.includes('portugal') || q.includes('br')) extraNames.push('imobiliária', 'agência imobiliária', 'corretor');
    const nameAlternatives = Array.from(new Set([qName, ...extraNames])).filter(Boolean).map(w => w.replace(/'/g, "\\'"));
    const nameFilter = nameAlternatives.map(w =>
      `node['name'~'${w}', i](area.a);way['name'~'${w}', i](area.a);relation['name'~'${w}', i](area.a);`
    ).join('\n');
    // Build area from location or country (map ISO code to name)
    const countryNames = {
      'ng':'Nigeria','za':'South Africa','ke':'Kenya','gh':'Ghana','ug':'Uganda','tz':'Tanzania','et':'Ethiopia','eg':'Egypt','zm':'Zambia','zw':'Zimbabwe','rw':'Rwanda','sn':'Senegal','ci':'Ivory Coast','cm':'Cameroon','ao':'Angola','ma':'Morocco','tn':'Tunisia','dz':'Algeria','mg':'Madagascar','mw':'Malawi','us':'United States','gb':'United Kingdom','de':'Germany','fr':'France','it':'Italy','es':'Spain','pt':'Portugal','nl':'Netherlands','be':'Belgium','ch':'Switzerland','at':'Austria','se':'Sweden','no':'Norway','dk':'Denmark','pl':'Poland','ie':'Ireland','mx':'Mexico','br':'Brazil','ar':'Argentina','co':'Colombia','cl':'Chile','pe':'Peru','jp':'Japan','kr':'South Korea','in':'India'
    };
    const countryName = country ? (countryNames[country] || country) : null;
    // Prefer city/location if given; else country name
    const areaPrimary = (location || '').trim();
    const areaFallback = (countryName || '').trim();
    const areaClause =
      areaPrimary
        ? `area['name'='${areaPrimary.replace(/'/g, "\\'")}']->.a;`
        : (areaFallback
            ? `area['name'='${areaFallback.replace(/'/g, "\\'")}']->.a;`
            : `area["name"="World"]->.a;`);
    const unions = tagSets.length > 0 ? tagSets.join('\n') : '';
    // Expand tags: amenity=hospital OR healthcare=hospital OR building=hospital
    if (q.includes('hospital')) {
      addAmenity('hospital');
      tagSets.push(`node['healthcare'='hospital'](area.a);way['healthcare'='hospital'](area.a);relation['healthcare'='hospital'](area.a);`);
      tagSets.push(`node['building'='hospital'](area.a);way['building'='hospital'](area.a);relation['building'='hospital'](area.a);`);
    }
    const data = `[out:json][timeout:60];
${areaClause}
(
  ${unions}
  ${nameFilter}
);
out center tags ${Math.max(10, Math.min(200, maxResults))};`;
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter'
    ];
    let raw = null;
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        console.log(`[OVERPASS] Querying ${ep}…`);
        raw = await safeHttpGet(`${ep}?data=${encodeURIComponent(data)}`, { 'Accept': 'application/json' }, 60000);
        if (raw) break;
      } catch (e) {
        lastErr = e;
        console.log(`[OVERPASS] ⚠️  ${ep} failed: ${e.message}`);
      }
    }
    if (!raw) {
      throw lastErr || new Error('All Overpass endpoints failed');
    }
    const json = JSON.parse(raw);
    const elements = json.elements || [];
    const results = elements
      .map(el => {
        const tags = el.tags || {};
        let website = tags.website || tags['contact:website'] || tags.url || '';
        if (website && !website.startsWith('http')) website = `https://${website}`;
        const name = tags.name || 'Unknown';
        const addressParts = [
          tags['addr:street'],
          tags['addr:housenumber'],
          tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
          tags['addr:state'],
          tags['addr:country']
        ].filter(Boolean);
        const address = addressParts.join(', ');
        const phone = tags.phone || tags['contact:phone'] || tags['phone:mobile'] || null;
        const link = website || (tags['brand:wikidata'] ? `https://www.wikidata.org/wiki/${tags['brand:wikidata']}` : '');
        return {
          title: name,
          link: link || `https://www.openstreetmap.org/${el.type}/${el.id}`,
          snippet: address,
          phone,
          address
        };
      })
      .filter(item => item.title && item.title.length > 2)
      .filter(item => !isOSMNodePage(item.link))
      .filter(item => !isDirectorySite(item.link));
    console.log(`[OVERPASS] ✅ Found ${results.length} results`);
    return results.slice(0, maxResults);
  } catch (e) {
    console.log(`[OVERPASS] ❌ Error: ${e.message}`);
    throw new Error(`Overpass failed: ${e.message}`);
  }
}

/**
 * Optional Provider: SearxNG (self-hosted metasearch)
 */
export async function searchSearxng(query, country = null, location = null, maxResults = 50) {
  try {
    // Support multiple public instances via SEARXNG_URLS (comma-separated)
    // Falls back to single SEARXNG_URL if provided, else a small built-in list
    const urlsFromEnv = (process.env.SEARXNG_URLS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const singleUrl = (process.env.SEARXNG_URL || '').trim();
    const fallback = [
      'https://searx.be',
      'https://searx.tiekoetter.com',
      'https://search.bus-hit.me',
      'https://searxng.bissisoft.com'
    ];
    const candidates = urlsFromEnv.length > 0 ? urlsFromEnv : (singleUrl ? [singleUrl] : fallback);
    if (candidates.length === 0) {
      throw new Error('SEARXNG_URLS/SEARXNG_URL not configured');
    }

    // Build query once
    let q = query;
    if (location) q += ` ${location}`;
    if (country) q += ` ${country}`;

    let firstError = null;
    for (const base of candidates) {
      const baseUrl = base.replace(/\/+$/, '');
      const url = `${baseUrl}/search?format=json&q=${encodeURIComponent(q)}&categories=general`;
      try {
        console.log(`[SEARXNG] Query: ${q} → ${baseUrl}`);
        const raw = await safeHttpGet(url, {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        }, 12000);
        const json = JSON.parse(raw);
        const items = json.results || [];
        const results = items
          .filter(r => r.url && r.title)
          .map(r => ({ title: r.title, link: r.url, snippet: r.content || '' }))
          .filter(r => r.link.startsWith('http'))
          .filter(r => !isDirectorySite(r.link));
        console.log(`[SEARXNG] ✅ ${baseUrl} returned ${results.length} results`);
        if (results.length > 0) {
          return results.slice(0, maxResults);
        }
        // If zero results, try next instance
      } catch (e) {
        console.log(`[SEARXNG] ⚠️  ${baseUrl} failed: ${e.message}`);
        if (!firstError) firstError = e;
        // Try next candidate
      }
    }
    // If all failed or returned empty, throw the first error (or a generic one)
    if (firstError) {
      throw firstError;
    }
    throw new Error('All SearxNG instances returned 0 results');
  } catch (e) {
    console.log(`[SEARXNG] ❌ Error: ${e.message}`);
    throw new Error(`SearxNG failed: ${e.message}`);
  }
}

/**
 * Option 0: Google Places API (Free tier: $200 credit/month)
 * Requires: GOOGLE_PLACES_API_KEY in .env
 * Good for local business searches - PRIMARY METHOD
 */
export async function searchGooglePlaces(query, country = null, location = null, maxResults = 50) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google Places API key not configured');
    }
    
    console.log(`[PLACES_API] Starting search: "${query}", Country: ${country || 'none'}, Location: ${location || 'none'}, Max: ${maxResults}`);
    
    // Build search query
    let searchQuery = query;
    if (location) {
      searchQuery += ` ${location}`;
    }
    if (country) {
      const countryNames = {
        'ng': 'Nigeria', 'za': 'South Africa', 'ke': 'Kenya', 'gh': 'Ghana',
        'ug': 'Uganda', 'tz': 'Tanzania', 'us': 'United States', 'gb': 'United Kingdom',
        'ca': 'Canada', 'au': 'Australia', 'in': 'India', 'sg': 'Singapore',
        'et': 'Ethiopia', 'eg': 'Egypt', 'zm': 'Zambia', 'zw': 'Zimbabwe',
        'rw': 'Rwanda', 'sn': 'Senegal', 'ci': 'Ivory Coast', 'cm': 'Cameroon',
        'ao': 'Angola', 'ma': 'Morocco', 'tn': 'Tunisia', 'dz': 'Algeria',
        'mg': 'Madagascar', 'mw': 'Malawi', 'mx': 'Mexico', 'de': 'Germany',
        'fr': 'France', 'it': 'Italy', 'es': 'Spain', 'nl': 'Netherlands',
        'be': 'Belgium', 'ch': 'Switzerland', 'at': 'Austria', 'se': 'Sweden',
        'no': 'Norway', 'dk': 'Denmark', 'pl': 'Poland', 'ie': 'Ireland',
        'pt': 'Portugal', 'cn': 'China', 'jp': 'Japan', 'kr': 'South Korea',
        'my': 'Malaysia', 'th': 'Thailand', 'id': 'Indonesia', 'ph': 'Philippines',
        'vn': 'Vietnam', 'ae': 'United Arab Emirates', 'sa': 'Saudi Arabia',
        'il': 'Israel', 'pk': 'Pakistan', 'bd': 'Bangladesh', 'nz': 'New Zealand',
        'br': 'Brazil', 'ar': 'Argentina', 'co': 'Colombia', 'cl': 'Chile', 'pe': 'Peru'
      };
      searchQuery += ` ${countryNames[country] || country}`;
    }
    
    const results = [];
    let nextPageToken = null;
    let pageCount = 0;
    const maxPages = Math.ceil(maxResults / 20); // 20 results per page
    
    do {
      // Use Text Search API with better parameters
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
      
      // Add location bias if country/location specified (improves relevance)
      if (location || country) {
        // Try to get a rough location for bias (helps with relevance)
        // This is optional but improves results
      }
      
      // Add fields parameter to get more data (if using Places API New)
      // For now, using classic API which returns all fields by default
      
      if (nextPageToken) {
        url += `&pagetoken=${nextPageToken}`;
        // Wait for token to become valid (Google requires a delay)
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log(`[PLACES_API] Fetching page ${pageCount + 1}...`);
      
      const data = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Onalog/1.0',
          },
          timeout: 20000
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
        req.setTimeout(20000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.end();
      });
      
      const json = JSON.parse(data);
      
      // Handle API errors more gracefully with detailed diagnostics
      if (json.status === 'REQUEST_DENIED' || json.status === 'INVALID_REQUEST') {
        const errorMsg = json.error_message || `Places API error: ${json.status}`;
        console.error(`[PLACES_API] ❌ API Error: ${errorMsg}`);
        console.error(`[PLACES_API] Status: ${json.status}`);
        console.error(`[PLACES_API] API Key (first 10 chars): ${apiKey.substring(0, 10)}...`);
        
        // Provide helpful error message
        if (errorMsg.includes('invalid') || errorMsg.includes('API key') || json.status === 'REQUEST_DENIED') {
          const diagnosticMsg = `Google Places API Error: ${errorMsg}

DIAGNOSTICS:
- API Key exists: ${apiKey ? 'Yes' : 'No'}
- API Key length: ${apiKey?.length || 0} characters
- Status: ${json.status}
- Key (first 15 chars): ${apiKey?.substring(0, 15)}...

TO FIX (MOST COMMON ISSUES):
1. ✅ RESTART backend server (critical - to load new key from .env)
2. ✅ Check API key restrictions (MOST COMMON FIX):
   https://console.cloud.google.com/apis/credentials
   → Click your API key: "${apiKey?.substring(0, 15)}..."
   → Under "API restrictions", choose ONE:
      Option A: "Don't restrict key" (easiest for testing)
      Option B: "Restrict key" → Add "Places API" to allowed APIs
3. ✅ Verify "Places API" is ENABLED (not just "Places API (New)"):
   https://console.cloud.google.com/google/maps-apis/apis/places-backend.googleapis.com
   → Should show "Disable" button (means it's enabled)
4. ✅ Check billing is enabled (REQUIRED for Places API):
   https://console.cloud.google.com/billing
   → Must have active billing account linked to project
5. ✅ Verify key in .env matches Google Cloud Console exactly (no extra spaces)`;
          throw new Error(diagnosticMsg);
        }
        throw new Error(errorMsg);
      }
      
      if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
        throw new Error(json.error_message || `Places API error: ${json.status}`);
      }
      
      // Filter directory sites and map results
      // Google Places API provides high-quality data - prioritize places with websites
      const pageResults = (json.results || [])
        .filter(place => {
          const website = place.website || '';
          // Filter out directory sites
          if (website && isDirectorySite(website)) {
            return false;
          }
          // Only include places with actual websites (not just Google Maps links)
          // This ensures we get real business websites, not just map locations
          return !!website && website.length > 0;
        })
        .map(place => ({
          title: place.name,
          link: place.website, // Always use website (we filtered out places without websites)
          snippet: place.formatted_address || place.vicinity || '',
          phone: place.formatted_phone_number || place.international_phone_number || null,
          address: place.formatted_address || place.vicinity || null
        }));
      
      results.push(...pageResults);
      nextPageToken = json.next_page_token;
      pageCount++;
      
      console.log(`[PLACES_API] Page ${pageCount}: Found ${pageResults.length} results (Total: ${results.length})`);
      
      // Stop if we have enough results or no more pages
      if (results.length >= maxResults || !nextPageToken || pageCount >= maxPages) {
        break;
      }
      
    } while (nextPageToken && results.length < maxResults && pageCount < maxPages);
    
    const finalResults = results.slice(0, maxResults);
    console.log(`[PLACES_API] ✅ Found ${finalResults.length} results (filtered from ${results.length} total)`);
    return finalResults;
    
  } catch (error) {
    console.error('[PLACES_API] ❌ Error:', error.message);
    throw new Error(`Google Places API failed: ${error.message}`);
  }
}

/**
 * Option 1: DuckDuckGo Search (Free, no API key needed, less blocking)
 * Improved: Filters directory sites, better pagination
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
    
    console.log(`[DUCKDUCKGO] 🦆 DuckDuckGo Search: ${searchQuery}`);
    
    // Try to fetch first page with retry logic for HTTP 202
    let html = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries && !html) {
      try {
        html = await new Promise((resolve, reject) => {
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
            // Handle HTTP 202 (Accepted - rate limiting) on first request too
            if (res.statusCode === 202) {
              console.warn(`[DUCKDUCKGO] HTTP 202 - Rate limited on first request, will retry...`);
              req.destroy();
              reject(new Error('HTTP 202: Rate limited'));
              return;
            }
            
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
      } catch (error) {
        retryCount++;
        if (error.message.includes('202') || error.message.includes('Rate limited')) {
          if (retryCount < maxRetries) {
            const waitTime = retryCount * 5000; // 5s, 10s, 15s
            console.log(`[DUCKDUCKGO] Rate limited, waiting ${waitTime}ms before retry ${retryCount}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            throw new Error('DuckDuckGo rate limited after multiple retries');
          }
        } else {
          throw error;
        }
      }
    }
    
    if (!html) {
      throw new Error('Failed to fetch DuckDuckGo results after retries');
    }
    
    let $ = cheerio.load(html);
    const results = [];
    
    // DuckDuckGo result selectors - try multiple patterns
    let found = false;
    let pageNum = 0;
    
    // Function to extract results from current page
    const extractFromPage = ($page) => {
      // Pattern 1: Standard results
      $page('.result, .web-result, .result__body').each((i, element) => {
        if (results.length >= maxResults) return false;
        
        const $el = $page(element);
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
        
        // Heuristic filters to drop listicles/directories/article lists
        const badPathPattern = /(\/category\/|\/tags\/|\/top-|\/best|\/list|\/explore\/|shareArticle|\/companies)/i;
        const isBadPath = badPathPattern.test(link);
        
        if (title && link && link.startsWith('http') && !isBadPath) {
          // Filter out directory sites
          if (!isDirectorySite(link)) {
            results.push({
              title,
              link,
              snippet
            });
            found = true;
          } else {
            console.log(`[DUCKDUCKGO] Filtered directory site: ${link}`);
          }
        } else if (isBadPath) {
          console.log(`[DUCKDUCKGO] Filtered listicle/article path: ${link}`);
        }
      });
      
      // Pattern 2: Alternative selectors if first didn't work
      if (!found && results.length < maxResults) {
        $page('a[href*="http"]').each((i, element) => {
          if (results.length >= maxResults) return false;
          
          const $el = $page(element);
          const link = $el.attr('href');
          const title = $el.text().trim();
          
          // Skip DuckDuckGo internal links and directory sites
          if (link && 
              link.startsWith('http') && 
              !link.includes('duckduckgo.com') &&
              !isDirectorySite(link) &&
              title.length > 10) {
            results.push({
              title: title.substring(0, 100),
              link,
              snippet: ''
            });
          }
        });
      }
    };
    
    // Extract from first page
    extractFromPage($);
    console.log(`[DUCKDUCKGO] Page ${pageNum + 1}: Found ${results.length} results (after filtering)`);
    
    // Try to get more pages if we need more results
    // DuckDuckGo pagination: use ?s= parameter (30 results per page)
    while (results.length < maxResults && pageNum < 10) { // Max 10 pages = 300 results
      pageNum++;
      const nextPageOffset = pageNum * 30;
      const nextPageUrl = `${duckDuckGoUrl}&s=${nextPageOffset}`;
      
      console.log(`[DUCKDUCKGO] Fetching page ${pageNum + 1} (offset ${nextPageOffset})...`);
      
      try {
        const nextHtml = await new Promise((resolve, reject) => {
          const url = new URL(nextPageUrl);
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
            // Handle HTTP 202 (Accepted - rate limiting)
            if (res.statusCode === 202) {
              console.warn(`[DUCKDUCKGO] HTTP 202 - Rate limited, waiting longer before retry...`);
              req.destroy();
              reject(new Error('HTTP 202: Rate limited'));
              return;
            }
            
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
        
        $ = cheerio.load(nextHtml);
        const beforeCount = results.length;
        extractFromPage($);
        const newCount = results.length - beforeCount;
        console.log(`[DUCKDUCKGO] Page ${pageNum + 1}: Added ${newCount} new results, Total: ${results.length}`);
        
        // If we didn't get any new results, stop pagination
        if (newCount === 0) {
          console.log(`[DUCKDUCKGO] No new results on page ${pageNum + 1}, stopping pagination`);
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Longer delay for rate limiting
        
      } catch (pageError) {
        // If rate limited, wait longer and try one more time
        if (pageError.message.includes('202') || pageError.message.includes('Rate limited')) {
          console.warn(`[DUCKDUCKGO] Rate limited on page ${pageNum + 1}, waiting 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Try one more time
          try {
            const retryHtml = await new Promise((resolve, reject) => {
              const url = new URL(nextPageUrl);
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
            
            $ = cheerio.load(retryHtml);
            const beforeCount = results.length;
            extractFromPage($);
            const newCount = results.length - beforeCount;
            console.log(`[DUCKDUCKGO] Page ${pageNum + 1} (retry): Added ${newCount} new results, Total: ${results.length}`);
            
            if (newCount === 0) break;
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (retryError) {
            console.warn(`[DUCKDUCKGO] Retry failed for page ${pageNum + 1}:`, retryError.message);
            break;
          }
        } else {
          console.warn(`[DUCKDUCKGO] Could not fetch page ${pageNum + 1}:`, pageError.message);
          break;
        }
      }
    }
    
    console.log(`[DUCKDUCKGO] ✅ DuckDuckGo found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('[DUCKDUCKGO] ❌ DuckDuckGo search error:', error.message);
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
    
    console.log(`[GCS] 🔍 Google Custom Search API: ${searchQuery}`);
    
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
    
    const results = (json.items || [])
      .filter(item => !isDirectorySite(item.link))
      .map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet || ''
      }));
    
    console.log(`[GCS] ✅ Google Custom Search API found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('[GCS] ❌ Google Custom Search API error:', error.message);
    throw new Error(`Google Custom Search API failed: ${error.message}`);
  }
}

/**
 * Option 0.5: OpenStreetMap Nominatim (FREE, UNLIMITED, NO API KEY!)
 * Best free option - no rate limits, no API key needed
 * Returns business locations with addresses and contact info
 */
export async function searchOpenStreetMap(query, country = null, location = null, maxResults = 50) {
  try {
    // Build search query - simplify for OSM (works better with simple queries)
    // OSM doesn't like complex queries like "Commercial Banks" - simplify to "bank" or "banks"
    let searchQuery = query.toLowerCase();
    
    // Simplify common business terms for better OSM results
    const querySimplifications = {
      'commercial banks': 'bank',
      'commercial bank': 'bank',
      'banks': 'bank',
      'hotels': 'hotel',
      'restaurants': 'restaurant',
      'pharmacies': 'pharmacy',
  'hospitals': 'hospital',
      'clinics': 'clinic',
      'shops': 'shop',
  'stores': 'store',
  'coffee shops': 'cafe',
  'coffee shop': 'cafe',
  'coffees': 'cafe',
  'cafes': 'cafe',
  'café': 'cafe',
  'cafeteria': 'cafe',
  'gelato shops': 'ice cream',
  'gelato shop': 'ice cream',
  'gelato': 'ice cream',
  'ice-cream': 'ice cream'
    };
    
    // Apply simplifications
    for (const [complex, simple] of Object.entries(querySimplifications)) {
      if (searchQuery.includes(complex)) {
        searchQuery = searchQuery.replace(complex, simple);
        break;
      }
    }
    
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
    
    // Prepare synonym expansion to avoid 0 results on specific labels
    const base = searchQuery;
    const synonyms = new Set([base]);
    const contains = (w) => base.includes(w);
    if (contains('hairdresser') || contains('hair') || contains('salon')) {
      const basePlace = `${location ? location + ' ' : ''}${country ? (country.length <= 3 ? '' : country) : ''}`.trim();
      ['hairdresser', 'barber', 'barbershop', 'salon', 'beauty salon', 'hair salon'].forEach(term => {
        const q = `${term} ${basePlace}`.trim();
        if (q) synonyms.add(q.toLowerCase());
      });
    }
    // Gelato / Ice cream parlors
    if (contains('gelato') || contains('ice cream') || contains('ice-cream') || contains('gelateria')) {
      const basePlace = `${location ? location + ' ' : ''}${country ? (country.length <= 3 ? '' : country) : ''}`.trim();
      ['gelato', 'gelateria', 'ice cream', 'ice-cream', 'ice cream shop', 'ice cream parlor', 'ice cream parlour'].forEach(term => {
        const q = `${term} ${basePlace}`.trim();
        if (q) synonyms.add(q.toLowerCase());
      });
    }
    
    // Query multiple public Nominatim endpoints in parallel; take first success per term
    const endpoints = [
      'https://nominatim.openstreetmap.org/search',
      'https://nominatim.openstreetmap.fr/search',
      'https://nominatim.openstreetmap.de/search'
    ];
    console.log(`[OSM] 🌍 OpenStreetMap Nominatim Search: ${searchQuery}`);
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    const fetchEndpoint = (base) => new Promise((resolve, reject) => {
      try {
        const url = `${base}?q=${encodeURIComponent(searchQuery)}&format=json&limit=${maxResults}&addressdetails=1&extratags=1`;
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json',
          },
          timeout: 12000
        };
        const req = https.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => { responseData += chunk; });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`API ${base} returned ${res.statusCode}: ${responseData.slice(0,200)}`));
              return;
            }
            resolve(responseData);
          });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
      } catch (e) {
        reject(e);
      }
    });
    
    const allPlaces = [];
    const seenPlaceIds = new Set();
    for (const term of Array.from(synonyms)) {
      searchQuery = term; // reuse local variable in fetchEndpoint closure
      let data;
      try {
        data = await Promise.any(endpoints.map(fetchEndpoint));
      } catch (e) {
        // try next term if endpoints failed for this term
        continue;
      }
      const json = JSON.parse(data || '[]');
      console.log(`[OSM] Raw results for "${term}": ${json?.length || 0} places`);
      for (const p of (json || [])) {
        const k = `${p.osm_type || ''}:${p.osm_id || ''}`;
        if (!seenPlaceIds.has(k)) {
          seenPlaceIds.add(k);
          allPlaces.push(p);
        }
      }
      if (allPlaces.length >= maxResults) break;
    }
    
    console.log(`[OSM] Raw results from API: ${allPlaces.length} places`);
    
    // Filter out directory sites and map to our format
    // OpenStreetMap uses 'class' and 'type' fields (not arrays)
    const results = (allPlaces || [])
      .filter(place => {
        // Filter directory sites
        const website = place.extratags?.website || place.extratags?.url || '';
        if (website && isDirectorySite(website)) {
          return false;
        }
        
        // OpenStreetMap structure: place.class (e.g., 'tourism', 'amenity', 'shop')
        // and place.type (e.g., 'hotel', 'restaurant', 'pharmacy')
        const placeClass = place.class || '';
        const placeType = place.type || '';
        const displayName = place.display_name || '';
        const dn = displayName.toLowerCase();
        const addr = place.address || {};

        // Drop obvious non-business geographies (prevents "Barber Lake"/"Barber Pond" noise)
        if (/(lake|pond|dam|river|creek|reservoir|bay|inlet|swamp|marsh|loch)\b/i.test(displayName)) {
          return false;
        }
        if (['natural','waterway','landuse','place','boundary'].includes(placeClass)) {
          return false;
        }

        // Enforce location and country if provided
        if (location) {
          const loc = (location || '').toLowerCase();
          const addrMatch = [addr.city, addr.town, addr.village, addr.state, addr.county]
            .filter(Boolean).map(s => ('' + s).toLowerCase())
            .some(s => s.includes(loc));
          const nameMatch = dn.includes(loc);
          if (!addrMatch && !nameMatch) {
            return false;
          }
        }
        if (country) {
          const countryNames = {
            'ng': 'nigeria', 'za': 'south africa', 'ke': 'kenya', 'gh': 'ghana',
            'ug': 'uganda', 'tz': 'tanzania', 'et': 'ethiopia', 'eg': 'egypt',
            'zm': 'zambia', 'zw': 'zimbabwe', 'rw': 'rwanda', 'sn': 'senegal',
            'ci': 'ivory coast', 'cm': 'cameroon', 'ao': 'angola', 'ma': 'morocco',
            'tn': 'tunisia', 'dz': 'algeria', 'mg': 'madagascar', 'mw': 'malawi',
            'us': 'united states', 'gb': 'united kingdom', 'ie': 'ireland', 'pt': 'portugal'
          };
          const wantedCountry = (countryNames[country] || country).toLowerCase();
          const addrCountry = (addr.country || '').toLowerCase();
          if (wantedCountry && addrCountry && !addrCountry.includes(wantedCountry)) {
            return false;
          }
          if (wantedCountry && !addrCountry && !dn.includes(wantedCountry)) {
            return false;
          }
        }

        // Accept if it has a name and is a business-related place
        // Don't filter too strictly - accept most places with names
        if (!displayName || displayName.length < 3) {
          return false;
        }
        
        // For hair/salon queries, restrict to hair-related tags
        const hairTerms = ['hairdresser','barber','barbershop','salon','beauty'];
        const isHairQuery = Array.from(synonyms).some(t => /(hairdresser|barber|barbershop|salon|beauty)/i.test(t));

        // Accept common business classes/types
        const businessClasses = ['amenity', 'shop', 'office', 'craft'];
        const businessTypes = ['hotel', 'restaurant', 'pharmacy', 'hospital', 'clinic', 'shop', 
                              'supermarket', 'bank', 'cafe', 'bar', 'company', 'business', 'hairdresser', 'barber', 'beauty', 'ice_cream'];
        
        // If it matches business class/type, include it
        let classOrTypeOk = (businessClasses.includes(placeClass) || businessTypes.some(bt => placeType.includes(bt)));
        if (isHairQuery) {
          // tighten for hair queries
          classOrTypeOk = (['amenity','shop'].includes(placeClass) && (placeType.includes('hair') || placeType.includes('barber') || placeType.includes('beauty') || dn.includes('salon')));
        }
        // Gelato/Ice-cream specific tightening
        const isIceCreamQuery = Array.from(synonyms).some(t => /(gelato|ice ?cream|gelateria)/i.test(t));
        if (isIceCreamQuery) {
          classOrTypeOk = (['amenity','shop'].includes(placeClass) && (placeType.includes('ice_cream') || dn.includes('gelato') || dn.includes('ice cream') || dn.includes('gelateria')));
        }
        if (classOrTypeOk) return true;
        
        // If no website and not a business class/type, be stricter when no country/location is provided
        // This avoids geographic places named "Bank" (villages, regions, etc.)
        if ((!country && !location) && !website) {
          return false;
        }
        
        // Also accept if display_name suggests it's a business (has common business keywords)
        const businessKeywords = ['hotel', 'restaurant', 'pharmacy', 'hospital', 'clinic', 
                                  'shop', 'store', 'company', 'business', 'office', 'cafe', 'bar',
                                  'bank', 'banks', 'commercial', 'financial', 'service', 'hair', 'salon', 'barber', 'beauty'];
        if (businessKeywords.some(keyword => displayName.toLowerCase().includes(keyword))) {
          return true;
        }
        
        // If it has a website, definitely include it
        if (website && website.length > 0) {
          return true;
        }
        
        return false;
      })
      .map(place => {
        // Extract website from extratags
        let website = place.extratags?.website || place.extratags?.url || '';
        if (website && !website.startsWith('http')) {
          website = 'https://' + website;
        }
        
        // Build address from address object
        const addr = place.address || {};
        const addressParts = [
          addr.road,
          addr.house_number,
          addr.city || addr.town || addr.village || addr.municipality,
          addr.state || addr.state_district,
          addr.country
        ].filter(Boolean);
        const address = addressParts.join(', ');
        
        // Extract business name (first part of display_name, or use name field)
        const businessName = place.name || place.display_name?.split(',')[0] || 'Unknown Business';
        
        // For OSM results, we often don't have websites in extratags
        // But we can still use the business - the extractor will try to find the website
        // For now, use a placeholder that the extractor can work with
        let link = website;
        if (!link) {
          // OSM results often don't have websites - that's okay
          // We'll use the business name and the extractor will search for the website
          // Use a searchable format that extractor can parse
          link = `https://www.google.com/search?q=${encodeURIComponent(businessName + ' ' + (address || country || ''))}`;
        }
        
        // Extract phone from extratags
        const phone = place.extratags?.phone || place.extratags?.['contact:phone'] || 
                     place.extratags?.['phone:mobile'] || null;
        
        return {
          title: businessName,
          link: link,
          snippet: address || place.display_name || '',
          phone: phone,
          address: address || null
        };
      })
      .filter(item => {
        // Filter out directory sites
        if (isDirectorySite(item.link)) {
          return false;
        }
        // Filter out OpenStreetMap node pages (not real business websites)
        if (isOSMNodePage(item.link)) {
          console.log(`[OSM] Filtered OSM node page: ${item.link}`);
          return false;
        }
        // Must have a valid link
        if (!item.link || !item.link.startsWith('http')) {
          return false;
        }
        return true;
      })
    
    console.log(`[OSM] ✅ OpenStreetMap found ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('[OSM] ❌ OpenStreetMap error:', error.message);
    throw new Error(`OpenStreetMap search failed: ${error.message}`);
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
    
    // Build search query - don't be too restrictive
    let searchQuery = query;
    if (location) {
      searchQuery += ` ${location}`;
    }
    if (country) {
      // For country, add it as a location term rather than site: filter
      // site: filter is too restrictive and might exclude valid results
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
      const countryName = countryNames[country] || country;
      searchQuery += ` ${countryName}`;
    }
    // Only add "business" if query doesn't already suggest it's a business search
    // This helps with abstract queries like "software companies", "marketing agencies"
    const businessKeywords = ['company', 'companies', 'business', 'businesses', 'agency', 'agencies', 'firm', 'firms'];
    const hasBusinessKeyword = businessKeywords.some(keyword => query.toLowerCase().includes(keyword));
    if (!hasBusinessKeyword) {
      searchQuery += ' company';
    }
    
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(searchQuery)}&count=${Math.min(maxResults, 50)}`;
    
    console.log(`[BING] 🔍 Bing Search API: ${searchQuery}`);
    
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
    
    // Filter and format Bing results
    const results = (json.webPages?.value || [])
      .filter(item => {
        // Filter directory sites
        if (!item.url || isDirectorySite(item.url)) {
          return false;
        }
        // Must have a title
        if (!item.name || item.name.trim().length < 3) {
          return false;
        }
        // Must be a valid URL
        if (!item.url.startsWith('http')) {
          return false;
        }
        return true;
      })
      .map(item => ({
        title: item.name || 'Unknown',
        link: item.url,
        snippet: item.snippet || item.description || ''
      }));
    
    console.log(`[BING] ✅ Bing Search API found ${results.length} results (filtered from ${json.webPages?.value?.length || 0} raw results)`);
    return results;
    
  } catch (error) {
    console.error('[BING] ❌ Bing Search API error:', error.message);
    throw new Error(`Bing Search API failed: ${error.message}`);
  }
}
