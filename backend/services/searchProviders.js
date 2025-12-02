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
  // Additional listicle/directory domains
  'wigmoretrading.com', 'naijatrends.ng', 'wellfound.com', 'getlatka.com',
  'techbehemoths.com', 'f6s.com', 'crunchbase.com', 'producthunt.com',
  // OpenStreetMap pages (not actual business websites)
  'openstreetmap.org'
];

export function isDirectorySite(url, title = null) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = (urlObj.pathname || '').toLowerCase();
    
    // Domain-based block
    if (FILTER_DOMAINS.some(filter => domain.includes(filter))) return true;
    
    // Path heuristics that commonly indicate lists/aggregators (generic patterns)
    const listiclePathPatterns = [
      /\/(category|tags|companies|agencies|estate-agents|real-estate-agents|company-directory|partners|directory|listings|businesses)\b/i,
      /\/(top-|best-|leading-|top\d+|best\d+)/i,
      /\/(list|lists|listing|explore|directory|guide|roundup|compilation)/i,
      /sharearticle|article-list|company-list/i,
      // Generic business type patterns (not hardcoded to specific types)
      /-\d+-best-|-\d+-top-|-\d+-companies/i
    ];
    if (listiclePathPatterns.some(pattern => pattern.test(path))) {
      return true;
    }
    
    // Title-based heuristics for listicles (generic patterns - works for any business type)
    if (title) {
      const titleLower = title.toLowerCase();
      // Generic listicle patterns that work for any business category
      const listiclePatterns = [
        // "Top/Best X in Y" or "X Companies to Know"
        /^(top|best|leading|top \d+|best \d+)\s+.*\s+(companies|providers|solutions|services|businesses|firms|agencies)/i,
        /(companies|providers|solutions|services|businesses|firms|agencies).*(to know|to work|in \w+|for \w+|to watch)/i,
        // "List/Directory/Guide of X"
        /^(list|directory|guide|roundup|compilation).*(of|to|for).*(companies|providers|businesses)/i,
        // "N Best/Top X"
        /\d+\s+(best|top|leading|greatest).*(companies|providers|businesses|firms)/i,
        // "X Companies/Providers in/for Y"
        /.*\s+(companies|providers|businesses|firms).*(in|for|to)\s+\w+/i,
        // Generic "X to Y" patterns
        /.*\s+(to know|to work|to watch|to follow|to invest).*companies/i
      ];
      if (listiclePatterns.some(pattern => pattern.test(titleLower))) {
        return true;
      }
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
 * Handles rate limiting (403/429) with exponential backoff and instance rotation
 */
export async function searchSearxng(query, country = null, location = null, maxResults = 50) {
  try {
    // Support multiple public instances via SEARXNG_URLS (comma-separated)
    // Falls back to single SEARXNG_URL if provided, else an expanded list of known working instances
    const urlsFromEnv = (process.env.SEARXNG_URLS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const singleUrl = (process.env.SEARXNG_URL || '').trim();
    
    // Expanded list of public SearxNG instances (from searx.space and community)
    // Updated with more reliable instances that are less likely to rate-limit
    const fallback = [
      'https://searx.tiekoetter.com',
      'https://search.bus-hit.me',
      'https://searxng.bissisoft.com',
      'https://searx.prvcy.eu',
      'https://searx.fmac.xyz',
      'https://searx.sapti.me',
      'https://searx.rasp.fr',
      'https://searx.work',
      'https://searx.divided-by-zero.eu',
      'https://searx.0x1f4.space',
      'https://searx.be',
      'https://searx.xyz',
      'https://searx.org',
      'https://searxng.eu',
      'https://searx.privacytools.io',
      'https://searx.mastodontech.de'
    ];
    
    const candidates = urlsFromEnv.length > 0 ? urlsFromEnv : (singleUrl ? [singleUrl] : fallback);
    if (candidates.length === 0) {
      throw new Error('SEARXNG_URLS/SEARXNG_URL not configured');
    }

    // Shuffle candidates to distribute load
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    // Build query once - avoid duplicate location if already in query
    let q = query;
    const queryLower = query.toLowerCase();
    const locationLower = location ? location.toLowerCase() : '';
    const locationInQuery = locationLower && (
      queryLower.includes(` ${locationLower}`) || 
      queryLower.includes(`${locationLower} `) ||
      queryLower.includes(` in ${locationLower}`) ||
      queryLower.endsWith(locationLower)
    );
    
    if (location && !locationInQuery) {
      q += ` ${location}`;
    }
    if (country) {
      q += ` ${country}`;
    }

    // Rotate User-Agents to appear more natural
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    ];

    let firstError = null;
    let lastRateLimitError = null;
    
    for (let i = 0; i < shuffled.length; i++) {
      const base = shuffled[i];
      const baseUrl = base.replace(/\/+$/, '');
      const url = `${baseUrl}/search?format=json&q=${encodeURIComponent(q)}&categories=general`;
      
      // Random delay between instances (100-500ms) to avoid appearing like a bot
      if (i > 0) {
        const delay = 100 + Math.random() * 400;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      try {
        const userAgent = userAgents[i % userAgents.length];
        console.log(`[SEARXNG] Query: ${q} → ${baseUrl} (${i + 1}/${shuffled.length})`);
        
        const raw = await safeHttpGet(url, {
          'Accept': 'application/json',
          'User-Agent': userAgent,
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': baseUrl
        }, 12000);
        
        // Check if response is HTML instead of JSON (common when instance is down or blocking)
        if (raw.trim().startsWith('<!DOCTYPE') || raw.trim().startsWith('<html')) {
          throw new Error(`Instance returned HTML instead of JSON (likely blocked or down)`);
        }
        
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
        const errorMsg = e.message || '';
        const isRateLimit = errorMsg.includes('403') || errorMsg.includes('429') || errorMsg.includes('Rate limited');
        const isHtmlResponse = errorMsg.includes('HTML') || errorMsg.includes('<!DOCTYPE') || errorMsg.includes('Unexpected token');
        
        if (isRateLimit) {
          lastRateLimitError = e;
          console.log(`[SEARXNG] ⚠️  ${baseUrl} rate-limited - trying next instance`);
        } else if (isHtmlResponse) {
          console.log(`[SEARXNG] ⚠️  ${baseUrl} returned HTML (blocked/down) - trying next instance`);
        } else {
          console.log(`[SEARXNG] ⚠️  ${baseUrl} failed: ${errorMsg} - trying next instance`);
        }
        
        if (!firstError) firstError = e;
        // Continue to next candidate - don't stop early
      }
    }
    
    // If all failed or returned empty
    // Only throw rate-limit error if ALL instances were rate-limited (not just some HTML responses)
    const allWereRateLimited = lastRateLimitError && shuffled.length > 0;
    if (allWereRateLimited) {
      throw new Error(`SearxNG rate-limited: All ${shuffled.length} instances tried were rate-limited. Consider: 1) Adding BING_API_KEY for digital businesses, 2) Using your own SearxNG instance, 3) Waiting before retrying.`);
    }
    
    // If we tried all instances but got errors (HTML responses, timeouts, etc.), just return empty
    // Don't throw - let other providers handle it
    if (firstError) {
      console.log(`[SEARXNG] ⚠️  All ${shuffled.length} instances failed or returned no results - continuing with other providers`);
      return [];
    }
    
    return [];
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
// Track Google Places API usage to respect free tier limits
let placesApiCallCount = 0;
let placesApiResetDate = new Date();
const PLACES_API_FREE_TIER_LIMIT = 40000; // $200/month = ~40k requests (Text Search = $32 per 1000)
const PLACES_API_DAILY_LIMIT = Math.floor(PLACES_API_FREE_TIER_LIMIT / 30); // ~1333 per day

export async function searchGooglePlaces(query, country = null, location = null, maxResults = 50) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google Places API key not configured');
    }
    
    // Reset counter daily
    const today = new Date().toDateString();
    if (placesApiResetDate.toDateString() !== today) {
      placesApiCallCount = 0;
      placesApiResetDate = new Date();
      console.log(`[PLACES_API] Daily counter reset`);
    }
    
    // Enforce daily limit to avoid exceeding free tier
    if (placesApiCallCount >= PLACES_API_DAILY_LIMIT) {
      throw new Error(`Google Places API daily limit reached (${PLACES_API_DAILY_LIMIT} calls/day). Free tier: $200/month = ~40k requests.`);
    }
    
    // Cap maxResults to reduce API usage (Text Search costs $32 per 1000 requests)
    // Each page = 1 request, so limit pages to reduce costs
    const cappedMaxResults = Math.min(maxResults, 20); // Cap at 20 to reduce API calls
    if (maxResults > cappedMaxResults) {
      console.log(`[PLACES_API] ⚠️  Capping results from ${maxResults} to ${cappedMaxResults} to reduce API usage`);
    }
    
    console.log(`[PLACES_API] Starting search: "${query}", Country: ${country || 'none'}, Location: ${location || 'none'}, Max: ${cappedMaxResults} (API calls: ${placesApiCallCount}/${PLACES_API_DAILY_LIMIT})`);
    
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
    const maxPages = Math.ceil(cappedMaxResults / 20); // 20 results per page, but limit pages
    const actualMaxPages = Math.min(maxPages, 1); // Only fetch 1 page (20 results) to reduce API usage
    
    do {
      // Increment API call counter
      placesApiCallCount++;
      
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
      // Note: Google Places Text Search doesn't return website field - need Place Details for that
      // So we include all places and let the extractor resolve websites later
      const pageResults = (json.results || [])
        .filter(place => {
          // Filter out directory sites if website is present (rare in Text Search results)
          const website = place.website || '';
          if (website && isDirectorySite(website)) {
            return false;
          }
          // Include all places - website will be resolved by extractor using Place Details or LLM
          return true;
        })
        .map(place => {
          // For Google Places, we have name, address, phone - use these directly
          // Don't create Google search links - they're slow to resolve
          // Use a placeholder link that extractor can recognize as "use Places data directly"
          const link = place.website || `places:${place.place_id || place.name}`;
          
          return {
            title: place.name,
            link: link,
            snippet: place.formatted_address || place.vicinity || '',
            phone: place.formatted_phone_number || place.international_phone_number || null,
            address: place.formatted_address || place.vicinity || null,
            placeId: place.place_id || null, // Store place_id for potential Place Details lookup
            isGooglePlace: true // Flag to indicate this is from Google Places
          };
        });
      
      results.push(...pageResults);
      nextPageToken = json.next_page_token;
      pageCount++;
      
      console.log(`[PLACES_API] Page ${pageCount}: Found ${pageResults.length} results (Total: ${results.length}, API calls: ${placesApiCallCount}/${PLACES_API_DAILY_LIMIT})`);
      
      // Stop if we have enough results, no more pages, or hit page limit (to reduce API usage)
      if (results.length >= cappedMaxResults || !nextPageToken || pageCount >= actualMaxPages) {
        break;
      }
      
    } while (nextPageToken && results.length < maxResults && pageCount < maxPages);
    
    const finalResults = results.slice(0, cappedMaxResults);
    console.log(`[PLACES_API] ✅ Found ${finalResults.length} results (filtered from ${results.length} total, API calls used: ${placesApiCallCount}/${PLACES_API_DAILY_LIMIT})`);
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
            // Exponential backoff: 30s, 60s, 120s (DuckDuckGo rate limits can last 1-5 minutes)
            const waitTime = Math.min(30000 * Math.pow(2, retryCount - 1), 120000); // 30s, 60s, 120s max
            console.log(`[DUCKDUCKGO] Rate limited, waiting ${waitTime/1000}s before retry ${retryCount}/${maxRetries}...`);
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
        
        // Allow directory sites through - they'll be expanded in processSearch
        // Only filter out obviously non-business paths (social media, etc.)
        const badPathPattern = /(\/shareArticle|\/user\/|\/profile\/|\/@)/i; // Only filter social/profile paths
        const isBadPath = badPathPattern.test(link);
        
        if (title && link && link.startsWith('http') && !isBadPath) {
          // Include directory sites - they'll be expanded later to extract individual companies
          // This allows SaaS/digital business searches to work even when only directory pages are found
          const isDir = isDirectorySite(link, title);
          if (isDir) {
            console.log(`[DUCKDUCKGO] Including directory site for expansion: ${link}`);
          }
          results.push({
            title,
            link,
            snippet,
            isDirectory: isDir // Mark it so processSearch knows to expand it
          });
          found = true;
        } else if (isBadPath) {
          console.log(`[DUCKDUCKGO] Filtered non-business path: ${link}`);
        }
      });
      
      // Pattern 2: Alternative selectors if first didn't work
      if (!found && results.length < maxResults) {
        $page('a[href*="http"]').each((i, element) => {
          if (results.length >= maxResults) return false;
          
          const $el = $page(element);
          const link = $el.attr('href');
          const title = $el.text().trim();
          
          // Allow directory sites through - they'll be expanded later
          if (link && 
              link.startsWith('http') && 
              !link.includes('duckduckgo.com') &&
              title.length > 10) {
            const isDir = isDirectorySite(link, title);
            results.push({
              title: title.substring(0, 100),
              link,
              snippet: '',
              isDirectory: isDir
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
export async function searchOpenStreetMap(query, country = null, location = null, maxResults = 50, allSearchTerms = null) {
  try {
    // Build search query - simplify for OSM (works better with simple queries)
    // OSM doesn't like complex queries like "Commercial Banks" - simplify to "bank" or "banks"
    let searchQuery = query.toLowerCase();
    
    // Note: We rely on LLM-generated expansions for query variations instead of hardcoded simplifications.
    // The LLM in buildAdaptiveExpansions() generates OSM-friendly terms dynamically.
    // This ensures we can handle any search query without maintaining a manual list.
    
    // Fix: Check if location is already in the query to avoid duplicates like "hr companies in lagos Lagos"
    const queryLower = searchQuery.toLowerCase();
    const locationLower = location ? location.toLowerCase() : '';
    const locationInQuery = locationLower && (
      queryLower.includes(` ${locationLower}`) || 
      queryLower.includes(`${locationLower} `) ||
      queryLower.includes(` in ${locationLower}`) ||
      queryLower.endsWith(locationLower)
    );
    
    if (location && !locationInQuery) {
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
    // Use LLM-generated terms if available (from allSearchTerms), otherwise use local synonyms
    const base = searchQuery;
    const synonyms = new Set([base]);
    
    // If LLM-generated terms are provided, use them (better than hardcoded synonyms)
    // IMPORTANT: Append location/country to each LLM term to ensure location-specific queries
    if (allSearchTerms && allSearchTerms.length > 0) {
      // Build location suffix once (location and country are already in base query, but LLM terms might not have them)
      let locationSuffix = '';
      if (location) {
        locationSuffix += ` ${location}`;
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
        locationSuffix += ` ${countryNames[country] || country}`;
      }
      locationSuffix = locationSuffix.trim();
      
      allSearchTerms.forEach(term => {
        const termLower = term.toLowerCase();
        // Only add terms that are different from base query
        if (termLower !== base.toLowerCase()) {
          // Check if location is already in this LLM term to avoid duplicates
          const termHasLocation = location && (
            termLower.includes(` ${locationLower}`) || 
            termLower.includes(`${locationLower} `) ||
            termLower.includes(` in ${locationLower}`) ||
            termLower.endsWith(locationLower)
          );
          
          // Append location/country to each LLM term if not already present
          // This ensures all OSM queries are location-specific from the start
          const termWithLocation = (locationSuffix && !termHasLocation) 
            ? `${termLower} ${locationSuffix}`.trim() 
            : termLower;
          synonyms.add(termWithLocation);
        }
      });
      console.log(`[OSM] Using ${synonyms.size} search terms (including LLM expansions, all location-specific)`);
    }
    
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

        // STRICT LOCATION FILTERING: When location is provided, enforce it strictly
        // This prevents results from wrong locations (e.g., India results for "Lagos" search)
        if (location) {
          const locationLower = location.toLowerCase();
          const displayNameLower = displayName.toLowerCase();
          const addrCity = (addr.city || '').toLowerCase();
          const addrState = (addr.state || '').toLowerCase();
          const addrCountry = (addr.country || '').toLowerCase();
          const addrRegion = (addr.region || '').toLowerCase();
          
          // Check if location appears in address components or display name
          const locationInAddress = 
            displayNameLower.includes(locationLower) ||
            addrCity.includes(locationLower) ||
            addrState.includes(locationLower) ||
            addrRegion.includes(locationLower);
          
          // If location is specified, STRICTLY require it to match
          // This prevents "design agencies Lagos" from returning results from India/Hong Kong
          if (!locationInAddress) {
            console.log(`[OSM] ⚠️  Rejecting result: location "${location}" not found in "${displayName}" (city: ${addrCity}, state: ${addrState}, country: ${addrCountry})`);
            return false;
          }
        }
        
        // STRICT COUNTRY FILTERING: When country is provided, enforce it
        if (country) {
          const countryNames = {
            'ng': ['nigeria', 'ng'],
            'za': ['south africa', 'za'],
            'ke': ['kenya', 'ke'],
            'gh': ['ghana', 'gh'],
            'us': ['united states', 'usa', 'us'],
            'gb': ['united kingdom', 'uk', 'gb', 'england', 'scotland', 'wales'],
            'in': ['india', 'in'],
            'hk': ['hong kong', 'hk'],
            'pk': ['pakistan', 'pk'],
            'bd': ['bangladesh', 'bd'],
            'sg': ['singapore', 'sg'],
            'my': ['malaysia', 'my'],
            'th': ['thailand', 'th'],
            'id': ['indonesia', 'id'],
            'ph': ['philippines', 'ph'],
            'vn': ['vietnam', 'vn'],
            'ae': ['united arab emirates', 'uae', 'ae'],
            'sa': ['saudi arabia', 'sa'],
            'il': ['israel', 'il'],
            'au': ['australia', 'au'],
            'nz': ['new zealand', 'nz'],
            'ca': ['canada', 'ca'],
            'mx': ['mexico', 'mx'],
            'br': ['brazil', 'br'],
            'ar': ['argentina', 'ar'],
            'co': ['colombia', 'co'],
            'cl': ['chile', 'cl'],
            'pe': ['peru', 'pe'],
            'de': ['germany', 'de'],
            'fr': ['france', 'fr'],
            'it': ['italy', 'it'],
            'es': ['spain', 'es'],
            'nl': ['netherlands', 'nl'],
            'be': ['belgium', 'be'],
            'ch': ['switzerland', 'ch'],
            'at': ['austria', 'at'],
            'se': ['sweden', 'se'],
            'no': ['norway', 'no'],
            'dk': ['denmark', 'dk'],
            'pl': ['poland', 'pl'],
            'ie': ['ireland', 'ie'],
            'pt': ['portugal', 'pt'],
            'cn': ['china', 'cn'],
            'jp': ['japan', 'jp'],
            'kr': ['south korea', 'kr'],
            'ug': ['uganda', 'ug'],
            'tz': ['tanzania', 'tz'],
            'et': ['ethiopia', 'et'],
            'eg': ['egypt', 'eg'],
            'zm': ['zambia', 'zm'],
            'zw': ['zimbabwe', 'zw'],
            'rw': ['rwanda', 'rw'],
            'sn': ['senegal', 'sn'],
            'ci': ['ivory coast', 'ci', 'côte d\'ivoire'],
            'cm': ['cameroon', 'cm'],
            'ao': ['angola', 'ao'],
            'ma': ['morocco', 'ma'],
            'tn': ['tunisia', 'tn'],
            'dz': ['algeria', 'dz'],
            'mg': ['madagascar', 'mg'],
            'mw': ['malawi', 'mw']
          };
          
          const expectedCountries = countryNames[country.toLowerCase()] || [country.toLowerCase()];
          const addrCountryLower = addrCountry.toLowerCase();
          const displayNameLower = displayName.toLowerCase();
          
          // Check if country matches
          const countryMatches = expectedCountries.some(expected => 
            addrCountryLower.includes(expected) ||
            displayNameLower.includes(expected)
          );
          
          if (!countryMatches) {
            console.log(`[OSM] ⚠️  Rejecting result: country "${country}" not found in "${displayName}" (country: ${addrCountry})`);
            return false;
          }
        }

        // Accept if it has a name and is a business-related place
        // Don't filter too strictly - accept most places with names
        if (!displayName || displayName.length < 3) {
          return false;
        }
        
        // Dynamic filtering: Use LLM-generated synonyms to determine if place matches search intent
        // This works for ANY business type (brick & mortar, software, services, etc.)
        // Use all search terms if provided (from LLM expansion), otherwise use local synonyms
        const allTerms = allSearchTerms ? allSearchTerms.map(t => t.toLowerCase()) : Array.from(synonyms).map(t => t.toLowerCase());
        const displayNameLower = displayName.toLowerCase();
        
        // Accept if place name/type matches any of the search synonyms (dynamic, not hardcoded)
        const matchesSearchIntent = allTerms.some(term => {
          const termWords = term.split(/\s+/).filter(w => w.length > 2); // Skip short words
          return termWords.some(word => displayNameLower.includes(word)) ||
                 placeType.toLowerCase().includes(term) ||
                 placeClass.toLowerCase().includes(term);
        });
        
        // Accept common business-related OSM classes (general enough for all business types)
        // These are OSM's standard business categories - not hardcoded business types
        const businessRelatedClasses = ['amenity', 'shop', 'office', 'craft', 'education', 'leisure', 'tourism'];
        const isBusinessClass = businessRelatedClasses.includes(placeClass);
        
        // Fix: Detect and reject street-only names (not actual businesses) - DYNAMIC approach
        // Use OSM's own classification system instead of hardcoded business keywords
        // OSM already tells us if something is a business through placeClass and placeType
        const businessName = place.name || displayName?.split(',')[0] || '';
        const businessNameLower = businessName.toLowerCase().trim();
        
        // Common street suffixes that indicate this might be just a road name
        const streetSuffixes = ['road', 'street', 'avenue', 'boulevard', 'drive', 'lane', 'way', 'close', 'court', 'place', 'terrace', 'grove', 'gardens', 'park', 'square', 'circle', 'highway', 'motorway'];
        
        // Check if businessName ends with a street suffix (e.g., "Ibrahim Taiwo Road")
        const endsWithStreetSuffix = streetSuffixes.some(suffix => businessNameLower.endsWith(' ' + suffix) || businessNameLower === suffix);
        
        // Dynamic business detection using OSM's classification:
        // 1. If OSM classifies it as a business (amenity, shop, office, etc.) → it's a business
        // 2. If it has a website → likely a business
        // 3. If it has a placeType (OSM's business type) → it's a business
        // Note: We don't include matchesSearchIntent here because that's checked later in the filter
        const isLikelyBusiness = isBusinessClass || !!website || !!placeType;
        
        // If it ends with a street suffix AND OSM doesn't classify it as a business AND no website
        // → it's likely just a street name, not a business (reject early)
        if (endsWithStreetSuffix && !isLikelyBusiness) {
          console.log(`[OSM] Skipping street name (not a business): ${businessName} (class: ${placeClass}, type: ${placeType})`);
          return false; // Filter it out early
        }
        
        // Fix: Dynamic approach - determine if query is specific (not generic) to require strict matching
        // Generic terms that indicate a broad search (be permissive)
        const genericTerms = ['companies', 'businesses', 'firms', 'organizations', 'enterprises', 'business', 'company', 'firm'];
        const queryLower = (query || '').toLowerCase().trim();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        
        // Check if query is generic (only contains generic terms + location/country words)
        const hasGenericTerm = genericTerms.some(term => queryWords.includes(term));
        const hasSpecificTerms = queryWords.some(word => {
          // Exclude generic terms, location words, and common stop words
          const stopWords = ['in', 'at', 'near', 'around', 'within', 'from', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to'];
          return !stopWords.includes(word) && !genericTerms.includes(word) && word.length > 3;
        });
        
        // Query is specific if it has meaningful terms beyond generic words
        const isSpecificQuery = hasSpecificTerms || (allSearchTerms && allSearchTerms.length > 0);
        
        // Check if result has query keywords in name/type (used for multiple validation checks)
        const hasQueryKeywords = queryWords.some(word => 
          displayNameLower.includes(word) || 
          placeType?.toLowerCase().includes(word)
        );
        
        // Dynamic relevance filtering: require search intent match for better accuracy
        // This prevents irrelevant businesses (e.g., telecom companies in school searches)
        // Works for ANY business type, not hardcoded to specific categories
        // Fix: Only apply strict filtering for SPECIFIC queries, not generic ones
        // Generic queries like "companies" or "businesses" should be permissive and accept any business class
        if (isSpecificQuery && !matchesSearchIntent) {
          // If query is specific AND it doesn't match search intent, be more selective
          // Only accept if it's in a relevant business class AND has keywords from search query
          // This prevents telecom (office class) from appearing in "hospitals" searches
          // BUT: Generic queries bypass this check and are handled below (more permissive)
          if (!hasQueryKeywords && !website) {
            return false;
          }
        }
        
        // Accept if matches search intent (always)
        if (matchesSearchIntent) {
          return true;
        }
        
        // If query is generic (e.g., "companies", "businesses"), accept if it's in a business class (permissive)
        // This allows generic queries to return various business types
        // If query is specific, we already handled it above (requires intent match)
        if (!isSpecificQuery && isBusinessClass) {
          return true;
        }
        
        // Fix: If no website and doesn't match search intent, be stricter when no country/location is provided
        // This avoids geographic places named after businesses (e.g., "Bank" village)
        // BUT: If query keywords were found, allow it (already validated as relevant above)
        if ((!country && !location) && !website && !matchesSearchIntent && !hasQueryKeywords) {
          return false;
        }
        
        // If it has a website, include it only if it matches search intent (to avoid irrelevant businesses)
        // Fix: For specific queries (e.g., "grocery stores"), require search intent match even with website
        // This prevents tech companies (STEEZETECH) from appearing in grocery store searches
        if (website && website.length > 0) {
          // For specific queries, require search intent match (strict)
          // For generic queries, be more permissive (allow if has website and reasonable name)
          if (isSpecificQuery) {
            // Specific query: require search intent match to prevent irrelevant businesses
            return matchesSearchIntent || hasQueryKeywords;
          } else {
            // Generic query: be permissive (has website and reasonable name)
            return matchesSearchIntent || displayName.length >= 3;
          }
        }
        
        // If location/country match and has a name, be permissive (let extractor/enricher validate)
        // This catches businesses that might not match exact synonyms but are in the right location
        // Fix: For specific queries, still require some relevance (keywords or search intent)
        // For generic queries, be fully permissive
        if ((location || country) && displayName.length >= 3) {
          if (isSpecificQuery) {
            // For specific queries, require at least query keywords or search intent match
            // This prevents completely irrelevant businesses (e.g., domain sellers, computer repair) from passing through
            return matchesSearchIntent || hasQueryKeywords;
          } else {
            // For generic queries, be fully permissive
            return true;
          }
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
        // But we can still use the business - the extractor will try to find the website using LLM
        // Convert OSM node pages to Google search links so extractor can resolve them
        let link = website;
        if (!link || link.includes('openstreetmap.org')) {
          // OSM results often don't have websites or only have OSM node pages - that's okay
          // We'll use the business name and the extractor will search for the website using LLM
          // Use a searchable format that extractor can parse (extractor.js handles google.com/search links)
          const searchQuery = `${businessName} ${address || location || country || ''}`.trim();
          link = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
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
      .filter(item => item !== null) // Filter out null items (rejected street names)
      .filter(item => {
        // Filter out directory sites
        if (isDirectorySite(item.link)) {
          return false;
        }
        // Don't filter out OSM node pages - we convert them to Google search links above
        // The extractor will use LLM to resolve the actual website
        // Must have a valid link (Google search links are valid - extractor handles them)
        if (!item.link || !item.link.startsWith('http')) {
          return false;
        }
        // Accept Google search links (they'll be resolved by extractor using LLM)
        if (item.link.includes('google.com/search')) {
          return true;
        }
        // Filter out raw OSM node pages (shouldn't happen after conversion above, but just in case)
        if (isOSMNodePage(item.link)) {
          console.log(`[OSM] Converting OSM node page to search link: ${item.link}`);
          // Convert to Google search link instead of filtering out
          const businessName = item.title || 'business';
          const location = item.snippet || '';
          item.link = `https://www.google.com/search?q=${encodeURIComponent(businessName + ' ' + location)}`;
          return true;
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


