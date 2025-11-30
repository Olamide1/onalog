/**
 * Query parser utility
 * Extracts industry/type and location from natural language queries
 * Example: "hospitals in Nigeria" → { industry: "hospitals", location: "Nigeria" }
 */

/**
 * Parse natural language query to extract industry and location
 * @param {String} query - Natural language query
 * @param {String} existingCountry - Existing country from form (optional)
 * @param {String} existingLocation - Existing location from form (optional)
 * @param {String} existingIndustry - Existing industry from form (optional)
 * @returns {Object} Parsed query with industry, location, country, and cleaned query
 */
export function parseQuery(query, existingCountry = null, existingLocation = null, existingIndustry = null) {
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

  // Common location prepositions
  const locationPatterns = [
    /\b(in|at|near|around|within|from)\s+([A-Z][a-zA-Z\s,]+?)(?:\s|$|,)/g,
    /\b([A-Z][a-zA-Z\s,]+?)\s+(hospitals?|clinics?|companies?|businesses?|shops?|restaurants?|cafes?|agencies?|firms?|services?)/gi
  ];

  // Common industry keywords
  const industryKeywords = [
    'hospital', 'clinic', 'medical', 'healthcare', 'pharmacy', 'dentist', 'doctor',
    'cafe', 'coffee', 'restaurant', 'food', 'catering', 'bakery',
    'shop', 'store', 'retail', 'supermarket', 'mall',
    'school', 'university', 'college', 'education', 'academy',
    'hotel', 'lodging', 'accommodation',
    'bank', 'financial', 'insurance', 'investment',
    'law', 'legal', 'attorney', 'lawyer',
    'architect', 'architecture', 'construction', 'engineering',
    'agency', 'marketing', 'advertising', 'design',
    'saas', 'software', 'tech', 'technology', 'it', 'digital',
    'manufacturing', 'factory', 'production',
    'service', 'consulting', 'consultant'
  ];

  // Extract location using patterns
  for (const pattern of locationPatterns) {
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

  // Extract industry from remaining query
  // Fix: Handle plurals correctly (e.g., "shops" should match "shop")
  const remainingQuery = cleanedQuery.toLowerCase();
  const words = remainingQuery.split(/\s+/);
  
  for (const keyword of industryKeywords) {
    // Check for exact match or plural form
    const keywordPlural = keyword + 's'; // Simple plural (works for most cases)
    const keywordSingular = keyword.replace(/s$/, ''); // Remove trailing 's' if present
    
    // Check each word in the query for keyword match (handles plurals)
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordStem = word.replace(/s$/, ''); // Remove trailing 's' for comparison
      
      if (word === keyword || word === keywordPlural || wordStem === keyword || wordStem === keywordSingular) {
        // Found keyword match - extract the full phrase
        const keywordIndex = remainingQuery.indexOf(word);
        const before = remainingQuery.substring(0, keywordIndex).trim();
        const after = remainingQuery.substring(keywordIndex + word.length).trim();
        
        // Extract the industry phrase (keyword + surrounding words if they form a phrase)
        // Use the actual word from query (preserves plural/singular as user typed)
        let industryPhrase = word;
        
        // Check if next word forms a compound phrase (e.g., "grocery shop", "coffee shop")
        if (before && before.split(/\s+/).length > 0) {
          const lastWordBefore = before.split(/\s+/).pop();
          if (lastWordBefore && lastWordBefore.length > 2) {
            industryPhrase = lastWordBefore + ' ' + word;
          }
        }
        
        // Also check if word after keyword forms a phrase
        if (after && after.split(/\s+/)[0] && ['shop', 'shops', 'store', 'stores', 'center', 'centre', 'centers', 'centres', 'service', 'services', 'company', 'companies', 'business', 'businesses'].includes(after.split(/\s+/)[0].toLowerCase())) {
          industryPhrase = word + ' ' + after.split(/\s+/)[0];
        }
        
        industry = industryPhrase;
        // Remove industry from cleaned query (handle both singular and plural)
        const removePattern = new RegExp(`\\b${industryPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        cleanedQuery = cleanedQuery.replace(removePattern, '').trim();
        break;
      }
    }
    
    if (industry) break; // Exit outer loop if industry found
  }

  // If no industry found but query contains common business terms, use them
  if (!industry) {
    const businessTerms = ['companies', 'businesses', 'firms', 'organizations', 'enterprises'];
    for (const term of businessTerms) {
      if (remainingQuery.includes(term)) {
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

