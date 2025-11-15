// Cost-optimal search: Overpass (free) → SearxNG (free, optional) → OpenStreetMap (free) → Bing (free) → Google Places API (paid, only when needed)
import { searchDuckDuckGo, searchBing, searchGooglePlaces, searchOpenStreetMap, searchOverpass, searchSearxng } from './searchProviders.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Build optimized search query (kept for compatibility)
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

// Expand category terms for locales (lightweight)
function getExpandedCategoryTerms(query, country = null) {
  // New adaptive expansion uses the ontology below; this is retained for backward compatibility
  const q = (query || '').toLowerCase().trim();
  const terms = [query];
  const isSpanish = ['es','mx','ar','co','cl','pe','uy','bo','ec','ve','cr','do','gt','hn','ni','pa','pr','sv'].includes((country || '').toLowerCase());
  const isPortuguese = ['pt','br'].includes((country || '').toLowerCase());
  const push = (t) => { if (!terms.some(x => x.toLowerCase() === t.toLowerCase())) terms.push(t); };
  if (q.includes('hospital')) {
    push('hospitals'); push('medical center'); push('healthcare group');
    if (isSpanish) { push('clínica'); push('clinica'); push('centro médico'); push('grupo sanitario'); }
    if (isPortuguese) { push('clínica'); push('clinica'); push('centro médico'); push('grupo de saúde'); }
  }
  if (q.includes('fintech')) {
    push('fintech'); push('fintech startup'); push('payments company'); push('payment processor');
    push('mobile money'); push('digital bank'); push('neo bank'); push('lending platform');
    push('loan app'); push('microfinance'); push('remittance');
    if (isSpanish) { push('empresa de pagos'); push('banca digital'); push('plataforma de préstamos'); push('microfinanzas'); push('remesas'); }
    if (isPortuguese) { push('empresa de pagamentos'); push('banco digital'); push('plataforma de empréstimos'); push('microfinanças'); push('remessas'); }
  }
  // Real estate
  if (q.includes('real estate') || q.includes('estate agent') || q.includes('realtor') || q.includes('imobili') || q.includes('agência imobili')) {
    push('real estate'); push('estate agents'); push('estate agent'); push('realtor'); push('property agency'); push('broker');
    if (isSpanish) { push('inmobiliaria'); push('agencia inmobiliaria'); push('corredor de bienes raíces'); }
    if (isPortuguese) { push('imobiliária'); push('agência imobiliária'); push('corretor'); push('mediação imobiliária'); }
  }
  return terms;
}

// ---------------------------
// Concept Ontology (minimal)
// ---------------------------
const ONTOLOGY = {
  Cafe: {
    labels: ['coffee shop', 'cafe', 'café', 'cafeteria', 'roastery', 'espresso bar'],
    locales: {
      pt: ['café', 'cafeteria', 'torrefação'],
      es: ['cafetería', 'tostaduría'],
      fr: ['café', 'cafétéria'],
    },
    osm: {
      tags: [{ amenity: 'cafe' }, { shop: 'coffee' }],
      nameHints: ['cafe', 'café', 'cafeteria', 'roastery', 'espresso']
    }
  },
  RealEstateAgency: {
    labels: ['real estate', 'estate agent', 'realtor', 'property agency'],
    locales: {
      pt: ['imobiliária', 'agência imobiliária', 'corretor'],
      es: ['inmobiliaria', 'agencia inmobiliaria', 'corredor'],
    },
    osm: {
      tags: [{ office: 'estate_agent' }],
      nameHints: ['real estate', 'imobili', 'inmobili', 'realtor', 'agency']
    }
  },
  GelatoIceCream: {
    labels: ['gelato', 'ice cream', 'gelateria', 'ice-cream'],
    locales: {
      it: ['gelato', 'gelateria'],
      es: ['helado', 'heladería'],
      pt: ['sorvete', 'gelado', 'geladaria']
    },
    osm: {
      tags: [{ amenity: 'ice_cream' }, { shop: 'ice_cream' }, { cuisine: 'ice_cream' }],
      nameHints: ['gelato','ice cream','gelateria','helado','sorvete','gelado']
    }
  },
  Bank: {
    labels: ['bank', 'commercial bank', 'retail bank'],
    locales: { es: ['banco'], pt: ['banco'] },
    osm: { tags: [{ amenity: 'bank' }], nameHints: ['bank','banco'] }
  },
  Hospital: {
    labels: ['hospital', 'medical center', 'clinic'],
    locales: { es: ['hospital','centro médico','clínica'], pt: ['hospital','centro médico','clínica'] },
    osm: {
      tags: [{ amenity: 'hospital' }, { healthcare: 'hospital' }, { building: 'hospital' }],
      nameHints: ['hospital','clinica','clínica','medical']
    }
  }
};

// In-memory short cache to avoid recomputing expansions repeatedly within a session
const EXPANSION_CACHE = new Map(); // key -> { expansions, expiresAt }
const EXPANSION_TTL = 15 * 60 * 1000;

function getLocale(country) {
  const c = (country || '').toLowerCase();
  if (['pt','br'].includes(c)) return 'pt';
  if (['es','mx','co','ar','cl','pe','uy','bo','ec','ve','cr','do','gt','hn','ni','pa','pr','sv'].includes(c)) return 'es';
  if (['fr'].includes(c)) return 'fr';
  return 'en';
}

function normalizeStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function llmExpandTerms(query, country, maxVariants = 8) {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    const cacheKey = `llm:${normalizeStr(query)}|${getLocale(country)}`;
    const hit = EXPANSION_CACHE.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) return hit.expansions;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const locale = getLocale(country);
    const prompt = `Given the business search intent: "${query}" and locale "${locale}", return a concise JSON array of 4-10 short, distinct category/phrase variants that would help find more first‑party business results across the web and OpenStreetMap.

CRITICAL: Generate terms that work well with OpenStreetMap's tagging system. OSM uses standard business categories like but not limited to:
- "aviation school" (not "flight school" or "plane school")
- "bank" (not "commercial bank")
- "cafe" (not "coffee shop")
- "hospital" (not "medical center")
- "hotel" (not "lodging")
- "restaurant" (not "dining")
- "pharmacy" (not "drugstore")
- "shop" or specific shop types (not "store")

Rules:
- Return ONLY a JSON array of strings, no prose.
- Prefer standard OSM business category terms over colloquial or marketing terms.
- Include localized terms if applicable (e.g., "café" for coffee, "imobiliária" for real estate in Portuguese).
- Include singular/plural variants.
- Include close synonyms but prioritize terms that match OSM's amenity/shop/office tags.
- Avoid brand names or generic words like "best", "top", "commercial", "professional".
- If the query is a colloquial term (e.g., "flight school"), include the standard OSM term (e.g., "aviation school") as the first variant.`;
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.15,
      messages: [
        { role: 'system', content: 'You generate compact category synonyms/variants for business search.' },
        { role: 'user', content: prompt }
      ]
    });
    const text = resp.choices?.[0]?.message?.content?.trim() || '[]';
    let arr = [];
    try {
      arr = JSON.parse(text);
    } catch {
      // Try to salvage JSON array inside content
      const m = text.match(/\[([\s\S]*?)\]/);
      if (m) {
        arr = JSON.parse(m[0]);
      }
    }
    const cleaned = (Array.isArray(arr) ? arr : [])
      .map(x => String(x).trim())
      .filter(x => x.length > 0)
      .slice(0, maxVariants);
    if (cleaned.length > 0) {
      EXPANSION_CACHE.set(cacheKey, { expansions: cleaned, expiresAt: Date.now() + EXPANSION_TTL });
      return cleaned;
    }
    return null;
  } catch {
    return null;
  }
}

function detectConcept(query) {
  const qn = normalizeStr(query);
  for (const [concept, cfg] of Object.entries(ONTOLOGY)) {
    const labels = (cfg.labels || []).map(normalizeStr);
    if (labels.some(l => qn.includes(l))) return concept;
  }
  // heuristic fallbacks
  if (qn.includes('gelato') || qn.includes('ice cream') || qn.includes('gelateria')) return 'GelatoIceCream';
  if (qn.includes('coffee')) return 'Cafe';
  if (qn.includes('estate') || qn.includes('imobili') || qn.includes('inmobili')) return 'RealEstateAgency';
  if (qn.includes('bank')) return 'Bank';
  if (qn.includes('hospital') || qn.includes('clinic')) return 'Hospital';
  return null;
}

async function buildAdaptiveExpansions(query, country, maxVariants = 8) {
  const cacheKey = `${normalizeStr(query)}|${getLocale(country)}`;
  const hit = EXPANSION_CACHE.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) return hit.expansions;

  const locale = getLocale(country);
  const concept = detectConcept(query);
  const set = new Set([query]);
  // 1) Try LLM expansions first
  const llm = await llmExpandTerms(query, country, maxVariants);
  if (llm && llm.length > 0) llm.forEach(t => set.add(t));
  // add ontology variants
  if (concept && ONTOLOGY[concept]) {
    const cfg = ONTOLOGY[concept];
    (cfg.labels || []).forEach(t => set.add(t));
    (cfg.locales?.[locale] || []).forEach(t => set.add(t));
    // light morphological variants
    Array.from(set).forEach(t => {
      if (!t.endsWith('s')) set.add(`${t}s`);
    });
  }
  // de-diacriticized forms
  const withPlain = new Set(Array.from(set).concat(Array.from(set).map(t => normalizeStr(t))));
  const expansions = Array.from(withPlain).slice(0, maxVariants);
  EXPANSION_CACHE.set(cacheKey, { expansions, expiresAt: Date.now() + EXPANSION_TTL });
  return expansions;
}

/**
 * Dynamically detect if query is for digital/software businesses (not physical locations)
 * Uses LLM to classify query type - no hardcoded keywords
 * These need web search APIs, not location-based APIs like OSM
 */
async function isDigitalBusinessQuery(query) {
  try {
    const cacheKey = `digital:${normalizeStr(query)}`;
    const hit = EXPANSION_CACHE.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return hit.isDigital === true;
    }
    
    // If no OpenAI key, default to false (use location-based APIs)
    if (!process.env.OPENAI_API_KEY) {
      return false;
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Analyze this business search query: "${query}"

Determine if this query is for:
- DIGITAL/SOFTWARE businesses (SaaS, apps, platforms, web services, digital agencies, online marketplaces, tech companies, etc.)
- OR physical/location-based businesses (stores, restaurants, clinics, offices with physical addresses, etc.)

Return ONLY a JSON object with this exact structure:
{
  "isDigital": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation"
}

Examples:
- "SaaS companies" → {"isDigital": true, "confidence": 0.95, "reason": "SaaS is software-as-a-service"}
- "Coffee shops" → {"isDigital": false, "confidence": 0.95, "reason": "Physical retail locations"}
- "Marketing agencies" → {"isDigital": true, "confidence": 0.7, "reason": "Can be digital/remote agencies"}
- "Banks" → {"isDigital": false, "confidence": 0.8, "reason": "Physical branch locations"}`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You classify business search queries as digital/software vs physical/location-based.' },
        { role: 'user', content: prompt }
      ]
    });
    
    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    let result = { isDigital: false, confidence: 0, reason: '' };
    
    try {
      result = JSON.parse(text);
    } catch {
      // Try to salvage JSON object
      const m = text.match(/\{[\s\S]*?\}/);
      if (m) {
        result = JSON.parse(m[0]);
      }
    }
    
    const isDigital = result.isDigital === true && (result.confidence || 0) >= 0.6;
    
    // Cache result for 30 minutes
    EXPANSION_CACHE.set(cacheKey, { isDigital, expiresAt: Date.now() + (30 * 60 * 1000) });
    
    return isDigital;
  } catch (error) {
    console.log(`[SEARCH] ⚠️  LLM digital detection failed: ${error.message}, defaulting to physical`);
    // On error, default to physical (location-based APIs)
    return false;
  }
}

/**
 * Fetch search results - Cost-optimal: OpenStreetMap (free) → Bing (free) → Google Places API (paid, only when needed)
 * For digital businesses, prioritizes web search APIs (Bing, Google Custom Search) over location-based APIs
 */
export async function fetchGoogleResults(query, country = null, location = null, maxResults = 50) {
  console.log(`[SEARCH] Starting: "${query}", Country: ${country || 'none'}, Location: ${location || 'none'}, Max: ${maxResults}`);
  
  // Dynamically detect if this is a digital/software business query using LLM
  const isDigital = await isDigitalBusinessQuery(query);
  if (isDigital) {
    console.log(`[SEARCH] 🔍 LLM detected digital/software business query - prioritizing web search APIs`);
  }
  
  const minResults = Math.min(20, Math.floor(maxResults * 0.4));
  let overpassResults = [];
  let searxResults = [];
  let osmResults = [];
  let bingResults = [];
  let placesResults = [];
  let ddgSupplement = [];
  let customSearchResults = [];

  // Step 1: Kick off Overpass + SearxNG + OSM in parallel with strict timeouts
  const withTimeout = (p, label, ms = 15000) => Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
  console.log('[SEARCH] 🚀 Starting free providers in parallel (hard cutoffs)...');
  // Use adaptive expansions
  const overpassTerms = await buildAdaptiveExpansions(query, country, 8);
  const osmTerms = overpassTerms;
  const overpassPromise = (async () => {
    try {
      console.log('[SEARCH] 🗺️ Overpass (parallel)...');
      const seen = new Set();
      const acc = [];
      for (const term of overpassTerms) {
        const chunk = await withTimeout(searchOverpass(term, country, location, maxResults), 'Overpass', 12000);
        for (const r of (chunk || [])) {
          if (r.link && !seen.has(r.link)) { seen.add(r.link); acc.push(r); }
        }
        if (acc.length >= maxResults) break;
      }
      console.log(`[SEARCH] Overpass done: ${acc.length}`);
      return acc;
    } catch (e) {
      console.log(`[SEARCH] ⚠️  Overpass skipped: ${e.message}`);
      return [];
    }
  })();
  const searxPromise = (async () => {
    try {
      if (process.env.SEARXNG_URL || process.env.SEARXNG_URLS) {
        console.log('[SEARCH] 🧭 SearxNG (parallel)...');
        const res = await withTimeout(searchSearxng(query, country, location, maxResults), 'SearxNG', 12000);
        console.log(`[SEARCH] SearxNG done: ${res?.length || 0}`);
        return res || [];
      }
      console.log('[SEARCH] 💡 SearxNG not configured');
      return [];
    } catch (e) {
      console.log(`[SEARCH] ⚠️  SearxNG skipped: ${e.message}`);
      return [];
    }
  })();
  const osmPromise = (async () => {
    try {
      console.log('[SEARCH] 🌍 OpenStreetMap (parallel)...');
      const seen = new Set();
      const acc = [];
      // Pass all LLM-generated terms to each search for better dynamic matching
      for (const term of osmTerms) {
        const chunk = await withTimeout(searchOpenStreetMap(term, country, location, maxResults, osmTerms), 'OpenStreetMap', 12000);
        for (const r of (chunk || [])) {
          if (r.link && !seen.has(r.link)) { seen.add(r.link); acc.push(r); }
        }
        if (acc.length >= maxResults) break;
      }
      console.log(`[SEARCH] OpenStreetMap done: ${acc.length}`);
      return acc;
    } catch (e) {
      console.log(`[SEARCH] ⚠️  OpenStreetMap skipped: ${e.message}`);
      return [];
    }
  })();
  // For digital businesses, prioritize web search APIs (Bing, Google Custom Search) early
  // For physical businesses, try location-based APIs first
  if (isDigital) {
    // Digital businesses: Try Bing and Google Custom Search early (in parallel with location APIs)
    const bingPromise = (async () => {
      try {
        if (process.env.BING_API_KEY) {
          console.log('[SEARCH] 🔍 Bing Search API (prioritized for digital businesses)...');
          return await withTimeout(searchBing(query, country, location, maxResults), 'Bing', 15000);
        } else {
          console.log('[SEARCH] ⚠️  Bing API key missing (CRITICAL for digital businesses)');
          console.log('[SEARCH] 💡 Get free key: https://www.microsoft.com/en-us/bing/apis/bing-web-search-api');
          console.log('[SEARCH] 💡 Add to .env: BING_API_KEY=your_key');
        }
        return [];
      } catch (e) {
        console.log(`[SEARCH] ⚠️  Bing failed: ${e.message}`);
        return [];
      }
    })();
    
    const customSearchPromise = (async () => {
      try {
        if (process.env.GOOGLE_CSE_ID && process.env.GOOGLE_API_KEY) {
          const { searchGoogleCustomSearch } = await import('./searchProviders.js');
          console.log('[SEARCH] 🔍 Google Custom Search (prioritized for digital businesses)...');
          return await withTimeout(searchGoogleCustomSearch(query, country, location, maxResults), 'Google Custom Search', 15000);
        }
        return [];
      } catch (e) {
        console.log(`[SEARCH] ⚠️  Google Custom Search failed: ${e.message}`);
        return [];
      }
    })();
    
    // Wait for web search APIs and location APIs in parallel
    const [ovr, sx, osm, bing, custom] = await Promise.allSettled([
      overpassPromise, 
      searxPromise, 
      osmPromise,
      bingPromise,
      customSearchPromise
    ]);
    overpassResults = ovr.status === 'fulfilled' ? (ovr.value || []) : [];
    searxResults = sx.status === 'fulfilled' ? (sx.value || []) : [];
    osmResults = osm.status === 'fulfilled' ? (osm.value || []) : [];
    bingResults = bing.status === 'fulfilled' ? (bing.value || []) : [];
    customSearchResults = custom.status === 'fulfilled' ? (custom.value || []) : [];
  } else {
    // Physical businesses: Try location APIs first, then web search APIs
    const [ovr, sx, osm] = await Promise.allSettled([overpassPromise, searxPromise, osmPromise]);
    overpassResults = ovr.status === 'fulfilled' ? (ovr.value || []) : [];
    searxResults = sx.status === 'fulfilled' ? (sx.value || []) : [];
    osmResults = osm.status === 'fulfilled' ? (osm.value || []) : [];
    
    // Try Bing as supplement for physical businesses
    try {
      if (process.env.BING_API_KEY) {
        console.log('[SEARCH] 🔍 Bing Search API (free supplement)...');
        bingResults = await searchBing(query, country, location, maxResults);
      } else {
        console.log('[SEARCH] 💡 Bing API key not set (3,000 free/month)');
      }
    } catch (bingError) {
      console.log(`[SEARCH] ⚠️  Bing failed: ${bingError.message}`);
    }
  }
  
  const freeEarly = (overpassResults?.length || 0) + (searxResults?.length || 0) + (osmResults?.length || 0) + (bingResults?.length || 0) + (customSearchResults?.length || 0);
  console.log(`[SEARCH] Free results after parallel stage: ${freeEarly}`);
  
  // Step 5: Google Places API (PAID, use when free methods fail or need more)
  const freeResultsCount = (overpassResults?.length || 0) + (searxResults?.length || 0) + (osmResults?.length || 0) + (bingResults?.length || 0) + (customSearchResults?.length || 0);
  
  // Use Google Places API if:
  // 1. Free methods returned < minResults, OR
  // 2. Free methods returned 0 results (complete failure)
  if (process.env.GOOGLE_PLACES_API_KEY && (freeResultsCount < minResults || freeResultsCount === 0)) {
    try {
      if (freeResultsCount === 0) {
        console.log(`[SEARCH] 📍 Google Places API (free methods failed, trying paid option)...`);
      } else {
        console.log(`[SEARCH] 📍 Google Places API (paid supplement - ${freeResultsCount} free results, need ${minResults}+)...`);
      }
      placesResults = await searchGooglePlaces(query, country, location, maxResults);
      console.log(`[SEARCH] ✅ Google Places API: ${placesResults?.length || 0} results`);
    } catch (placesApiError) {
      console.log(`[SEARCH] ⚠️  Google Places API failed: ${placesApiError.message}`);
    }
  } else if (process.env.GOOGLE_PLACES_API_KEY && freeResultsCount >= minResults) {
    console.log(`[SEARCH] 💰 Skipping Google Places API (cost-saving: ${freeResultsCount} free results >= ${minResults})`);
  } else if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log('[SEARCH] 💡 Google Places API key not set. Add GOOGLE_PLACES_API_KEY to .env for paid option ($200 free/month)');
  }
  
  // If we still have fewer than minResults, try DuckDuckGo as a supplement (not only last resort)
  if (freeResultsCount < minResults) {
    try {
      console.log(`[SEARCH] 🦆 DuckDuckGo supplement (need at least ${minResults}, have ${freeResultsCount})...`);
      ddgSupplement = await searchDuckDuckGo(query, country, location, maxResults);
    } catch (e) {
      console.log(`[SEARCH] ⚠️  DuckDuckGo supplement failed: ${e.message}`);
    }
  }

  // Combine results: FREE sources first, then paid
  const allResults = [];
  const seenUrls = new Set();
  
  // Add Overpass (FREE)
  if (overpassResults?.length > 0) {
    overpassResults.forEach(result => {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        allResults.push(result);
      }
    });
  }

  // Add SearxNG (FREE)
  if (searxResults?.length > 0) {
    searxResults.forEach(result => {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        allResults.push(result);
      }
    });
  }

  // Add OSM (FREE)
  if (osmResults?.length > 0) {
    osmResults.forEach(result => {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        allResults.push(result);
      }
    });
  }
  // Add DuckDuckGo supplement
  if (ddgSupplement?.length > 0) {
    ddgSupplement.forEach(result => {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        allResults.push(result);
      }
    });
  }
  
  // Add Bing (FREE)
  if (bingResults?.length > 0) {
    bingResults.forEach(result => {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        allResults.push(result);
      }
    });
  }
  
  // Add Google Custom Search (FREE tier: 100 queries/day) - for digital businesses
  if (customSearchResults?.length > 0) {
    customSearchResults.forEach(result => {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        allResults.push(result);
      }
    });
  }
  
  // Add Google Places (PAID)
  if (placesResults?.length > 0) {
    placesResults.forEach(result => {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        allResults.push(result);
      }
    });
  }
  
  if (allResults.length > 0) {
    const finalResults = allResults.slice(0, maxResults);
    const freeCount = (overpassResults?.length || 0) + (searxResults?.length || 0) + (osmResults?.length || 0) + (bingResults?.length || 0) + (customSearchResults?.length || 0) + (ddgSupplement?.length || 0);
    const paidCount = placesResults?.length || 0;
    console.log(`[SEARCH] ✅ Combined: ${freeCount} FREE (${overpassResults?.length || 0} Overpass + ${searxResults?.length || 0} SearxNG + ${osmResults?.length || 0} OSM + ${bingResults?.length || 0} Bing + ${customSearchResults?.length || 0} Custom Search + ${ddgSupplement?.length || 0} DDG) + ${paidCount} PAID = ${finalResults.length} total`);
    // Build provider telemetry and shortfall reason
    const telemetry = {
      overpass: overpassResults?.length || 0,
      searxng: searxResults?.length || 0,
      osm: osmResults?.length || 0,
      bing: bingResults?.length || 0,
      customSearch: customSearchResults?.length || 0,
      ddg: ddgSupplement?.length || 0,
      places: placesResults?.length || 0
    };
    const reasons = [];
    if (!process.env.BING_API_KEY) reasons.push('Bing API key missing');
    if (!process.env.GOOGLE_PLACES_API_KEY) reasons.push('Places disabled');
    if ((ddgSupplement?.length || 0) === 0 && freeCount < minResults) reasons.push('DuckDuckGo rate-limited/blocked');
    if ((overpassResults?.length || 0) === 0) reasons.push('Overpass timed out or no results');
    const reasonShortfall = finalResults.length < maxResults ? reasons.join('; ') : '';
    return { results: finalResults, telemetry, reasonShortfall };
  }
  
  // If we have Google Places results but they weren't combined (shouldn't happen, but safety check)
  if (placesResults && placesResults.length > 0) {
    console.log(`[SEARCH] ✅ Using Google Places API results: ${placesResults.length} results`);
    return { results: placesResults.slice(0, maxResults), telemetry: { overpass: 0, searxng: 0, osm: 0, bing: 0, ddg: 0, places: placesResults.length }, reasonShortfall: '' };
  }
  
  // Try 4: DuckDuckGo (completely free, no API key needed) - LAST RESORT
  // ⚠️  WARNING: Gets rate limited frequently (HTTP 202)
  // Retry with exponential backoff if rate limited
  let ddgRetries = 0;
  const maxDdgRetries = 3;
  while (ddgRetries < maxDdgRetries) {
    try {
      console.log(`[SEARCH] 🦆 Trying DuckDuckGo${ddgRetries > 0 ? ` (retry ${ddgRetries}/${maxDdgRetries})` : ''}...`);
      const results = await searchDuckDuckGo(query, country, location, maxResults);
      if (results && results.length > 0) {
        console.log(`[SEARCH] ✅ DuckDuckGo found ${results.length} results`);
        return results;
      }
      break; // If we got results (even if empty), don't retry
    } catch (ddgError) {
      ddgRetries++;
      if (ddgError.message.includes('202') || ddgError.message.includes('Rate limited')) {
        if (ddgRetries < maxDdgRetries) {
          const waitTime = ddgRetries * 30000; // 30s, 60s, 90s (longer delays)
          console.log(`[SEARCH] ⚠️  DuckDuckGo rate limited, waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        }
      }
      console.log(`[SEARCH] ⚠️  DuckDuckGo failed: ${ddgError.message}`);
      break; // Don't retry for other errors
    }
  }
  
  // All methods failed - try one more time with a simplified query
  // Sometimes OSM/DuckDuckGo work better with simplified queries
  if (freeEarly === 0 && !placesResults.length && !ddgSupplement.length) {
    console.log(`[SEARCH] ⚠️  All methods failed. Trying simplified query as last resort...`);
    try {
      // Simplify query: remove location-specific terms, just use base query + location
      const simplifiedQuery = query.split(' ').slice(0, 2).join(' '); // Take first 2 words
      console.log(`[SEARCH] 🔄 Retrying with simplified query: "${simplifiedQuery}"`);
      
      // Try OSM one more time with simplified query
      const simplifiedOsm = await Promise.race([
        searchOpenStreetMap(simplifiedQuery, country, location, Math.min(20, maxResults)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('OSM timeout')), 10000))
      ]).catch(() => []);
      
      if (simplifiedOsm && simplifiedOsm.length > 0) {
        console.log(`[SEARCH] ✅ Simplified query found ${simplifiedOsm.length} results`);
        return { results: simplifiedOsm, telemetry: { 'OSM (simplified)': simplifiedOsm.length }, reasonShortfall: 'Used simplified query fallback' };
      }
    } catch (fallbackError) {
      console.log(`[SEARCH] ⚠️  Simplified query fallback also failed: ${fallbackError.message}`);
    }
  }
  
  // All methods failed
  const isDigitalHint = isDigital ? '\n⚠️  CRITICAL: This is a digital/software business query. Bing Search API is REQUIRED for reliable results.\n' : '';
  const errorMsg = `All search methods failed.${isDigitalHint}

🔧 SOLUTIONS:
1. ✅ Set up Bing Search API (3,000 queries/month free) - ${isDigital ? 'CRITICAL for digital businesses' : 'Recommended'}:
   - Get key: https://www.microsoft.com/en-us/bing/apis/bing-web-search-api
   - Add to .env: BING_API_KEY=your_key
2. ✅ OpenStreetMap should work (free, unlimited) - check logs above
3. ✅ Optional: Google Places API ($200 free/month):
   - Add to .env: GOOGLE_PLACES_API_KEY=your_key`;
  
  throw new Error(errorMsg);
}
