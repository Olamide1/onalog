import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

// In-memory short TTL caches
const resolverCache = new Map(); // key -> { value, expiresAt }
const directoryCache = new Map();
const TTL_MS = 20 * 60 * 1000; // 20 minutes

function cacheGet(cache, key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { cache.delete(key); return null; }
  return hit.value;
}
function cacheSet(cache, key, value, ttl = TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}
/**
 * Extract contact information from a website
 * @param {string} url - The URL to extract from
 * @param {string} defaultCountry - Optional country code for phone formatting (e.g., 'ke', 'ng')
 */
export async function extractContactInfo(url, defaultCountry = null) {
  console.log(`[EXTRACT] Starting extraction for: ${url}`);
  
  // If URL is a Google search link (from OSM results without websites), resolve to a real website first
  if (url && url.includes('google.com/search')) {
    console.log(`[EXTRACT] ⚠️  URL is a Google search link (OSM result without website) - attempting to resolve website`);
    // Extract search query (business name + location)
    const qMatch = url.match(/[?&]q=([^&]+)/);
    const rawQ = qMatch ? decodeURIComponent(qMatch[1]).replace(/\+/g, ' ') : '';
    const resolveQuery = rawQ || 'business';
    const resolved = await resolveWebsiteFromQuery(resolveQuery);
    if (resolved) {
      // Fix: Additional validation - reject example.com/localhost after resolution
      const invalidDomains = ['example.com', 'localhost', '127.0.0.1', '0.0.0.0', 'test.com', 'placeholder.com', 'domain.com', 'website.com', 'site.com'];
      try {
        const resolvedUrl = new URL(resolved);
        const hostname = resolvedUrl.hostname.toLowerCase();
        
        if (invalidDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
          console.log(`[EXTRACT] ⚠️  Rejected invalid/placeholder domain after resolution: ${resolved}`);
          // Fall through to minimal data return
        } else {
          console.log(`[EXTRACT] 🔗 Resolved website: ${resolved}`);
          // Recurse by extracting from the resolved site
          try {
            return await extractContactInfo(resolved, defaultCountry);
          } catch (e) {
            console.log(`[EXTRACT] ⚠️  Resolution extract failed, falling back to minimal data: ${e.message}`);
          }
        }
      } catch (urlError) {
        console.log(`[EXTRACT] ⚠️  Invalid resolved URL format: ${resolved}`);
        // Fall through to minimal data return
      }
    } else {
      console.log(`[EXTRACT] ⚠️  Could not resolve website, returning fallback data`);
    }
    // Fix: Improved fallback - extract better business name and location from query
    // Extract business name (first part before comma or location preposition)
    let businessName = rawQ.split(',')[0].trim() || 
                       rawQ.split(/\s+(?:in|at|near|around)\s+/i)[0].trim() || 
                       'Unknown Business';
    
    // Fix: Clean up generic terms to get a better company name
    // Generic terms that indicate a business type (not a specific company name)
    const genericTerms = ['grocery', 'store', 'shop', 'supermarket', 'market', 'convenience', 'provision', 'food', 'restaurant', 'cafe', 'bar', 'hotel', 'hospital', 'clinic', 'school', 'university', 'bank', 'office', 'company', 'business', 'firm', 'enterprise'];
    
    // Try to extract a more specific name by removing generic terms
    let cleanedName = businessName;
    for (const term of genericTerms) {
      // Remove generic terms (case-insensitive, whole word only)
      cleanedName = cleanedName.replace(new RegExp(`\\b${term}\\b`, 'gi'), '').trim();
      // Clean up multiple spaces
      cleanedName = cleanedName.replace(/\s+/g, ' ').trim();
    }
    
    // If cleaned name is too short or empty, use original (but capitalize properly)
    const finalName = cleanedName.length >= 3 ? cleanedName : businessName;
    
    // Capitalize first letter of each word for better presentation
    const capitalizedName = finalName.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    // Extract location from query if available (for better address)
    const locationMatch = rawQ.match(/\s+(?:in|at|near|around)\s+([^,]+)/i);
    const extractedLocation = locationMatch ? locationMatch[1].trim() : null;
    
    // Fix: Return better fallback data instead of completely empty
    return {
      emails: [],
      phoneNumbers: [],
      socials: {},
      address: extractedLocation || null, // Include extracted location as address
      aboutText: '',
      categorySignals: [],
      companyName: capitalizedName,
      website: url, // Keep original Google search link (better than null)
      decisionMakers: []
    };
  }
  
  try {
    // Use AbortController for timeout (Node.js 18+)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // Increased timeout to 20s
    
    console.log(`[EXTRACT] Fetching page...`);
    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal,
        redirect: 'follow'
      });
    } catch (fetchError) {
      // Handle network errors (DNS, connection refused, timeout, etc.)
      clearTimeout(timeoutId);
      console.log(`[EXTRACT] ⚠️  Network error: ${fetchError.message} - Will use available data from search results.`);
      let companyName = 'Unknown Company';
      try {
        const domain = new URL(url).hostname.replace('www.', '');
        companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      } catch (e) {
        // Keep default
      }
      return {
        emails: [],
        phoneNumbers: [],
        socials: {},
        address: null,
        aboutText: '',
        categorySignals: [],
        companyName: companyName,
        website: url,
        decisionMakers: []
      };
    }
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Handle 403 Forbidden - some sites block automated requests
      if (response.status === 403) {
        console.log(`[EXTRACT] ⚠️  HTTP 403: Site blocked automated access. Will use available data from search results.`);
        // Try to extract company name from URL as fallback
        let companyName = 'Unknown Company';
        try {
          const u = new URL(url);
          const domain = u.hostname.replace('www.', '');
          const baseName = domain.split('.')[0];
          companyName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
          // Special handling for TripAdvisor-like paths: extract venue name from URL
          if (/tripadvisor\./i.test(domain)) {
            const m = decodeURIComponent(u.pathname).match(/Reviews?-.*?([A-Za-z0-9_]+(?:_[A-Za-z0-9_]+){0,6})/i);
            if (m && m[1]) {
              const pretty = m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
              if (pretty.length > 2) companyName = pretty;
            }
          }
        } catch (e) {
          // Keep default
        }
        // Attempt to resolve first‑party quickly using the derived name
        // Fix: Don't resolve for very short names (like "Ng" from ng.africabz.com)
        // These are often country codes or abbreviations that will resolve incorrectly
        let resolved = null;
        try {
          // Only attempt resolution if company name is meaningful (at least 3 characters, not just abbreviations)
          if (companyName && 
              companyName !== 'Unknown Company' && 
              companyName.length >= 3 &&
              !/^[A-Z]{1,2}$/.test(companyName)) { // Reject single/double letter abbreviations
            const resolveQuery = `${companyName} official site`;
            resolved = await resolveWebsiteFromQuery(resolveQuery);
            
            // Fix: Validate that resolved website makes sense for the original URL context
            // Reject if resolved domain doesn't match the business context (e.g., nationalguard.mil for a grocery store)
            if (resolved) {
              try {
                const resolvedHost = new URL(resolved).hostname.toLowerCase();
                const originalHost = new URL(url).hostname.toLowerCase();
                
                // If resolved domain is completely unrelated (e.g., .mil, .gov for a business search),
                // or if it's a known incorrect resolution pattern, reject it
                const invalidPatterns = [
                  /\.mil$/,  // Military domains
                  /\.gov$/,  // Government domains
                  /nationalguard/i,  // National Guard specifically
                  /army\.mil/i,
                  /navy\.mil/i
                ];
                
                // Check if resolved domain matches invalid patterns
                const isInvalid = invalidPatterns.some(pattern => pattern.test(resolvedHost));
                
                // Also check if resolved domain shares any meaningful part with original
                // (e.g., "ng.africabz.com" should not resolve to "nationalguard.mil")
                const originalParts = originalHost.split('.').filter(p => p.length > 2); // Meaningful parts
                const resolvedParts = resolvedHost.split('.').filter(p => p.length > 2);
                const hasCommonPart = originalParts.some(op => 
                  resolvedParts.some(rp => rp.includes(op) || op.includes(rp))
                );
                
                if (isInvalid || (!hasCommonPart && originalParts.length > 0)) {
                  console.log(`[EXTRACT] ⚠️  Rejected invalid website resolution: ${resolved} (doesn't match context: ${url})`);
                  resolved = null;
                }
              } catch (validationError) {
                // If validation fails, err on the side of caution and reject
                console.log(`[EXTRACT] ⚠️  Could not validate resolved website, rejecting: ${resolved}`);
                resolved = null;
              }
            }
          }
        } catch (_) {}
        // Return minimal data - prefer resolved site if found, but only if it's valid
        return {
          emails: [],
          phoneNumbers: [],
          socials: {},
          address: null,
          aboutText: '',
          categorySignals: [],
          companyName: companyName,
          website: resolved || url,
          decisionMakers: []
        };
      }
      // Handle other HTTP errors (404, 500, etc.)
      console.log(`[EXTRACT] ⚠️  HTTP ${response.status}: ${response.statusText} - Will use available data from search results.`);
      let companyName = 'Unknown Company';
      try {
        const domain = new URL(url).hostname.replace('www.', '');
        companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      } catch (e) {
        // Keep default
      }
      return {
        emails: [],
        phoneNumbers: [],
        socials: {},
        address: null,
        aboutText: '',
        categorySignals: [],
        companyName: companyName,
        website: url,
        decisionMakers: []
      };
    }
    
    console.log(`[EXTRACT] ✅ Page fetched (${response.status}), parsing HTML...`);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract emails
    console.log(`[EXTRACT] Extracting emails...`);
    const emails = extractEmails(html, url);
    console.log(`[EXTRACT] Found ${emails.length} emails`);
    
            // Extract phone numbers
            console.log(`[EXTRACT] Extracting phone numbers...`);
            const phoneNumbers = extractPhoneNumbers(html, url, defaultCountry);
            console.log(`[EXTRACT] Found ${phoneNumbers.length} phone numbers`);
    
    // Extract WhatsApp links
    const whatsappLinks = extractWhatsAppLinks(html, url);
    console.log(`[EXTRACT] Found ${whatsappLinks.length} WhatsApp links`);
    
    // Extract social media links
    const socials = extractSocialLinks($, url);
    const socialCount = Object.values(socials).filter(v => v).length;
    console.log(`[EXTRACT] Found ${socialCount} social media links`);
    
    // Extract address
    const address = extractAddress($);
    console.log(`[EXTRACT] Address: ${address || 'not found'}`);
    
    // Extract about text
    const aboutText = extractAboutText($);
    console.log(`[EXTRACT] About text: ${aboutText ? `${aboutText.substring(0, 50)}...` : 'not found'}`);
    
    // Extract category signals
    const categorySignals = extractCategorySignals($);
    console.log(`[EXTRACT] Found ${categorySignals.length} category signals`);
    
    // Extract company name
    let companyName = extractCompanyName($, url);
    console.log(`[EXTRACT] Company name: ${companyName || 'not found'}`);
    
    // Extract website (improved)
    let website = extractWebsite($, url);
    console.log(`[EXTRACT] Website: ${website || url}`);

    // If this is a review/aggregator domain (e.g., TripAdvisor), derive the real business name
    // and attempt to resolve the first‑party website so the UI shows the venue rather than the aggregator.
    try {
      const host = new URL(url).hostname.replace('www.', '');
      const isTripAdvisor = /tripadvisor\./i.test(host);
      const isAggregator = isTripAdvisor || /opentable\.|zomato\.|yelp\.|restaurantguru\./i.test(host);
      if (isAggregator) {
        // Derive name from title / og:title (e.g., "Plan B Bistro, Pretoria - Tripadvisor")
        const pageTitle = ($('meta[property=\"og:title\"]').attr('content') || $('title').text() || '').trim();
        const cleaned = pageTitle
          .replace(/\s*-\s*Tripadvisor.*/i, '')
          .replace(/\s*\|\s*Tripadvisor.*/i, '')
          .replace(/\s*-\s*TripAdvisor.*/i, '')
          .replace(/\s*\|\s*TripAdvisor.*/i, '')
          .replace(/\s*\|\s*Zomato.*/i, '')
          .replace(/\s*-\s*Zomato.*/i, '')
          .replace(/\s*\|\s*Yelp.*/i, '')
          .replace(/\s*-\s*Yelp.*/i, '')
          .trim();
        if (cleaned && cleaned.length > 2) {
          companyName = companyName || cleaned;
        }
        // Try to resolve a first‑party site using the derived name + location
        const locPart = (extractAddress($) || '').split(',').slice(-2).join(' ').trim();
        const resolveQuery = [companyName, locPart].filter(Boolean).join(' ');
        if (resolveQuery && (!website || /tripadvisor\.|zomato\.|yelp\.|restaurantguru\./i.test(new URL(website || url).hostname))) {
          const resolvedUrl = await resolveWebsiteFromQuery(`${resolveQuery} official site`);
          if (resolvedUrl && !isDirectoryDomain(resolvedUrl)) {
            website = resolvedUrl;
            console.log(`[EXTRACT] Resolved first‑party from aggregator: ${website}`);
          }
        }
      }
    } catch (_) {
      // ignore derivation errors
    }
    
    // Extract decision makers from About Us / Team pages
    console.log(`[EXTRACT] Extracting decision makers...`);
    const decisionMakers = extractDecisionMakers($, url);
    console.log(`[EXTRACT] Found ${decisionMakers.length} decision makers`);
    
    const result = {
      companyName,
      website: website || url,
      emails,
      phoneNumbers,
      whatsappLinks,
      socials,
      address,
      aboutText,
      categorySignals,
      decisionMakers
    };
    
    console.log(`[EXTRACT] ✅ Extraction complete for ${url}`);
    return result;
    
  } catch (error) {
    console.error(`[EXTRACT] ❌ Extraction error for ${url}:`, error.message);
    console.error(`[EXTRACT] Error stack:`, error.stack);
    return {
      companyName: null,
      website: url,
      emails: [],
      phoneNumbers: [],
      whatsappLinks: [],
      socials: {},
      address: null,
      aboutText: null,
      categorySignals: [],
      decisionMakers: []
    };
  }
}

/**
 * Discover executives on a company's website by scanning common pages:
 * - about, team, leadership, management, board, company, contacto/empresa (es), contactos
 * - press/news pages for leadership mentions
 * Returns an array of { name, title, source, confidence }
 */
export async function discoverExecutives(websiteUrl) {
  try {
    if (!websiteUrl || !websiteUrl.startsWith('http')) return [];
    const base = new URL(websiteUrl);
    const baseOrigin = `${base.protocol}//${base.hostname}`;
    const candidates = [
      '/', '/about', '/team', '/leadership', '/management', '/board', '/company',
      '/about-us', '/our-team', '/who-we-are',
      // Spanish/Portuguese variants
      '/sobre', '/sobre-nosotros', '/quienes-somos', '/equipo', '/direccion', '/directiva', '/gerencia',
      '/contacto', '/contactos', '/empresa',
      // Contact pages often list execs or department heads
      '/contact', '/contact-us',
      // Press/news sometimes list leadership quotes
      '/news', '/press', '/media'
    ];
    // Deduplicate and keep within same host
    const seen = new Set();
    const toFetch = [];
    for (const path of candidates) {
      const u = new URL(path, baseOrigin).toString();
      if (!seen.has(u)) { seen.add(u); toFetch.push(u); }
    }
    const execs = [];
    // Simple helper to parse names/titles from HTML snippets
    const extractFromHtml = (html, url) => {
      const $ = cheerio.load(html);
      // Look for common selectors
      const blocks = [
        '.team-member', '.member', '.leadership', '.executive', '.profile', '.person',
        '.board-member', '.management', '.staff', '.director'
      ];
      const results = [];
      blocks.forEach(sel => {
        $(sel).each((_, el) => {
          const name = ($(el).find('h2, h3, .name').first().text() || '').trim();
          const title = ($(el).find('h4, .title, .role, .position').first().text() || '').trim();
          if (name && name.length > 3 && title && title.length > 2) {
            results.push({ name, title, source: url, confidence: 0.85 });
          }
        });
      });
      // Fallback: headings with "Name - Title" or "Title - Name"
      $('h1,h2,h3,h4,p,li').each((_, el) => {
        const text = ($(el).text() || '').replace(/\s+/g, ' ').trim();
        const m = text.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\s*[-–|,]\s*([A-Za-zÀ-ÿ&\/\s]{3,60})/);
        if (m) {
          const name = m[1].trim();
          const title = m[2].trim();
          if (name && title) results.push({ name, title, source: url, confidence: 0.65 });
        }
      });
      return results;
    };
    for (const u of toFetch.slice(0, 12)) {
      try {
        const res = await fetch(u, { headers: { 'User-Agent': 'Onalog/1.0' }, timeout: 12000 });
        if (!res.ok) continue;
        const html = await res.text();
        execs.push(...extractFromHtml(html, u));
        if (execs.length >= 12) break;
      } catch {
        // ignore page-level errors
      }
    }
    // Normalize: keep unique names, prefer higher confidence
    const best = new Map();
    for (const e of execs) {
      const key = e.name.toLowerCase();
      if (!best.has(key) || best.get(key).confidence < e.confidence) best.set(key, e);
    }
    // Basic title filtering to business/exec roles
    const execKeywords = /(chief|ceo|coo|cfo|cto|vp|vice|president|director|head|manager|partnership|business|strategy|operations|marketing|sales|procurement|admin|founder|owner)/i;
    let result = Array.from(best.values())
      .filter(e => execKeywords.test(e.title));
    // Sort by relevance using title scoring, then trim
    result = result
      .map(e => ({ ...e, confidence: e.confidence || scoreTitle(e.title) }))
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 10);
    return result;
  } catch {
    return [];
  }
}
/**
 * Attempt to resolve a real website URL from a business query.
 * Prefers SearxNG (if configured), otherwise falls back to a simple DuckDuckGo HTML scrape.
 */
async function resolveWebsiteFromQuery(query) {
  try {
    // Try SearxNG if configured
    const searxUrls = (process.env.SEARXNG_URLS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const searxSingle = (process.env.SEARXNG_URL || '').trim();
    const searxCandidates = searxUrls.length > 0 ? searxUrls : (searxSingle ? [searxSingle] : []);
    for (const base of searxCandidates) {
      try {
        const endpoint = `${base.replace(/\/+$/, '')}/search?format=json&q=${encodeURIComponent(query)}&categories=general`;
        const res = await fetch(endpoint, { headers: { 'Accept': 'application/json','User-Agent': 'Onalog/1.0' }, timeout: 12000 });
        if (res.ok) {
          const json = await res.json();
          const results = (json.results || []).filter(r => r.url && r.title);
          let candidate = results.find(r => r.url.startsWith('http') && !isDirectoryDomain(r.url));
          // Retry with "official site" bias if the first pass yielded only directories/reviews
          if (!candidate) {
            const endpoint2 = `${base.replace(/\/+$/, '')}/search?format=json&q=${encodeURIComponent(query + ' official site')}&categories=general`;
            const res2 = await fetch(endpoint2, { headers: { 'Accept': 'application/json','User-Agent': 'Onalog/1.0' }, timeout: 12000 });
            if (res2.ok) {
              const json2 = await res2.json();
              const results2 = (json2.results || []).filter(r => r.url && r.title);
              candidate = results2.find(r => r.url.startsWith('http') && !isDirectoryDomain(r.url));
            }
          }
          if (candidate) return candidate.url;
        }
      } catch (_) {}
    }
    // Fallback: minimal DuckDuckGo scrape
    const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': 'Onalog/1.0', 'Accept': 'text/html' }, timeout: 12000 });
    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const match = html.match(/uddg=([^&"]+)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.startsWith('http') && !isDirectoryDomain(decoded)) {
          return decoded;
        }
      }
      // Second pass with "official site"
      const ddgUrl2 = `https://duckduckgo.com/html/?q=${encodeURIComponent(query + ' official site')}`;
      const ddgRes2 = await fetch(ddgUrl2, { headers: { 'User-Agent': 'Onalog/1.0', 'Accept': 'text/html' }, timeout: 12000 });
      if (ddgRes2.ok) {
        const html2 = await ddgRes2.text();
        const match2 = html2.match(/uddg=([^&"]+)/);
        if (match2) {
          const decoded2 = decodeURIComponent(match2[1]);
          if (decoded2.startsWith('http') && !isDirectoryDomain(decoded2)) {
            return decoded2;
          }
        }
      }
    }
    // LLM guess as a last resort
    try {
      if (process.env.OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        // Fix: Don't use example.com in prompt - use a placeholder format instead
        const prompt = `Given this business string, infer the likely official website domain.

Business: ${query}

Rules:
- Output ONLY a JSON object with this exact format: {"domain": "https://actual-domain.com"}
- Must be a first-party business domain (not review sites, aggregators, or social media)
- If you cannot determine a real domain, return {"domain": null}
- Do NOT return example.com, localhost, or placeholder domains
- Do NOT return the literal string "example.com" - only return actual business domains

Output the JSON object only:`;
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You infer official business domains from business names. Output JSON only. Never return example.com, localhost, or placeholder domains. Return null if uncertain.' },
            { role: 'user', content: prompt }
          ]
        });
        const json = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
        const url = json.domain;
        
        // Fix: Validate resolved URL - reject example.com, localhost, and invalid domains
        if (url && /^https?:\/\//i.test(url) && !isDirectoryDomain(url)) {
          // Reject placeholder/invalid domains
          const invalidDomains = ['example.com', 'localhost', '127.0.0.1', '0.0.0.0', 'test.com', 'placeholder.com', 'domain.com', 'website.com', 'site.com'];
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.toLowerCase();
          
          if (invalidDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
            console.log(`[EXTRACT] ⚠️  Rejected invalid/placeholder domain: ${url}`);
            return null;
          }
          
          // Fix: Reject government/military domains for business queries
          // These are often incorrect resolutions (e.g., "Ng" → "nationalguard.mil")
          const invalidTlds = ['.mil', '.gov'];
          const isGovernmentDomain = invalidTlds.some(tld => hostname.endsWith(tld));
          if (isGovernmentDomain) {
            console.log(`[EXTRACT] ⚠️  Rejected government/military domain for business query: ${url}`);
            return null;
          }
          
          // Fix: Validate that resolved domain has some relationship to the query
          // Extract meaningful words from query (ignore "official site", location words, etc.)
          const queryWords = query.toLowerCase()
            .replace(/\s+official\s+site/gi, '')
            .replace(/\b(in|at|near|around|within|from|the|a|an|and|or|of|for|to)\b/gi, '')
            .split(/\s+/)
            .filter(w => w.length > 2);
          
          // Extract meaningful parts from hostname
          const hostnameParts = hostname.split('.').filter(p => p.length > 2);
          
          // Check if any query word appears in hostname (fuzzy match)
          const hasMatch = queryWords.some(qw => 
            hostnameParts.some(hp => hp.includes(qw) || qw.includes(hp))
          );
          
          // If query has meaningful words but none match hostname, be suspicious
          // But allow if query is very short (might be abbreviation)
          if (queryWords.length > 0 && !hasMatch && queryWords.some(qw => qw.length > 3)) {
            console.log(`[EXTRACT] ⚠️  Rejected resolved domain (no match with query): ${url} for query "${query}"`);
            return null;
          }
          
          return url;
        }
      }
    } catch {}
    return null;
  } catch {
    return null;
  }
}

/**
 * Expand a directory/listicle page into individual company website links.
 * Heuristics: extract <a href>, keep external domains, drop socials/known directories,
 * dedupe by hostname, and cap results.
 */
export async function expandDirectoryCompanies(listPageUrl, maxCompanies = 25) {
  try {
    const cached = cacheGet(directoryCache, `${listPageUrl}|${maxCompanies}`);
    if (cached) return cached;
    if (!listPageUrl || !listPageUrl.startsWith('http')) return [];
    const res = await fetch(listPageUrl, { headers: { 'User-Agent': 'Onalog/1.0' }, timeout: 15000 });
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type') || '';
    let html = '';
    if (contentType.includes('application/pdf')) {
      // PDF: try to extract URLs from raw buffer (best-effort)
      const buf = await res.arrayBuffer();
      const raw = Buffer.from(buf).toString('latin1'); // crude but catches http(s) in many PDFs
      const urlMatches = Array.from(raw.matchAll(/https?:\/\/[^\s<>()"]+/g)).map(m => m[0]);
      const uniq = Array.from(new Set(urlMatches));
      const filtered = uniq
        .filter(u => {
          try {
            const h = new URL(u).hostname.replace('www.','');
            return !['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','wikipedia.org'].some(d => h.includes(d));
          } catch { return false; }
        })
        .slice(0, maxCompanies)
        .map(u => ({ title: new URL(u).hostname.replace('www.',''), link: u, snippet: `From PDF: ${listPageUrl}` }));
      cacheSet(directoryCache, `${listPageUrl}|${maxCompanies}`, filtered);
      return filtered;
    }
    html = await res.text();
    const $ = cheerio.load(html);
    const anchors = $('a[href]');
    // Only filter out well-known social/aggregator platforms (universal, not business-type specific)
    const badDomains = [
      'facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com',
      'wikipedia.org'
    ];
    // Generic path patterns for listicles (works for any business type)
    const badPath = /(\/category\/|\/tags\/|\/top-|\/best|\/list|\/explore\/|shareArticle|\/companies|\/directory|\/listings)/i;
    const seenHosts = new Set();
    const results = [];
    const baseHost = new URL(listPageUrl).hostname.replace('www.','');
    
    // Also try to extract from structured data (JSON-LD, microdata)
    try {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html());
          const items = Array.isArray(json) ? json : [json];
          items.forEach(item => {
            if (item['@type'] === 'Organization' || item['@type'] === 'LocalBusiness' || item['@type'] === 'Corporation') {
              const url = item.url || item.sameAs?.[0] || item.website;
              if (url && url.startsWith('http')) {
                try {
                  const u = new URL(url);
                  const host = u.hostname.replace('www.', '');
                  if (host !== baseHost && !badDomains.some(d => host.includes(d)) && !seenHosts.has(host)) {
                    seenHosts.add(host);
                    results.push({
                      title: item.name || item.legalName || host,
                      link: u.toString(),
                      snippet: item.description || ''
                    });
                  }
                } catch {}
              }
            }
          });
        } catch {}
      });
    } catch {}
    
    anchors.each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href.startsWith('http')) return;
      if (badPath.test(href)) return;
      try {
        const u = new URL(href);
        const host = u.hostname.replace('www.','');
        if (host === baseHost) return; // skip same-host links
        if (badDomains.some(d => host.includes(d))) return;
        if (seenHosts.has(host)) return;
        seenHosts.add(host);
        const title = ($(el).text() || host).trim() || host;
        // Skip if title looks like a listicle pattern (generic, works for any business type)
        const titleLower = title.toLowerCase();
        const isListicleTitle = /^(top|best|leading|list|directory|guide|roundup|compilation)/i.test(titleLower) && 
            (titleLower.includes('companies') || titleLower.includes('providers') || titleLower.includes('businesses') || 
             titleLower.includes('firms') || titleLower.includes('agencies') || titleLower.includes('services'));
        if (isListicleTitle) {
          return; // Skip listicle titles
        }
        results.push({
          title: title,
          link: u.toString(),
          snippet: ''
        });
      } catch {
        // ignore invalid URLs
      }
    });
    let final = results.slice(0, maxCompanies);
    // If we found very few links, try an LLM assist (optional) to extract company sites from text
    if (final.length < Math.min(5, maxCompanies/4) && process.env.OPENAI_API_KEY) {
      try {
        const llmFound = await llmExtractCompanyLinksFromHtml(html, listPageUrl, maxCompanies);
        if (llmFound && llmFound.length > 0) {
          // Merge with heuristic results
          const seen = new Set(final.map(x => x.link));
          for (const item of llmFound) {
            if (item.link && !seen.has(item.link)) {
              final.push(item);
              seen.add(item.link);
            }
            if (final.length >= maxCompanies) break;
          }
        }
      } catch {
        // ignore LLM assist failure
      }
    }
    cacheSet(directoryCache, `${listPageUrl}|${maxCompanies}`, final);
    return final;
  } catch {
    return [];
  }
}

// Optional LLM assist: parse list page to company domains when anchors aren't sufficient
async function llmExtractCompanyLinksFromHtml(html, baseUrl, maxCompanies) {
  try {
    const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
    if (!openai) return [];
    // Compress text a bit
    const text = cheerio.load(html)('body').text().replace(/\s+/g, ' ').slice(0, 16000);
    const prompt = `You will extract up to ${Math.min(maxCompanies, 30)} real company websites from the given text of a web page that lists companies.
Rules:
- Return JSON with an array named companies. Each item: { "title": string, "url": string }.
- url must be the company's official website (starting with http or https), not social links, not aggregator pages, not article pages.
- Prefer primary company domains (e.g., example.com), not specific blog/news subpages unless nothing else is available.
- Only include unique companies and valid URLs.
Base URL of the list page: ${baseUrl}

Text:
${text}`;
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Extract company websites from list pages and return clean JSON only.' },
        { role: 'user', content: prompt }
      ]
    });
    const content = resp.choices?.[0]?.message?.content || '{}';
    const json = JSON.parse(content);
    const companies = Array.isArray(json.companies) ? json.companies : [];
    const filtered = [];
    const seen = new Set();
    for (const c of companies) {
      if (!c || !c.url || !c.url.startsWith('http')) continue;
      try {
        const u = new URL(c.url);
        const host = u.hostname.replace('www.','');
        if (['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','wikipedia.org'].some(d => host.includes(d))) continue;
        if (seen.has(host)) continue;
        seen.add(host);
        filtered.push({ title: c.title || host, link: u.toString(), snippet: '' });
      } catch {
        continue;
      }
      if (filtered.length >= maxCompanies) break;
    }
    return filtered;
  } catch {
    return [];
  }
}

// Improve exec relevance: sort by title seniority
function scoreTitle(title = '') {
  const t = (title || '').toLowerCase();
  if (/(chief|ceo|coo|cfo|cto|vp|vice|president|director|head|manager|partnership|business|strategy|operations|marketing|sales|procurement|admin|founder|owner)/.test(t)) return 1.0;
  if (/(vp|vice president|director|head of|general manager|country manager|executive)/.test(t)) return 0.85;
  if (/(manager|lead|supervisor)/.test(t)) return 0.7;
  return 0.5;
}
function isDirectoryDomain(url) {
  try {
    // Fully dynamic pattern-based detection (no hardcoded business-type-specific domains)
    // Uses path and domain pattern matching that works for any business type
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '').toLowerCase();
    const path = (urlObj.pathname || '').toLowerCase();
    
    // Only block universal social/aggregator platforms (not business-type specific)
    const universalBlocked = ['google.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'wikipedia.org'];
    if (universalBlocked.some(b => domain.includes(b))) return true;
    
    // Pattern-based path detection (works for any business type, not hardcoded)
    const listiclePathPatterns = [
      /\/(category|tags|companies|agencies|directory|listings|businesses|list|explore|locations)\b/i,
      /\/(top-|best-|leading-|top\d+|best\d+)/i,
      /\/(list|lists|listing|directory|guide|roundup|compilation)/i,
      /sharearticle|article-list|company-list|location-list/i,
      // Generic numbered list patterns
      /-\d+-best-|-\d+-top-|-\d+-companies/i
    ];
    if (listiclePathPatterns.some(pattern => pattern.test(path))) return true;
    
    // Dynamic domain pattern detection (looks for directory indicators in domain names)
    // Uses generic patterns, not specific domain names
    const directoryDomainIndicators = [
      /directory/i,
      /listings?/i,
      /businesslist/i,
      /yellow/i,
      /map/i,  // Generic map/directory sites
      /place/i, // Generic place listing sites
      /bizinfo/i, // Generic business info sites
      /college.*list/i, // Generic college/school listing patterns
      /school.*list/i
    ];
    if (directoryDomainIndicators.some(pattern => pattern.test(domain))) return true;
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract email addresses from HTML
 */
function extractEmails(html, baseUrl) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(emailRegex) || [];
  
  // Filter out common false positives
  const filtered = matches.filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes('example.com') &&
           !lower.includes('test@') &&
           !lower.includes('placeholder') &&
           !lower.includes('your-email');
  });
  
  // Remove duplicates and add source
  const unique = [...new Set(filtered)];
  return unique.map(email => ({
    email: email.toLowerCase(),
    source: 'website',
    confidence: 0.8
  }));
}

/**
 * Extract phone numbers from HTML - Improved accuracy
 * @param {string} html - HTML content
 * @param {string} baseUrl - Base URL for context
 * @param {string} defaultCountry - Optional country code for formatting
 */
function extractPhoneNumbers(html, baseUrl, defaultCountry = null) {
  // Remove script and style tags to avoid false positives
  const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Look for phone numbers in specific contexts (tel: links, contact sections)
  const telLinks = html.match(/tel:([+\d\s\-\(\)]+)/gi) || [];
  const contactPatterns = [
    // Phone: +1234567890
    /phone[:\s]*([+\d\s\-\(\)]{10,20})/gi,
    // Call: +1234567890
    /call[:\s]*([+\d\s\-\(\)]{10,20})/gi,
    // Contact: +1234567890
    /contact[:\s]*([+\d\s\-\(\)]{10,20})/gi,
    // Tel: +1234567890
    /tel[:\s]*([+\d\s\-\(\)]{10,20})/gi
  ];
  
  const matches = [];
  
  // Extract from tel: links (most reliable)
  telLinks.forEach(tel => {
    const phone = tel.replace(/tel:/gi, '').trim();
    if (phone.length >= 10) {
      matches.push(phone);
    }
  });
  
  // Extract from contact patterns
  contactPatterns.forEach(pattern => {
    const found = cleanHtml.match(pattern) || [];
    found.forEach(match => {
      const phone = match.replace(/phone|call|contact|tel/gi, '').replace(/[:\s]+/, '').trim();
      if (phone.length >= 10 && phone.length <= 20) {
        matches.push(phone);
      }
    });
  });
  
  // Common phone patterns (fallback)
  const generalPatterns = [
    /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    /\+?\d{10,15}/g
  ];
  
  generalPatterns.forEach(pattern => {
    const found = cleanHtml.match(pattern) || [];
    matches.push(...found);
  });
  
  // Clean and format with strict validation
  const cleaned = matches
    .map(phone => {
      // Remove common false positives
      let cleaned = phone.replace(/[^\d+]/g, '');
      
      // Must have country code or be 10+ digits
      if (cleaned.length < 10 || cleaned.length > 15) return null;
      
      // Filter out obviously wrong numbers
      if (/^(\d)\1{8,}$/.test(cleaned)) return null; // All same digit (1111111111)
      if (/^0{8,}$/.test(cleaned)) return null; // All zeros
      if (/^1{8,}$/.test(cleaned)) return null; // All ones
      
      // US numbers should be 10 or 11 digits (with +1)
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        // Valid US number
      } else if (cleaned.startsWith('+1') && cleaned.length === 12) {
        // Valid US number with +
      } else if (cleaned.length === 10 && !cleaned.startsWith('1')) {
        // Could be US number without country code
      } else if (cleaned.length > 11) {
        // International number - validate format
        if (!cleaned.startsWith('+') && !cleaned.match(/^[1-9]\d{9,14}$/)) {
          return null; // Invalid international format
        }
      }
      
      // Reject numbers that look like IDs, timestamps, etc.
      // Numbers starting with 0 followed by many digits are often IDs
      if (cleaned.match(/^0\d{9,}$/)) return null;
      
      // Numbers that are too round (like 1000000000) are suspicious
      if (cleaned.match(/^[1-9]0{8,}$/)) return null;
      
      return cleaned;
    })
    .filter(phone => phone !== null)
    .filter((phone, index, self) => self.indexOf(phone) === index)
    .slice(0, 3); // Limit to top 3 phone numbers (most reliable)
  
  // Extract country from URL if available for phone formatting
  let urlCountry = defaultCountry; // Use provided country first
  if (!urlCountry) {
    try {
      const urlObj = new URL(baseUrl);
      const domain = urlObj.hostname.toLowerCase();
      // Simple country detection from domain
      if (domain.includes('.ke')) urlCountry = 'ke';
      else if (domain.includes('.ng')) urlCountry = 'ng';
      else if (domain.includes('.za')) urlCountry = 'za';
      else if (domain.includes('.gh')) urlCountry = 'gh';
      else if (domain.includes('.us')) urlCountry = 'us';
      else if (domain.includes('.uk') || domain.includes('.co.uk')) urlCountry = 'gb';
      else if (domain.includes('.ca')) urlCountry = 'ca';
    } catch {}
  }
  
  return cleaned.map(phone => {
    const formatted = formatPhone(phone, urlCountry);
    return {
      phone: formatted, // Store formatted version
      country: detectCountry(formatted),
      formatted: formatted,
      source: 'website',
      confidence: telLinks.some(t => t.includes(phone)) ? 0.9 : 0.7
    };
  });
}

/**
 * Extract website URL - Improved
 */
function extractWebsite($, baseUrl) {
  // Try to find canonical URL first (most reliable)
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical && canonical.startsWith('http')) {
    return canonical;
  }
  
  // Try og:url
  const ogUrl = $('meta[property="og:url"]').attr('content');
  if (ogUrl && ogUrl.startsWith('http')) {
    return ogUrl;
  }
  
  // Use base URL if it's a valid website
  try {
    const url = new URL(baseUrl);
    return url.origin;
  } catch {
    return baseUrl;
  }
}

/**
 * Extract WhatsApp links
 */
function extractWhatsAppLinks(html, baseUrl) {
  const whatsappRegex = /https?:\/\/wa\.me\/[\d+]+|https?:\/\/api\.whatsapp\.com\/send\?phone=[\d+]+/gi;
  const matches = html.match(whatsappRegex) || [];
  return [...new Set(matches)];
}

/**
 * Extract social media links
 */
function extractSocialLinks($, baseUrl) {
  const socials = {
    linkedin: null,
    twitter: null,
    facebook: null,
    instagram: null
  };
  
  // Find all links
  $('a[href]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (!href) return;
    
    const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
    
    if (fullUrl.includes('linkedin.com')) {
      socials.linkedin = fullUrl;
    } else if (fullUrl.includes('twitter.com') || fullUrl.includes('x.com')) {
      socials.twitter = fullUrl;
    } else if (fullUrl.includes('facebook.com')) {
      socials.facebook = fullUrl;
    } else if (fullUrl.includes('instagram.com')) {
      socials.instagram = fullUrl;
    }
  });
  
  return socials;
}

/**
 * Extract address information
 */
function extractAddress($) {
  // Look for common address patterns
  const addressSelectors = [
    '[itemprop="address"]',
    '.address',
    '#address',
    '[class*="address"]'
  ];
  
  for (const selector of addressSelectors) {
    const elem = $(selector).first();
    if (elem.length) {
      return elem.text().trim();
    }
  }
  
  return null;
}

/**
 * Extract about/description text
 */
function extractAboutText($) {
  const selectors = [
    'meta[name="description"]',
    '[itemprop="description"]',
    '.about',
    '#about',
    '[class*="about"]'
  ];
  
  for (const selector of selectors) {
    const elem = $(selector).first();
    if (elem.length) {
      return elem.attr('content') || elem.text().trim();
    }
  }
  
  // Fallback to first paragraph
  const firstP = $('p').first();
  if (firstP.length) {
    return firstP.text().trim().substring(0, 500);
  }
  
  return null;
}

/**
 * Extract category/business type signals
 */
function extractCategorySignals($) {
  const signals = [];
  
  // Look for keywords in meta tags, headings, and content
  const text = $('body').text().toLowerCase();
  const keywords = [
    'manufacturing', 'retail', 'wholesale', 'distribution',
    'services', 'consulting', 'technology', 'software',
    'logistics', 'transport', 'agriculture', 'mining',
    'construction', 'real estate', 'finance', 'banking'
  ];
  
  keywords.forEach(keyword => {
    if (text.includes(keyword)) {
      signals.push(keyword);
    }
  });
  
  return signals;
}

/**
 * Extract company name
 */
function extractCompanyName($, url) {
  // Try meta tags first
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) return ogTitle.trim();
  
  const title = $('title').text();
  if (title) {
    // Clean up title (remove common suffixes)
    return title.replace(/\s*[-|]\s*.*$/, '').trim();
  }
  
  // Fallback to domain name
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  } catch {
    return 'Unknown Company';
  }
}

/**
 * Extract decision makers from About Us / Team pages
 * Looks for names and titles in common patterns - ENHANCED VERSION
 */
function extractDecisionMakers($, baseUrl) {
  const decisionMakers = [];
  const seen = new Set();
  
  // Common selectors for team/about pages - EXPANDED LIST
  const teamSelectors = [
    '.team-member', '.team', '.staff', '.leadership', '.executive',
    '.about-team', '.our-team', '.meet-team', '.team-list',
    '.management', '.board', '.founders', '.directors',
    '[class*="team"]', '[class*="staff"]', '[class*="leadership"]',
    '[class*="executive"]', '[class*="management"]', '[class*="founder"]',
    '[id*="team"]', '[id*="staff"]', '[id*="leadership"]', '[id*="about"]'
  ];
  
  // Pattern 1: Look for structured team sections - MORE AGGRESSIVE
  for (const selector of teamSelectors) {
    $(selector).each((i, elem) => {
      const $el = $(elem);
      // Try multiple name selectors - be more aggressive
      const name = $el.find('h1, h2, h3, h4, h5, h6, .name, [class*="name"], [data-name], strong, b, .person-name, .member-name').first().text().trim() ||
                   $el.find('img').attr('alt') || // Sometimes names are in image alt text
                   $el.text().split('\n')[0].trim(); // First line of text
      // Try multiple title selectors
      const title = $el.find('.title, .role, .position, [class*="title"], [class*="role"], [class*="position"], [data-title], [data-role], .job-title, .designation').first().text().trim() ||
                    $el.find('p, span, div').filter((i, el) => {
                      const txt = $(el).text().toLowerCase();
                      return /(ceo|cto|cfo|director|manager|president|founder|head|lead|vp|chief|executive)/.test(txt);
                    }).first().text().trim();
      
      if (name && name.length > 2 && name.length < 50 && !name.includes('@') && !name.match(/^\d+$/) && !name.toLowerCase().includes('click here')) {
        // Fix: More restrictive validation - require actual name patterns (two capitalized words)
        // Reject common navigation/UI text like "Skip to main content", "Product details", etc.
        const commonNonNamePatterns = [
          /^(skip|click|read|view|see|learn|more|about|home|menu|navigation|product|service|contact|login|sign|register|search|filter|sort|close|open|next|previous|back|forward|submit|cancel|save|delete|edit|add|remove|select|choose|browse|shop|buy|cart|checkout|account|profile|settings|help|support|faq|terms|privacy|policy|cookie|legal|copyright|all rights reserved)/i,
          /^(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|must|can|cannot|shall|ought)/i,
          /^(details|information|description|summary|overview|features|benefits|pricing|plans|packages|options|solutions|products|services|resources|blog|news|events|careers|jobs|team|company|about|contact|support|help|faq|terms|privacy|policy)/i
        ];
        
        // Check if it matches common non-name patterns
        const isNonNamePattern = commonNonNamePatterns.some(pattern => pattern.test(name));
        if (isNonNamePattern) {
          return; // Skip this match
        }
        
        // Require actual name pattern: two or more capitalized words (e.g., "John Smith", "Mary Jane")
        // Or single word with title prefix (e.g., "Dr. Smith", "Mr. Johnson")
        // Pattern: (optional title prefix) + at least one capitalized word + (optional second capitalized word)
        const namePattern = /^(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Professor|Rev\.|Reverend)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$|^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/;
        
        if (namePattern.test(name)) {
          const key = `${name.toLowerCase()}-${title.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            decisionMakers.push({
              name: name,
              title: title || 'Team Member',
              source: 'website',
              confidence: title ? 0.85 : 0.6
            });
          }
        }
      }
    });
  }
  
  // Pattern 2: Look for "Name, Title" patterns in text - ENHANCED & MORE AGGRESSIVE
  const text = $('body').text();
  // Define patterns with their group structure: [pattern, nameGroupIndex, titleGroupIndex]
  const nameTitlePatterns = [
    // Pattern 1: "John Smith, CEO" or "John Smith - CEO" - (name, title)
    { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)[,\-–—]\s*([A-Z][A-Za-z\s&]+(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive|Managing|General|Coordinator|Supervisor|Administrator|Officer|Specialist))/gi, nameIdx: 1, titleIdx: 2 },
    // Pattern 2: "CEO: John Smith" or "CEO John Smith" - (title, name)
    { pattern: /(CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive|Managing|General|Coordinator|Supervisor)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi, nameIdx: 2, titleIdx: 1 },
    // Pattern 3: "John Smith - Managing Director" or "John Smith, Managing Director" - (name, title)
    { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[-–—,]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*(?:Director|Manager|President|Owner|Head|Lead|VP|Chief|Executive|Coordinator|Supervisor|Administrator|Officer))/gi, nameIdx: 1, titleIdx: 2 },
    // Pattern 4: "Dr. John Smith" or "Mr. John Smith" followed by title - (name, title)
    { pattern: /(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)[,\-–—]\s*([A-Z][A-Za-z\s&]+(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Chief|Executive))/gi, nameIdx: 1, titleIdx: 2 },
    // Pattern 5: "John Smith, john.smith@company.com" - extract name and email, infer title from context
    { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[,\-–—]\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi, nameIdx: 1, titleIdx: null, hasEmail: true }
  ];
  
  nameTitlePatterns.forEach(({ pattern, nameIdx, titleIdx, hasEmail }) => {
    // Fix: Reset lastIndex before using global regex to ensure clean state
    // This prevents issues if the loop exits early, leaving lastIndex at a non-zero value
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(text)) !== null && decisionMakers.length < 15) {
      const name = match[nameIdx]?.trim();
      let title = titleIdx ? match[titleIdx]?.trim() : null;
      const email = hasEmail ? match[2]?.trim() : null;
      
      // Fix: Validate name exists before attempting title inference
      // If name extraction failed (undefined), skip this match entirely
      // Fix: Use if-else instead of continue (continue doesn't work in forEach callbacks)
      if (!name || name.length < 2) {
        // Skip this match if name is invalid - the while loop will continue to next iteration
        // We can't use continue in forEach, but wrapping in else ensures we skip processing
      } else {
        // For email pattern, try to infer title from surrounding context
        if (hasEmail && !title) {
          // Look for title before or after the match in nearby text
          const matchStart = match.index;
          const contextStart = Math.max(0, matchStart - 150);
          const contextEnd = Math.min(text.length, matchStart + match[0].length + 150);
          const context = text.substring(contextStart, contextEnd);
          
          // Try to find a title near the name (look for common patterns)
          // Fix: Only create dynamic regex patterns if name is valid (already validated above)
          const titlePatterns = [
            /(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive|Managing|General|Coordinator|Supervisor|Administrator|Officer|Medical Director|Chief Medical Officer|Dr\.|Professor|Prof\.)/i,
            // Look for "Name, Title" or "Title: Name" patterns in context
            // name is guaranteed to be valid at this point (checked above)
            new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\-–—]\\s*([A-Z][A-Za-z\\s&]+(?:Director|Manager|President|Owner|Head|Lead|VP|Chief|Executive|Coordinator|Supervisor|Administrator|Officer|Medical|Chief))`, 'i'),
            new RegExp(`([A-Z][A-Za-z\\s&]+(?:Director|Manager|President|Owner|Head|Lead|VP|Chief|Executive|Coordinator|Supervisor|Administrator|Officer|Medical|Chief))[:\\.]\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
          ];
          
          for (const titlePattern of titlePatterns) {
            const titleMatch = context.match(titlePattern);
            if (titleMatch) {
              title = titleMatch[1] || titleMatch[0];
              break;
            }
          }
          
          if (!title) {
            title = 'Contact'; // Default if no title found
          }
        }
        
        // Validate name and title before adding (name already validated above, but double-check)
        if (name && name.length > 2 && name.length < 50 && !name.includes('@') && !name.match(/^\d+$/) && title && title.length > 0) {
          const key = `${name.toLowerCase()}-${title.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            // Validate email if present (should not contain placeholder text)
            let validEmail = email || null;
            if (validEmail) {
              const placeholderTerms = ['firstname', 'lastname', 'firstinitial', 'lastinitial'];
              if (placeholderTerms.some(term => validEmail.toLowerCase().includes(term))) {
                validEmail = null; // Reject placeholder emails
              }
            }
            
            decisionMakers.push({
              name: name,
              title: title,
              email: validEmail, // Include email if found and valid
              source: 'website',
              confidence: validEmail ? 0.9 : 0.75 // Higher confidence if email found
            });
          }
        }
      }
    }
    
    // Fix: Reset lastIndex after loop to ensure clean state for potential future use
    // This is especially important if the loop exited early due to decisionMakers.length < 15
    pattern.lastIndex = 0;
  });
  
  // Pattern 3: Look in structured data (JSON-LD) - ENHANCED
  $('script[type="application/ld+json"]').each((i, elem) => {
    try {
      const json = JSON.parse($(elem).html());
      
      // Organization founder
      // Fix: Enforce 15-item limit during extraction to prevent unnecessary processing
      if (json['@type'] === 'Organization' && json.founder && decisionMakers.length < 15) {
        const founders = Array.isArray(json.founder) ? json.founder : [json.founder];
        for (const founder of founders) {
          if (decisionMakers.length >= 15) break; // Early exit when limit reached
          if (founder.name || founder['@id']) {
            const name = founder.name || (founder['@id'] ? founder['@id'].split('/').pop() : null);
            if (name) {
              const key = name.toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);
                decisionMakers.push({
                  name: name,
                  title: 'Founder',
                  source: 'structured_data',
                  confidence: 0.9
                });
              }
            }
          }
        }
      }
      
      // Person schema
      // Fix: Enforce 15-item limit during extraction to prevent unnecessary processing
      if (json['@type'] === 'Person' && json.name && decisionMakers.length < 15) {
        const key = json.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          decisionMakers.push({
            name: json.name,
            title: json.jobTitle || 'Team Member',
            source: 'structured_data',
            confidence: 0.85
          });
        }
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  });
  
  // Pattern 4: Look for names in headings on About/Team pages - NEW
  const aboutPageIndicators = ['about', 'team', 'leadership', 'management', 'founders', 'executives'];
  const currentPath = new URL(baseUrl).pathname.toLowerCase();
  if (aboutPageIndicators.some(indicator => currentPath.includes(indicator))) {
    $('h1, h2, h3, h4').each((i, elem) => {
      const text = $(elem).text().trim();
      // Look for "Name - Title" or "Name, Title" in headings
      const headingMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)[,\-–—]\s*(.+)$/);
      if (headingMatch && decisionMakers.length < 15) {
        const name = headingMatch[1];
        const title = headingMatch[2];
        const key = `${name.toLowerCase()}-${title.toLowerCase()}`;
        if (!seen.has(key) && name.length > 2 && name.length < 50) {
          seen.add(key);
          decisionMakers.push({
            name: name,
            title: title,
            source: 'website',
            confidence: 0.8
          });
        }
      }
    });
  }
  
  return decisionMakers.slice(0, 15); // Increased limit to 15
}

/**
 * Detect country from phone number
 */
export function detectCountry(phone) {
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Country codes (most common)
  const countryCodes = {
    '+234': 'NG', '+27': 'ZA', '+254': 'KE', '+233': 'GH', '+256': 'UG',
    '+255': 'TZ', '+251': 'ET', '+20': 'EG', '+260': 'ZM', '+263': 'ZW',
    '+250': 'RW', '+221': 'SN', '+225': 'CI', '+237': 'CM', '+244': 'AO',
    '+212': 'MA', '+216': 'TN', '+213': 'DZ', '+261': 'MG', '+265': 'MW',
    '+1': 'US', '+44': 'GB', '+1': 'CA', '+52': 'MX', '+61': 'AU',
    '+91': 'IN', '+86': 'CN', '+81': 'JP', '+82': 'KR', '+65': 'SG',
    '+33': 'FR', '+49': 'DE', '+39': 'IT', '+34': 'ES', '+31': 'NL',
    '+32': 'BE', '+41': 'CH', '+43': 'AT', '+46': 'SE', '+47': 'NO',
    '+45': 'DK', '+48': 'PL', '+353': 'IE', '+351': 'PT', '+55': 'BR',
    '+54': 'AR', '+57': 'CO', '+56': 'CL', '+51': 'PE', '+971': 'AE',
    '+966': 'SA', '+972': 'IL', '+92': 'PK', '+880': 'BD', '+64': 'NZ',
    '+84': 'VN', '+62': 'ID', '+63': 'PH', '+66': 'TH', '+60': 'MY'
  };
  
  // Check full codes first (longer ones)
  const sortedCodes = Object.keys(countryCodes).sort((a, b) => b.length - a.length);
  for (const code of sortedCodes) {
    if (cleaned.startsWith(code)) {
      return countryCodes[code];
    }
  }
  
  return 'Unknown';
}

/**
 * Format phone number and add country code if missing
 */
export function formatPhone(phone, defaultCountry = null) {
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it doesn't start with +, try to add country code
  if (!cleaned.startsWith('+')) {
    // If it's 10 digits and default country is US/CA, add +1
    if (cleaned.length === 10 && (defaultCountry === 'us' || defaultCountry === 'ca')) {
      cleaned = '+1' + cleaned;
    }
    // If it's 11 digits and starts with 1, add +
    else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    }
    // For Kenya (254), Nigeria (234), etc. - add country code if missing
    else if (defaultCountry) {
      const countryCodeMap = {
        'ke': '254', 'ng': '234', 'za': '27', 'gh': '233', 'ug': '256',
        'tz': '255', 'et': '251', 'eg': '20', 'zm': '260', 'zw': '263',
        'rw': '250', 'sn': '221', 'ci': '225', 'cm': '237', 'ao': '244',
        'ma': '212', 'tn': '216', 'dz': '213', 'mg': '261', 'mw': '265',
        'us': '1', 'gb': '44', 'ca': '1', 'mx': '52', 'au': '61',
        'in': '91', 'cn': '86', 'jp': '81', 'kr': '82', 'sg': '65',
        'fr': '33', 'de': '49', 'it': '39', 'es': '34', 'nl': '31',
        'be': '32', 'ch': '41', 'at': '43', 'se': '46', 'no': '47',
        'dk': '45', 'pl': '48', 'ie': '353', 'pt': '351', 'br': '55',
        'ar': '54', 'co': '57', 'cl': '56', 'pe': '51', 'ae': '971',
        'sa': '966', 'il': '972', 'pk': '92', 'bd': '880', 'nz': '64',
        'vn': '84', 'id': '62', 'ph': '63', 'th': '66', 'my': '60'
      };
      
      const code = countryCodeMap[defaultCountry.toLowerCase()];
      if (code) {
        // Check if number already starts with country code
        if (!cleaned.startsWith(code)) {
          cleaned = '+' + code + cleaned;
        } else {
          cleaned = '+' + cleaned;
        }
      } else {
        cleaned = '+' + cleaned;
      }
    } else {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}

export async function quickClassifyUrl(url) {
  try {
    const cacheKey = `classify:${url}`;
    const cached = cacheGet(directoryCache, cacheKey);
    if (cached) return cached;

    let html = '';
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        },
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(t);
      if (res.ok) html = await res.text();
    } catch {
      html = '';
    }

    const reasons = [];
    let score = 0; // >0 => first-party, <0 => directory

    // Path/title patterns
    try {
      const u = new URL(url);
      const path = (u.pathname || '').toLowerCase();
      if (/(^|\/)(category|tags|companies|agencies|directory|list|locations|explore)(\/|$)/.test(path)) {
        reasons.push('path:listlike');
        score -= 2;
      }
      if (/top-\d+|best|list-of|the-\d+-best/.test(path)) {
        reasons.push('path:ranked');
        score -= 2;
      }
    } catch {}

    if (html) {
      const $ = cheerio.load(html);
      const title = ($('title').text() || '').trim().toLowerCase();
      if (/\b(top\s*\d+|\d+\s*best|list of|directory)\b/.test(title)) {
        reasons.push('title:listlike');
        score -= 2;
      }

      // Detect ItemList/CollectionPage
      let hasItemList = false;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const txt = $(el).text() || '';
          const node = JSON.parse(txt);
          const nodes = Array.isArray(node) ? node : [node];
          for (const n of nodes) {
            const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
            if (types.some(t => (t || '').toLowerCase().includes('itemlist')) ||
                types.some(t => (t || '').toLowerCase().includes('collectionpage'))) {
              hasItemList = true;
              break;
            }
            if (Array.isArray(n.itemListElement) && n.itemListElement.length >= 5) {
              hasItemList = true;
              break;
            }
          }
        } catch {}
      });
      if (hasItemList) { reasons.push('schema:itemList'); score -= 3; }

      // LocalBusiness/Organization (first-party)
      let hasLocalBusiness = false;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const node = JSON.parse($(el).text() || '{}');
          const nodes = Array.isArray(node) ? node : [node];
          for (const n of nodes) {
            const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
            if (types.some(t => (t || '').toLowerCase().includes('localbusiness')) ||
                types.some(t => (t || '').toLowerCase().includes('organization'))) {
              hasLocalBusiness = true;
              break;
            }
          }
        } catch {}
      });
      if (hasLocalBusiness) { reasons.push('schema:localbusiness'); score += 2; }

      // External link ratio
      try {
        const origin = new URL(url).hostname.replace(/^www\./, '');
        let external = 0, internal = 0;
        const hosts = new Set();
        $('a[href]').each((_, a) => {
          const href = ($(a).attr('href') || '').trim();
          if (!href.startsWith('http')) { internal++; return; }
          try {
            const h = new URL(href).hostname.replace(/^www\./, '');
            if (h === origin) internal++; else { external++; hosts.add(h); }
          } catch { external++; }
        });
        if (hosts.size >= 5 && external > internal) {
          reasons.push('links:many-external');
          score -= 2;
        }
      } catch {}
    }

    const result = { isFirstParty: score > 0, score, reasons };
    cacheSet(directoryCache, cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch {
    return { isFirstParty: true, score: 0, reasons: ['fallback'] };
  }
}

