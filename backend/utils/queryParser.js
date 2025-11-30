/**
 * Query parser utility
 * Extracts industry/type and location from natural language queries
 * Example: "hospitals in Nigeria" → { industry: "hospitals", location: "Nigeria" }
 */

import { OpenAI } from 'openai';

// Cache for LLM responses (to avoid repeated API calls)
const INDUSTRY_CACHE = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Dynamically extract industry from query using LLM (no hardcoded keywords)
 * @param {String} query - Natural language query
 * @returns {Promise<String|null>} Extracted industry or null
 */
async function extractIndustryWithLLM(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    return null;
  }
  
  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  const cached = INDUSTRY_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.industry;
  }
  
  // If no OpenAI key, return null (fallback to pattern matching)
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Extract the business type or industry from this search query: "${query}"

Return ONLY a JSON object with this exact structure:
{
  "industry": "the business type/industry (e.g., 'hospitals', 'grocery stores', 'farmers', 'phone stores', 'restaurants')",
  "confidence": 0.0 to 1.0
}

Rules:
- Extract the specific business type/industry (e.g., "farmers", "phone stores", "grocery shops", "hospitals")
- If the query is generic (e.g., "companies", "businesses"), return null for industry
- Use the exact term from the query when possible (e.g., "farmers" not "agriculture")
- Return null if no clear industry can be determined
- Confidence should reflect how certain you are about the extraction

Examples:
- "farmers in lagos" → {"industry": "farmers", "confidence": 0.95}
- "phone stores in Abuja" → {"industry": "phone stores", "confidence": 0.95}
- "grocery shops" → {"industry": "grocery shops", "confidence": 0.9}
- "companies in Nigeria" → {"industry": null, "confidence": 0.0}
- "hospitals" → {"industry": "hospitals", "confidence": 0.95}

Output the JSON object only:`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You extract business types/industries from search queries. Output JSON only.' },
        { role: 'user', content: prompt }
      ]
    });
    
    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const result = JSON.parse(text);
    
    const industry = result.industry && result.confidence > 0.5 ? result.industry : null;
    
    // Cache the result
    INDUSTRY_CACHE.set(cacheKey, {
      industry,
      expiresAt: Date.now() + CACHE_TTL
    });
    
    return industry;
  } catch (error) {
    console.log(`[QUERY_PARSER] LLM industry extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Parse natural language query to extract industry and location
 * @param {String} query - Natural language query
 * @param {String} existingCountry - Existing country from form (optional)
 * @param {String} existingLocation - Existing location from form (optional)
 * @param {String} existingIndustry - Existing industry from form (optional)
 * @returns {Promise<Object>} Parsed query with industry, location, country, and cleaned query
 */
export async function parseQuery(query, existingCountry = null, existingLocation = null, existingIndustry = null) {
  if (!query || typeof query !== 'string') {
    return {
      industry: existingIndustry || null,
      location: existingLocation || null,
      country: existingCountry || null,
      cleanedQuery: query || ''
    };
  }

  // Fix: Only skip parsing if BOTH industry AND location are already provided
  // Country doesn't prevent extracting industry/location from query text
  // This matches the logic in search.js where country is handled separately
  if (existingIndustry && existingLocation) {
    return {
      industry: existingIndustry || null,
      location: existingLocation || null,
      country: existingCountry || null,
      cleanedQuery: query.trim()
    };
  }

  const queryLower = query.toLowerCase().trim();
  let industry = null;
  let location = null;
  let country = null;
  let cleanedQuery = query;

  // Common location prepositions (case-insensitive)
  const locationPatterns = [
    /\b(in|at|near|around|within|from)\s+([A-Za-z][A-Za-z\s,]+?)(?:\s|$|,)/gi,
    /\b([A-Za-z][A-Za-z\s,]+?)\s+(hospitals?|clinics?|companies?|businesses?|shops?|restaurants?|cafes?|agencies?|firms?|services?|stores?|farmers?|merchants?|vendors?|sellers?|providers?)/gi
  ];

  // Extract location using patterns (case-insensitive)
  for (const pattern of locationPatterns) {
    // Reset regex lastIndex to ensure fresh matching
    pattern.lastIndex = 0;
    const matches = [...query.matchAll(pattern)];
    if (matches.length > 0) {
      // Get the last match (most specific location)
      const lastMatch = matches[matches.length - 1];
      const locationText = lastMatch[2] || lastMatch[1];
      if (locationText && locationText.trim().length > 0) {
        location = locationText.trim();
        // Remove location from cleaned query
        cleanedQuery = cleanedQuery.replace(new RegExp(locationText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
        cleanedQuery = cleanedQuery.replace(/\b(in|at|near|around|within|from)\s+/gi, '').trim();
        break;
      }
    }
  }

  // Extract industry dynamically using LLM (no hardcoded keywords)
  // This handles any industry type: farmers, phone stores, grocery shops, etc.
  const remainingQuery = cleanedQuery.trim();
  if (remainingQuery && remainingQuery.length > 0) {
    const llmIndustry = await extractIndustryWithLLM(remainingQuery);
    if (llmIndustry) {
      industry = llmIndustry;
      // Remove industry from cleaned query
      const removePattern = new RegExp(`\\b${industry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      cleanedQuery = cleanedQuery.replace(removePattern, '').trim();
    }
  }

  // If no industry found from LLM but query contains common business terms, use them as fallback
  if (!industry) {
    const businessTerms = ['companies', 'businesses', 'firms', 'organizations', 'enterprises'];
    const remainingLower = remainingQuery.toLowerCase();
    for (const term of businessTerms) {
      if (remainingLower.includes(term)) {
        industry = term;
        cleanedQuery = cleanedQuery.replace(new RegExp(term, 'gi'), '').trim();
        break;
      }
    }
  }

  // Clean up cleaned query (remove extra spaces, common words)
  cleanedQuery = cleanedQuery.replace(/\s+/g, ' ').trim();
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'at'];
  cleanedQuery = cleanedQuery.split(/\s+/).filter(word => !commonWords.includes(word.toLowerCase())).join(' ');

  // If cleaned query is empty or very short, use original query
  if (!cleanedQuery || cleanedQuery.length < 3) {
    cleanedQuery = query.trim();
  }

  return {
    // Prioritize existing values over parsed values (existing values are explicit user input)
    industry: existingIndustry || industry || null,
    location: existingLocation || location || null,
    country: existingCountry || null, // Country is not parsed from query, only use existing if provided
    cleanedQuery: cleanedQuery
  };
}

/**
 * Check if a query looks like a person name (e.g., "John Smith", "Darren Levy - CEO")
 * @param {String} query - Query string
 * @returns {Boolean} True if query looks like a person name
 */
export function isPersonQuery(query) {
  if (!query || typeof query !== 'string') return false;
  
  const personPatterns = [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/, // "John Smith" or "John Michael Smith"
    /^[A-Z][a-z]+\s+[A-Z][a-z]+\s*[-|]\s*[A-Z]+/, // "John Smith - CEO"
    /^(Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+/i // "Dr. Smith"
  ];
  
  return personPatterns.some(pattern => pattern.test(query.trim()));
}

