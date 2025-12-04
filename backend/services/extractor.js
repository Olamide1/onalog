import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { 
  isInvalidDomain, 
  isUniversalBlocked, 
  isSocialMediaDomain,
  isGenericCompanyName as isGenericNameFromConfig,
  isKnownDirectoryDomain,
  DIRECTORY_DOMAIN_PATTERNS,
  DIRECTORY_FALSE_POSITIVES,
  DOMAIN_MARKETPLACE_PATTERNS
} from '../config/domainValidation.js';
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
  
  // Handle Google Places results (marked with "places:" prefix) - skip slow website resolution
  if (url && url.startsWith('places:')) {
    console.log(`[EXTRACT] ℹ️  Google Places result - using provided data directly (no website resolution needed)`);
    // Extract business name from the placeholder URL
    const businessName = url.replace('places:', '').trim();
    
    // Return minimal data - the search route will merge this with Places API data (name, address, phone)
    return {
      emails: [],
      phoneNumbers: [],
      socials: {},
      address: null, // Will be set from Places API data in search.js
      aboutText: '',
      categorySignals: [],
      companyName: businessName,
      website: null, // No website available from Places Text Search
      decisionMakers: []
    };
  }
  
  // If URL is a Google search link (from OSM results without websites), resolve to a real website first
  if (url && url.includes('google.com/search')) {
    console.log(`[EXTRACT] ⚠️  URL is a Google search link - attempting quick resolution (5s timeout)`);
    // Extract search query (business name + location)
    const qMatch = url.match(/[?&]q=([^&]+)/);
    const rawQ = qMatch ? decodeURIComponent(qMatch[1]).replace(/\+/g, ' ') : '';
    const resolveQuery = rawQ || 'business';
    
    // Quick resolution with timeout - don't block extraction
    try {
      const resolved = await Promise.race([
        resolveWebsiteFromQuery(resolveQuery),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]).catch(() => null); // Return null on timeout instead of throwing
      
      if (resolved) {
        const invalidDomains = ['example.com', 'localhost', '127.0.0.1', '0.0.0.0', 'test.com', 'placeholder.com', 'domain.com', 'website.com', 'site.com'];
        try {
          const resolvedUrl = new URL(resolved);
          const hostname = resolvedUrl.hostname.toLowerCase();
          
          if (!invalidDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
            console.log(`[EXTRACT] 🔗 Resolved website: ${resolved}`);
            try {
              return await extractContactInfo(resolved, defaultCountry);
            } catch (e) {
              console.log(`[EXTRACT] ⚠️  Resolution extract failed: ${e.message}`);
            }
          }
        } catch (urlError) {
          // Invalid URL, fall through
        }
      }
    } catch (e) {
      console.log(`[EXTRACT] ⚠️  Website resolution timeout/failed: ${e.message}`);
    }
    
    // Fallback: extract business name from query
    let businessName = rawQ.split(',')[0].trim() || 
                       rawQ.split(/\s+(?:in|at|near|around)\s+/i)[0].trim() || 
                       'Unknown Business';
    
    const genericTerms = ['grocery', 'store', 'shop', 'supermarket', 'market', 'convenience', 'provision', 'food', 'restaurant', 'cafe', 'bar', 'hotel', 'hospital', 'clinic', 'school', 'university', 'bank', 'office', 'company', 'business', 'firm', 'enterprise'];
    let cleanedName = businessName;
    for (const term of genericTerms) {
      cleanedName = cleanedName.replace(new RegExp(`\\b${term}\\b`, 'gi'), '').trim();
      cleanedName = cleanedName.replace(/\s+/g, ' ').trim();
    }
    const finalName = cleanedName.length >= 3 ? cleanedName : businessName;
    const capitalizedName = finalName.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    const locationMatch = rawQ.match(/\s+(?:in|at|near|around)\s+([^,]+)/i);
    const extractedLocation = locationMatch ? locationMatch[1].trim() : null;
    
    return {
      emails: [],
      phoneNumbers: [],
      socials: {},
      address: extractedLocation || null,
      aboutText: '',
      categorySignals: [],
      companyName: capitalizedName,
      website: null, // Couldn't resolve
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
    
    // Extract emails (enhanced - handles obfuscation, contact forms, data attributes, meta tags)
    console.log(`[EXTRACT] Extracting emails...`);
    let emails = extractEmails(html, url);
    console.log(`[EXTRACT] Found ${emails.length} emails`);
    
    // Debug: Log if no emails found to help diagnose issues
    if (emails.length === 0) {
      console.log(`[EXTRACT] ⚠️  No emails found. HTML length: ${html.length}, Has mailto links: ${html.includes('mailto:')}, Has data-email: ${html.includes('data-email')}`);
    }
    
    // Extract phone numbers
    console.log(`[EXTRACT] Extracting phone numbers...`);
    const phoneNumbers = extractPhoneNumbers(html, url, defaultCountry);
    console.log(`[EXTRACT] Found ${phoneNumbers.length} phone numbers`);
    
    // Debug: Log if no phone numbers found to help diagnose issues
    if (phoneNumbers.length === 0) {
      console.log(`[EXTRACT] ⚠️  No phone numbers found. HTML length: ${html.length}, Has tel: links: ${html.includes('tel:')}, Has phone patterns: ${/phone|call|contact|tel/i.test(html)}`);
    }
    
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
    
    // Debug: Log if no decision makers found to help diagnose issues
    if (decisionMakers.length === 0) {
      const hasTeamSelectors = $('.team-member, .team, .staff, .leadership, .executive, .about-team, .our-team').length > 0;
      const hasAboutPage = /about|team|leadership|management/i.test(url);
      console.log(`[EXTRACT] ⚠️  No decision makers found. Has team selectors: ${hasTeamSelectors}, Is about page: ${hasAboutPage}, HTML length: ${html.length}`);
    }
    
    // Extract emails from decision makers and merge with main emails list
    const dmEmails = decisionMakers
      .filter(dm => dm.email && dm.email.includes('@'))
      .map(dm => ({
        email: dm.email.toLowerCase(),
        source: 'decision_maker',
        confidence: 0.9 // Higher confidence for decision maker emails
      }));
    
    // Merge decision maker emails with main emails (avoid duplicates)
    const existingEmails = new Set(emails.map(e => e.email.toLowerCase()));
    dmEmails.forEach(dmEmail => {
      if (!existingEmails.has(dmEmail.email)) {
        emails.push(dmEmail);
        existingEmails.add(dmEmail.email);
      }
    });
    
    if (dmEmails.length > 0) {
      console.log(`[EXTRACT] Found ${dmEmails.length} additional emails from decision makers`);
    }
    
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
    // Try SearxNG if configured - but with strict timeout to avoid hanging
    // Skip if SearxNG is known to be rate-limited (we'll detect this from main search)
    const searxUrls = (process.env.SEARXNG_URLS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const searxSingle = (process.env.SEARXNG_URL || '').trim();
    const searxCandidates = searxUrls.length > 0 ? searxUrls : (searxSingle ? [searxSingle] : []);
    
    // Only try SearxNG if we have candidates - skip if empty (means it's rate-limited)
    if (searxCandidates.length > 0) {
      for (const base of searxCandidates.slice(0, 2)) { // Only try first 2 to avoid delays
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // Short 5s timeout
          
          const endpoint = `${base.replace(/\/+$/, '')}/search?format=json&q=${encodeURIComponent(query)}&categories=general`;
          const res = await fetch(endpoint, { 
            headers: { 'Accept': 'application/json','User-Agent': 'Onalog/1.0' },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (res.ok) {
            const json = await res.json();
            const results = (json.results || []).filter(r => r.url && r.title);
            let candidate = results.find(r => r.url.startsWith('http') && !isDirectoryDomain(r.url));
            if (candidate) return candidate.url;
          }
        } catch (e) {
          // Skip SearxNG if it fails - continue to DuckDuckGo/LLM
          if (e.name === 'AbortError') {
            console.log(`[EXTRACT] ⚠️  SearxNG timeout for website resolution - skipping`);
          }
        }
      }
    }
    // Fallback: minimal DuckDuckGo scrape - with timeout to avoid hanging
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
      
      const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const ddgRes = await fetch(ddgUrl, { 
        headers: { 'User-Agent': 'Onalog/1.0', 'Accept': 'text/html' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (ddgRes.ok) {
        const html = await ddgRes.text();
        const match = html.match(/uddg=([^&"]+)/);
        if (match) {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.startsWith('http') && !isDirectoryDomain(decoded)) {
            return decoded;
          }
        }
      }
    } catch (e) {
      // DuckDuckGo failed or timed out - continue to LLM
      if (e.name === 'AbortError') {
        console.log(`[EXTRACT] ⚠️  DuckDuckGo timeout for website resolution - skipping`);
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
    // Use centralized domain validation (pattern-based, not hardcoded list)
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
                  if (host !== baseHost && !isSocialMediaDomain(host) && !isUniversalBlocked(host) && !seenHosts.has(host)) {
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
        if (isSocialMediaDomain(host) || isUniversalBlocked(host)) return;
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
    
    // CRITICAL FIX: Filter out directory pages from expanded results
    // Import isDirectorySite dynamically to avoid circular dependency
    const { isDirectorySite } = await import('../services/searchProviders.js');
    const filteredFinal = [];
    for (const item of final) {
      // Check if this expanded result is itself a directory page
      const isStillDirectory = isDirectorySite(item.link, item.title);
      if (!isStillDirectory) {
        filteredFinal.push(item);
      } else {
        console.log(`[EXPAND] Filtering out directory page from expansion: ${item.title} → ${item.link}`);
      }
    }
    
    cacheSet(directoryCache, `${listPageUrl}|${maxCompanies}`, filteredFinal);
    return filteredFinal;
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
        if (isSocialMediaDomain(host) || isUniversalBlocked(host)) continue;
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
    // DYNAMIC-FIRST APPROACH: Pattern-based detection (no hardcoded business-type-specific domains)
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '').toLowerCase();
    const path = (urlObj.pathname || '').toLowerCase();
    const fullUrl = url.toLowerCase();
    
    // Use centralized domain validation
    if (isUniversalBlocked(domain)) return true;
    
    // ============================================
    // DYNAMIC PATTERN DETECTION (Primary)
    // ============================================
    
    // 1. DOMAIN NAME PATTERN DETECTION (using centralized config)
    const domainHasDirectoryKeyword = DIRECTORY_DOMAIN_PATTERNS.some(pattern => pattern.test(domain));
    const isFalsePositive = DIRECTORY_FALSE_POSITIVES.some(fp => domain.includes(fp));
    
    if (domainHasDirectoryKeyword && !isFalsePositive) {
      // If domain has directory keyword AND path suggests listing, it's likely a directory
      if (/\/(directory|listings?|companies|businesses|agencies|providers)/i.test(path)) {
        return true;
      }
      // If domain is clearly a directory (e.g., "businessdirectory.com"), block it
      if (/^(business|company|service|provider).*(directory|listings?|marketplace)/i.test(domain) ||
          /(directory|listings?|marketplace).*(business|company|service|provider)/i.test(domain)) {
        return true;
      }
    }
    
    // 2. DOMAIN MARKETPLACE PATTERNS (using centralized config)
    if (DOMAIN_MARKETPLACE_PATTERNS.some(pattern => pattern.test(fullUrl) || pattern.test(domain) || pattern.test(path))) {
      return true;
    }
    
    // 3. PATH PATTERN DETECTION
    const listiclePathPatterns = [
      /\/(category|tags|companies|agencies|directory|listings|businesses|list|explore|locations)\b/i,
      /\/(top-|best-|leading-|top\d+|best\d+)/i,
      /\/(list|lists|listing|directory|guide|roundup|compilation|ranking|rankings|rank)\b/i,
      /sharearticle|article-list|company-list|location-list/i,
      // Generic numbered list patterns
      /-\d+-best-|-\d+-top-|-\d+-companies/i,
      // Domain marketplace paths
      /domain_profile|domain_profile\.cfm|domain_profile\.php/i
    ];
    if (listiclePathPatterns.some(pattern => pattern.test(path))) return true;
    
    // 4. DOMAIN PATTERN INDICATORS (Enhanced)
    const directoryDomainIndicators = [
      /directory/i,
      /listings?/i,
      /businesslist/i,
      /yellow/i,
      /map/i,  // Generic map/directory sites
      /place/i, // Generic place listing sites
      /bizinfo/i, // Generic business info sites
      /college.*list/i, // Generic college/school listing patterns
      /school.*list/i,
      // Domain marketplace indicators
      /hugedomains/i,
      /sortlist/i,
      /domainmarket/i,
      // Additional patterns
      /marketplace/i,
      /aggregator/i,
      /catalog/i,
      /registry/i
    ];
    if (directoryDomainIndicators.some(pattern => pattern.test(domain))) return true;
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract email addresses from HTML - ENHANCED VERSION
 * Handles: obfuscated emails, contact forms, data attributes, meta tags, JavaScript-rendered
 */
function extractEmails(html, baseUrl) {
  const emails = new Set();
  const $ = cheerio.load(html);
  
  // 1. STANDARD EMAIL EXTRACTION (regex on HTML)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const standardMatches = html.match(emailRegex) || [];
  standardMatches.forEach(email => emails.add(email.toLowerCase()));
  
  // 2. OBFUSCATED EMAIL PATTERNS
  // Pattern: email@domain[dot]com or email@domain(dot)com
  const dotObfuscated = html.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)\s*\[?\(?dot\)?\]?\s*([a-zA-Z]{2,})/gi) || [];
  dotObfuscated.forEach(match => {
    const cleaned = match.replace(/\[?\(?dot\)?\]?/gi, '.').toLowerCase();
    if (emailRegex.test(cleaned)) {
      emails.add(cleaned);
    }
  });
  
  // Pattern: email [at] domain [dot] com
  const atObfuscated = html.match(/([a-zA-Z0-9._%+-]+)\s*\[?\(?at\)?\]?\s*([a-zA-Z0-9.-]+)\s*\[?\(?dot\)?\]?\s*([a-zA-Z]{2,})/gi) || [];
  atObfuscated.forEach(match => {
    const cleaned = match
      .replace(/\[?\(?at\)?\]?/gi, '@')
      .replace(/\[?\(?dot\)?\]?/gi, '.')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (emailRegex.test(cleaned)) {
      emails.add(cleaned);
    }
  });
  
  // Pattern: base64 encoded emails (common obfuscation)
  const base64Pattern = /data:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const base64Matches = html.match(/data-email="([^"]+)"/gi) || [];
  base64Matches.forEach(match => {
    try {
      const encoded = match.match(/data-email="([^"]+)"/i)?.[1];
      if (encoded) {
        const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
        if (emailRegex.test(decoded)) {
          emails.add(decoded.toLowerCase());
        }
      }
    } catch {}
  });
  
  // 3. DATA ATTRIBUTES (data-email, data-contact, data-mailto)
  $('[data-email], [data-contact], [data-mailto], [data-email-address]').each((i, el) => {
    const email = $(el).attr('data-email') || 
                  $(el).attr('data-contact') || 
                  $(el).attr('data-mailto') ||
                  $(el).attr('data-email-address');
    if (email && emailRegex.test(email)) {
      emails.add(email.toLowerCase());
    }
  });
  
  // 4. META TAGS AND STRUCTURED DATA
  // JSON-LD structured data
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}');
      const extractFromObject = (obj) => {
        if (typeof obj === 'string' && emailRegex.test(obj)) {
          emails.add(obj.toLowerCase());
        } else if (typeof obj === 'object' && obj !== null) {
          Object.values(obj).forEach(val => extractFromObject(val));
        }
      };
      extractFromObject(json);
    } catch {}
  });
  
  // Meta tags
  $('meta[property*="email"], meta[name*="email"], meta[itemprop*="email"]').each((i, el) => {
    const email = $(el).attr('content');
    if (email && emailRegex.test(email)) {
      emails.add(email.toLowerCase());
    }
  });
  
  // 5. CONTACT FORMS (input fields with type="email" or name/placeholder containing "email")
  $('input[type="email"], input[name*="email"], input[placeholder*="email"], input[id*="email"]').each((i, el) => {
    const email = $(el).attr('value') || $(el).attr('placeholder') || $(el).attr('data-default');
    if (email && emailRegex.test(email) && !email.includes('@example') && !email.includes('your-email')) {
      emails.add(email.toLowerCase());
    }
  });
  
  // 6. MAILTO LINKS (including obfuscated)
  $('a[href^="mailto:"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
      if (email && emailRegex.test(email)) {
        emails.add(email.toLowerCase());
      }
    }
  });
  
  // Also check for obfuscated mailto in text
  const mailtoObfuscated = html.match(/mailto:\s*([a-zA-Z0-9._%+-]+)\s*\[?\(?at\)?\]?\s*([a-zA-Z0-9.-]+)\s*\[?\(?dot\)?\]?\s*([a-zA-Z]{2,})/gi) || [];
  mailtoObfuscated.forEach(match => {
    const cleaned = match
      .replace(/mailto:\s*/i, '')
      .replace(/\[?\(?at\)?\]?/gi, '@')
      .replace(/\[?\(?dot\)?\]?/gi, '.')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (emailRegex.test(cleaned)) {
      emails.add(cleaned);
    }
  });
  
  // 7. TEXT CONTENT WITH EMAIL PATTERNS (catch emails in visible text)
  $('body').find('*').each((i, el) => {
    const text = $(el).text();
    const textMatches = text.match(emailRegex) || [];
    textMatches.forEach(email => {
      // Only add if it's not in a script or style tag
      const tagName = $(el).prop('tagName')?.toLowerCase();
      if (tagName !== 'script' && tagName !== 'style') {
        emails.add(email.toLowerCase());
      }
    });
  });
  
  // 8. FILTER OUT FALSE POSITIVES
  const filtered = Array.from(emails).filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes('example.com') &&
           !lower.includes('test@') &&
           !lower.includes('placeholder') &&
           !lower.includes('your-email') &&
           !lower.includes('email@') &&
           !lower.includes('@example') &&
           !lower.includes('sample@') &&
           !lower.includes('demo@') &&
           !lower.includes('noreply@') &&
           !lower.includes('no-reply@') &&
           !lower.match(/^[a-z0-9._%+-]+@(localhost|127\.0\.0\.1|example|test|placeholder)/i) &&
           lower.length > 5 && // Minimum email length
           lower.length < 100; // Maximum email length
  });
  
  // 9. REMOVE DUPLICATES AND ADD SOURCE/CONFIDENCE
  const unique = [...new Set(filtered)];
  return unique.map(email => {
    // Higher confidence for mailto links and data attributes
    let confidence = 0.8;
    let source = 'website';
    
    // Check if email came from specific high-confidence sources
    const mailtoInHtml = html.includes(`mailto:${email}`);
    const dataAttrInHtml = html.includes(`data-email="${email}"`) || html.includes(`data-contact="${email}"`);
    
    if (mailtoInHtml || dataAttrInHtml) {
      confidence = 0.95;
      source = mailtoInHtml ? 'mailto_link' : 'data_attribute';
    } else if (html.includes(`data-email`) || html.includes(`data-contact`)) {
      confidence = 0.9;
      source = 'structured_data';
    }
    
    return {
      email: email.toLowerCase(),
      source: source,
      confidence: confidence
    };
  });
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
  // CRITICAL FIX: Filter out invalid domains using centralized config
  // Try to find canonical URL first (most reliable)
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical && canonical.startsWith('http')) {
    try {
      const url = new URL(canonical);
      const hostname = url.hostname.toLowerCase();
      if (!isInvalidDomain(hostname)) {
        return canonical;
      }
    } catch {}
  }
  
  // Try og:url
  const ogUrl = $('meta[property="og:url"]').attr('content');
  if (ogUrl && ogUrl.startsWith('http')) {
    try {
      const url = new URL(ogUrl);
      const hostname = url.hostname.toLowerCase();
      if (!isInvalidDomain(hostname)) {
        return ogUrl;
      }
    } catch {}
  }
  
  // Use base URL if it's a valid website
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();
    // Reject if it's an invalid domain
    if (isInvalidDomain(hostname)) {
      return null; // Return null instead of invalid URL
    }
    return url.origin;
  } catch {
    // If baseUrl is invalid, check if it contains invalid domains
    const baseUrlLower = baseUrl.toLowerCase();
    if (isInvalidDomain(baseUrlLower)) {
      return null;
    }
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
 * Extract company name - Enhanced with validation to reject generic/placeholder names
 * Also handles social media profiles (TikTok, Instagram, etc.) to extract business names
 */
function extractCompanyName($, url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
    
    // CRITICAL FIX: Extract business name from social media profiles
    if (hostname.includes('tiktok.com')) {
      // TikTok: Try to extract from meta tags or page title
      const ogTitle = $('meta[property="og:title"]').attr('content');
      if (ogTitle && !ogTitle.toLowerCase().includes('tiktok')) {
        // Remove "on TikTok" suffix if present
        const cleaned = ogTitle.replace(/\s*on\s+tiktok.*$/i, '').trim();
        if (cleaned && !isGenericCompanyName(cleaned)) {
          return cleaned;
        }
      }
      // Try title tag
      const title = $('title').text();
      if (title) {
        const cleaned = title.replace(/\s*[-|]\s*.*$/, '').replace(/\s*on\s+tiktok.*$/i, '').trim();
        if (cleaned && !isGenericCompanyName(cleaned) && !cleaned.toLowerCase().includes('tiktok')) {
          return cleaned;
        }
      }
      // Try to extract from username in URL (@username)
      const pathMatch = urlObj.pathname.match(/@([^\/]+)/);
      if (pathMatch && pathMatch[1]) {
        const username = pathMatch[1];
        // Capitalize username as fallback (e.g., "digiaskcollegeke" -> "Digiaskcollegeke")
        return username.charAt(0).toUpperCase() + username.slice(1);
      }
    }
    
    // For other social media platforms, try similar extraction
    if (hostname.includes('instagram.com') || hostname.includes('facebook.com') || hostname.includes('linkedin.com')) {
      const ogTitle = $('meta[property="og:title"]').attr('content');
      if (ogTitle) {
        const cleaned = ogTitle.replace(/\s*[-|]\s*.*$/, '').trim();
        if (cleaned && !isGenericCompanyName(cleaned)) {
          return cleaned;
        }
      }
    }
  } catch {}
  
  // Try meta tags first
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) {
    const cleaned = ogTitle.trim();
    // Validate: reject generic names
    if (!isGenericCompanyName(cleaned)) {
      return cleaned;
    }
  }
  
  const title = $('title').text();
  if (title) {
    // Clean up title (remove common suffixes)
    const cleaned = title.replace(/\s*[-|]\s*.*$/, '').trim();
    // Validate: reject generic names
    if (!isGenericCompanyName(cleaned)) {
      return cleaned;
    }
  }
  
  // Try h1 tag as fallback
  const h1 = $('h1').first().text();
  if (h1) {
    const cleaned = h1.trim();
    if (!isGenericCompanyName(cleaned) && cleaned.length > 3 && cleaned.length < 100) {
      return cleaned;
    }
  }
  
  // Fallback to domain name (but validate it's not a marketplace)
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const domainName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
    // Reject if domain looks like a marketplace
    if (isDirectoryDomain(url)) {
      return null; // Return null to indicate invalid
    }
    return domainName;
  } catch {
    return null; // Return null instead of "Unknown Company"
  }
}

/**
 * Validate if a company name is generic/placeholder and should be rejected
 */
function isGenericCompanyName(name) {
  if (!name || name.length < 2) return true;
  
  const nameLower = name.toLowerCase().trim();
  
  // Reject generic/placeholder names
  const genericNames = [
    'home', 'homepage', 'welcome', 'index', 'default', 'page', 'site', 'website',
    'domain details page', 'domain profile', 'domain for sale', 'is for sale',
    'for sale', 'domain sale', 'buy domain', 'premium domain',
    'domain marketplace', 'domain auction', 'domain details',
    'unknown company', 'company', 'business', 'organization',
    'untitled', 'new page', 'page title', 'default page',
    'coming soon', 'under construction', 'maintenance'
  ];
  
  if (genericNames.some(generic => nameLower === generic || nameLower.startsWith(generic + ' ') || nameLower.endsWith(' ' + generic))) {
    return true;
  }
  
  // Reject "X is for sale" patterns
  if (/is\s+for\s+sale|for\s+sale|domain\s+sale|buy\s+domain|premium\s+domain/i.test(nameLower)) {
    return true;
  }
  
  // Reject domain marketplace patterns
  if (/hugedomains|domain.*profile|domain.*marketplace/i.test(nameLower)) {
    return true;
  }
  
  // Reject if name is just a domain extension pattern (e.g., ".com is for sale")
  if (/\.(com|net|org|io|co)\s+is\s+for\s+sale/i.test(nameLower)) {
    return true;
  }
  
  // Reject single-word generic terms
  if (nameLower.length < 4 && ['home', 'page', 'site', 'web'].includes(nameLower)) {
    return true;
  }
  
  return false;
}

/**
 * Extract decision makers from About Us / Team pages
 * STRICT VERSION - Only extracts real person names, rejects marketing copy and page headings
 */
function extractDecisionMakers($, baseUrl) {
  const decisionMakers = [];
  const seen = new Set();
  
  // Check if we're on a relevant page (about, team, leadership, etc.)
  let currentPath = '';
  let isRelevantPage = false;
  
  try {
    if (baseUrl) {
      const urlObj = new URL(baseUrl);
      currentPath = urlObj.pathname.toLowerCase();
      const aboutPageIndicators = ['about', 'team', 'leadership', 'management', 'founders', 'executives', 'staff', 'people', 'directors'];
      isRelevantPage = aboutPageIndicators.some(indicator => currentPath.includes(indicator));
    }
  } catch (urlError) {
    // Invalid URL - skip page relevance check, continue with extraction
    console.log(`[EXTRACT] ⚠️  Invalid URL in decision maker extraction: ${baseUrl}`);
    isRelevantPage = false;
  }
  
  // Comprehensive list of non-name patterns to reject
  const rejectPatterns = [
    // Marketing/CTA phrases
    /^(book|schedule|reserve|order|buy|purchase|get|try|start|sign|register|login|subscribe|download|install|view|see|read|learn|explore|discover|join|follow|share|like|comment|contact|call|email|message|chat|support|help)/i,
    /(your|our|the|this|that|these|those|all|every|each|some|any|many|most|few|several)/i,
    /(now|today|tomorrow|yesterday|soon|quick|fast|easy|simple|free|best|top|new|latest|popular|trending|viral)/i,
    /(boost|increase|improve|enhance|optimize|maximize|minimize|reduce|decrease|grow|scale|expand|develop|build|create|make|design|craft|deliver|provide|offer|give|take|get|receive)/i,
    // Page structure elements
    /^(skip|menu|navigation|breadcrumb|footer|header|sidebar|main|content|section|article|post|page|home|index)/i,
    // Common UI elements
    /^(click|tap|press|hover|scroll|swipe|drag|drop|select|choose|pick|filter|sort|search|find)/i,
    // Business/marketing terms that aren't names
    /^(marketing|advertising|sales|business|company|organization|enterprise|firm|agency|consulting|services|solutions|products|software|technology|digital|online|web|internet|social|media|content|blog|news|press|media|publication)/i,
    /(strategy|tactic|campaign|initiative|project|program|system|platform|tool|application|service|product|solution|feature|benefit|advantage|value|quality|performance|results|outcome|impact|effect|success|growth|revenue|profit|sales|leads|customers|clients|partners|vendors|suppliers)/i,
    // Phrases and incomplete sentences
    /^(of|in|on|at|to|for|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|must|can)/i,
    /(and|or|but|not|no|yes|ok|okay|yes|sure|certainly|absolutely|definitely|probably|maybe|perhaps|possibly)/i,
    // Numbers and dates
    /^\d+/,
    /\d{4}/, // Years
    /^(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    // Email-like patterns that aren't names
    /@/,
    // URLs and domains
    /(http|https|www|\.com|\.net|\.org|\.io|\.co)/i,
    // Very common non-name words
    /^(day|night|morning|evening|afternoon|week|month|year|time|date|place|location|address|city|state|country|world|globe|earth|universe)/i,
    // Action verbs
    /(engages|drives|leads|guides|helps|supports|enables|empowers|transforms|revolutionizes|innovates|creates|builds|develops|delivers|provides|offers|sells|markets|promotes|advertises)/i
  ];
  
  // Validate if a string is a real person name
  function isValidPersonName(name) {
    if (!name || typeof name !== 'string') return false;
    
    const trimmed = name.trim();
    
    // Must be between 3 and 50 characters
    if (trimmed.length < 3 || trimmed.length > 50) return false;
    
    // Reject if matches any rejection patterns
    if (rejectPatterns.some(pattern => pattern.test(trimmed))) return false;
    
    // Must match proper name pattern: FirstName LastName (at least 2 capitalized words)
    // Or Title FirstName LastName (e.g., "Dr. John Smith")
    const properNamePattern = /^(?:Dr\.|Mr\.|Mrs\.|Ms\.|Miss|Prof\.|Professor|Rev\.|Reverend)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$|^[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*$/;
    
    if (!properNamePattern.test(trimmed)) return false;
    
    // Must have at least two words (after removing title)
    const words = trimmed.replace(/^(?:Dr\.|Mr\.|Mrs\.|Ms\.|Miss|Prof\.|Professor|Rev\.|Reverend)\s+/i, '').split(/\s+/);
    if (words.length < 2) return false;
    
    // Each word must start with capital letter and be at least 2 characters
    if (!words.every(word => /^[A-Z][a-z]{1,}$/.test(word))) return false;
    
    // Reject if contains common business/marketing words
    const businessWords = ['marketing', 'business', 'company', 'services', 'solutions', 'digital', 'online', 'agency', 'consulting', 'strategy', 'day', 'book', 'call', 'now', 'your', 'audience', 'leads', 'trends'];
    const nameLower = trimmed.toLowerCase();
    if (businessWords.some(word => nameLower.includes(word) && !nameLower.match(new RegExp(`\\b${word}\\b`)))) {
      // If it's a standalone word, reject
      return false;
    }
    
    // Additional check: reject if name contains multiple business terms
    const businessTermCount = businessWords.filter(word => nameLower.includes(word)).length;
    if (businessTermCount >= 2) return false;
    
    return true;
  }
  
  // Pattern 1: Structured data (JSON-LD) - MOST RELIABLE
  $('script[type="application/ld+json"]').each((i, elem) => {
    try {
      const json = JSON.parse($(elem).html());
      const items = Array.isArray(json) ? json : [json];
      
      for (const item of items) {
        if (decisionMakers.length >= 10) break;
        
        // Organization founder
        if (item['@type'] === 'Organization' && item.founder) {
          const founders = Array.isArray(item.founder) ? item.founder : [item.founder];
          for (const founder of founders) {
            if (decisionMakers.length >= 10) break;
            const name = founder.name || (founder['@type'] === 'Person' ? founder.name : null);
            if (name && isValidPersonName(name)) {
              const key = name.toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);
                decisionMakers.push({
                  name: name,
                  title: founder.jobTitle || 'Founder',
                  source: 'structured_data',
                  confidence: 0.95
                });
              }
            }
          }
        }
        
        // Person schema
        if (item['@type'] === 'Person' && item.name && isValidPersonName(item.name)) {
          const key = item.name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            decisionMakers.push({
              name: item.name,
              title: item.jobTitle || 'Team Member',
              source: 'structured_data',
              confidence: 0.9
            });
          }
        }
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  });
  
  // Pattern 2: Specific team member selectors - ONLY on relevant pages or with specific classes
  if (isRelevantPage || $('.team-member, .team-member-card, .staff-member, .executive-card, .leadership-card, [data-team-member]').length > 0) {
    const teamSelectors = [
      '.team-member', '.team-member-card', '.staff-member', '.executive-card',
      '.leadership-card', '[data-team-member]', '[data-person]',
      '.person-card', '.member-card', '.employee-card'
    ];
    
    for (const selector of teamSelectors) {
      if (decisionMakers.length >= 10) break;
      
      $(selector).each((i, elem) => {
        if (decisionMakers.length >= 10) return false; // Break loop
        
        const $el = $(elem);
        
        // Look for name in specific name-related selectors only
        let name = null;
        const nameSelectors = ['.name', '.person-name', '.member-name', '[data-name]', 'h3', 'h4'];
        for (const nameSel of nameSelectors) {
          const candidate = $el.find(nameSel).first().text().trim();
          if (candidate && isValidPersonName(candidate)) {
            name = candidate;
            break;
          }
        }
        
        // If not found, try image alt text
        if (!name) {
          const altText = $el.find('img').attr('alt') || '';
          if (altText && isValidPersonName(altText)) {
            name = altText;
          }
        }
        
        if (!name) return; // Skip if no valid name found
        
        // Look for title
        const titleSelectors = ['.title', '.role', '.position', '.job-title', '[data-title]', '[data-role]'];
        let title = null;
        for (const titleSel of titleSelectors) {
          const candidate = $el.find(titleSel).first().text().trim();
          if (candidate && candidate.length > 2 && candidate.length < 100) {
            title = candidate;
            break;
          }
        }
        
        // If no title found, look in paragraph text for job-related keywords
        if (!title) {
          const text = $el.text().toLowerCase();
          const titleMatch = text.match(/\b(ceo|cto|cfo|director|manager|president|founder|owner|head|lead|vp|vice president|chief|executive|coordinator|supervisor|administrator|officer)\b/i);
          if (titleMatch) {
            title = titleMatch[0];
          }
        }
        
        if (!title) title = 'Team Member';
        
        const key = `${name.toLowerCase()}-${title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          decisionMakers.push({
            name: name,
            title: title,
            source: 'website',
            confidence: 0.85
          });
        }
      });
    }
  }
  
  // Pattern 3: "Name, Title" or "Name - Title" patterns - ONLY on relevant pages
  if (isRelevantPage && decisionMakers.length < 10) {
    const text = $('body').text();
    const patterns = [
      // "John Smith, CEO" or "John Smith - CEO"
      /([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s*[,\-–—]\s*(CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive|Managing Director|General Manager|Coordinator|Supervisor|Administrator|Officer)/gi,
      // "CEO: John Smith" or "CEO John Smith"
      /(CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive|Managing Director|General Manager)\s*[:]\s*([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)/gi
    ];
    
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null && decisionMakers.length < 10) {
        const name = pattern === patterns[0] ? match[1]?.trim() : match[2]?.trim();
        const title = pattern === patterns[0] ? match[2]?.trim() : match[1]?.trim();
        
        if (name && title && isValidPersonName(name)) {
          const key = `${name.toLowerCase()}-${title.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            decisionMakers.push({
              name: name,
              title: title,
              source: 'website',
              confidence: 0.8
            });
          }
        }
      }
    }
  }
  
  return decisionMakers.slice(0, 10); // Limit to 10 high-quality decision makers
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

    // ============================================
    // DYNAMIC PATTERN DETECTION (Primary)
    // ============================================
    
    // 1. URL/DOMAIN PATTERN ANALYSIS
    try {
      const u = new URL(url);
      const domain = u.hostname.replace('www.', '').toLowerCase();
      const path = (u.pathname || '').toLowerCase();
      const fullUrl = url.toLowerCase();
      
      // Domain name pattern detection
      const directoryDomainKeywords = [
        /directory/i,
        /listings?/i,
        /marketplace/i,
        /aggregator/i,
        /bizinfo/i,
        /yellow/i,
        /businesslist/i,
        /companylist/i,
        /database/i // Ranking/database sites (e.g., footballdatabase.com)
      ];
      const falsePositives = ['hubspot', 'hubdoc', 'hubstaff', 'hubpages'];
      const domainHasKeyword = directoryDomainKeywords.some(pattern => pattern.test(domain));
      const isFalsePositive = falsePositives.some(fp => domain.includes(fp));
      
      if (domainHasKeyword && !isFalsePositive) {
        reasons.push('domain:keyword');
        score -= 3;
        // If path also suggests directory, stronger signal
        if (/\/(directory|listings?|companies|businesses|ranking|rankings|rank)/i.test(path)) {
          score -= 2;
        }
      }
      
      // Path patterns
      if (/(^|\/)(category|tags|companies|agencies|directory|list|locations|explore|ranking|rankings|rank)(\/|$)/.test(path)) {
        reasons.push('path:listlike');
        score -= 2;
      }
      if (/top-\d+|best|list-of|the-\d+-best|\/ranking|\/rankings|\/rank\b/.test(path)) {
        reasons.push('path:ranked');
        score -= 2;
      }
      
      // Domain marketplace patterns
      // Use centralized config for domain marketplace detection
      if (DOMAIN_MARKETPLACE_PATTERNS.some(pattern => pattern.test(fullUrl) || pattern.test(path) || pattern.test(domain))) {
        reasons.push('domain:marketplace');
        score -= 5; // Strong negative signal
      }
    } catch {}

    // 2. HTML STRUCTURE ANALYSIS (Enhanced)
    if (html) {
      const $ = cheerio.load(html);
      const title = ($('title').text() || '').trim().toLowerCase();
      
      // Title patterns
      if (/\b(top\s*\d+|\d+\s*best|list of|directory|ranking|rankings|rank)\b/.test(title)) {
        reasons.push('title:listlike');
        score -= 2;
      }
      
      // Domain marketplace in title
      if (/is\s+for\s+sale|for\s+sale|domain\s+sale|buy\s+domain|premium\s+domain|hugedomains|domain.*profile|domain.*marketplace/i.test(title)) {
        reasons.push('title:domain_sale');
        score -= 5; // Strong negative signal
      }
      
      // Check for directory keywords once (used in multiple checks)
      const hasDirectoryKeywords = /directory|listing|business.*list|company.*list|ranking|rankings/i.test(title) || 
                                   /directory|listing|business.*list|company.*list|ranking|rankings/i.test(path);
      
      // ENHANCED: Multiple external links analysis
      try {
        const origin = new URL(url).hostname.replace(/^www\./, '');
        let external = 0, internal = 0;
        const hosts = new Set();
        const externalLinks = [];
        
        $('a[href]').each((_, a) => {
          const href = ($(a).attr('href') || '').trim();
          if (!href.startsWith('http')) { internal++; return; }
          try {
            const h = new URL(href).hostname.replace(/^www\./, '');
            if (h === origin) internal++; 
            else { 
              external++; 
              hosts.add(h);
              externalLinks.push(h);
            }
          } catch { external++; }
        });
        
        // If many external links to different domains, likely a directory
        // BUT: Restaurants often link to social media, reservations, delivery, etc.
        // Only flag if very high external link count AND has directory-like patterns
        if (hosts.size >= 10 && external > internal && hasDirectoryKeywords) {
          reasons.push('links:many-external');
          score -= 2;
        }
        // Very strong signal: 20+ unique external domains (not just social media)
        if (hosts.size >= 20 && external > internal * 2) {
          reasons.push('links:very-many-external');
          score -= 3;
        }
      } catch {}
      
      // ENHANCED: List-like structure detection
      // BUT: Restaurants often have menu lists, so be more careful
      const listItems = $('ul li, ol li').length;
      const listContainers = $('ul, ol').length;
      // Only flag if very high list count AND has directory-like patterns
      if (listItems >= 100 && listContainers >= 5 && hasDirectoryKeywords) {
        reasons.push('structure:many-lists');
        score -= 2;
      }
      
      // ENHANCED: Card/grid layout detection (common in directories)
      // BUT: Restaurants/venues also use cards for menus/galleries, so be more careful
      const cards = $('[class*="card"], [class*="grid"], [class*="item"], [class*="listing"]').length;
      // Only flag if very high card count AND has directory-like patterns
      if (cards >= 20 && hasDirectoryKeywords) {
        reasons.push('structure:card-layout');
        score -= 1;
      }
      
      // ENHANCED: "View Profile" / "Visit Website" button patterns
      const profileButtons = $('a, button').filter((_, el) => {
        const text = $(el).text().toLowerCase();
        return /view\s+(profile|website|site)|visit\s+(website|site)|learn\s+more|see\s+details/i.test(text);
      }).length;
      if (profileButtons >= 5) {
        reasons.push('content:profile-buttons');
        score -= 2;
      }
      
      // ENHANCED: Multiple company name patterns (e.g., "Company Name - Location - Rating")
      const companyNamePatterns = $('*').filter((_, el) => {
        const text = $(el).text();
        // Look for patterns like "Company - Location" or "Company | Location"
        return /^[A-Z][a-zA-Z\s&]+[-|]\s*[A-Z]/.test(text.trim()) && text.length < 100;
      }).length;
      if (companyNamePatterns >= 10) {
        reasons.push('content:company-patterns');
        score -= 2;
      }

      // Detect ItemList/CollectionPage (strong directory signal)
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
      if (hasItemList) { 
        reasons.push('schema:itemList'); 
        score -= 3; // Strong negative signal
      }

      // LocalBusiness/Organization (first-party - positive signal)
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
      if (hasLocalBusiness) { 
        reasons.push('schema:localbusiness'); 
        score += 2; // Positive signal for first-party
      }
    }

    const result = { isFirstParty: score > 0, score, reasons };
    cacheSet(directoryCache, cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch {
    return { isFirstParty: true, score: 0, reasons: ['fallback'] };
  }
}

