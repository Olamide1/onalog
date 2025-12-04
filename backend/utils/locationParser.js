/**
 * Location parsing and normalization
 * Extracts structured location data from address strings
 */

/**
 * Parse address string into structured location object
 * @param {String} address - Raw address string
 * @param {String} website - Website URL for domain-based country detection
 * @returns {Object} Structured location object
 */
export function parseLocation(address, website = null) {
  if (!address || typeof address !== 'string') {
    // Try to extract country from website domain
    const countryFromDomain = extractCountryFromDomain(website);
    return {
      city: null,
      state: null,
      country: countryFromDomain,
      formatted: null
    };
  }
  
  const addressTrimmed = address.trim();
  if (!addressTrimmed) {
    const countryFromDomain = extractCountryFromDomain(website);
    return {
      city: null,
      state: null,
      country: countryFromDomain,
      formatted: addressTrimmed
    };
  }
  
  // Common country patterns
  const countryPatterns = {
    'NG': /nigeria/i,
    'KE': /kenya/i,
    'ZA': /south\s+africa|south\s+african/i,
    'GH': /ghana/i,
    'UG': /uganda/i,
    'TZ': /tanzania/i,
    'ET': /ethiopia/i,
    'EG': /egypt/i,
    'US': /united\s+states|usa|u\.s\.a\./i,
    'GB': /united\s+kingdom|uk|u\.k\.|england|scotland|wales/i,
    'CA': /canada/i,
    'AU': /australia/i,
    'IN': /india/i,
    'CN': /china/i,
    'FR': /france/i,
    'DE': /germany/i,
    'IT': /italy/i,
    'ES': /spain/i,
    'NL': /netherlands|holland/i,
    'BE': /belgium/i,
    'CH': /switzerland/i,
    'AT': /austria/i,
    'SE': /sweden/i,
    'NO': /norway/i,
    'DK': /denmark/i,
    'PL': /poland/i,
    'IE': /ireland/i,
    'PT': /portugal/i,
    'BR': /brazil/i,
    'MX': /mexico/i,
    'AE': /uae|united\s+arab\s+emirates|dubai/i,
    'SA': /saudi\s+arabia/i
  };
  
  let country = null;
  for (const [code, pattern] of Object.entries(countryPatterns)) {
    if (pattern.test(addressTrimmed)) {
      country = code;
      break;
    }
  }
  
  // If no country found, try domain-based detection
  if (!country) {
    country = extractCountryFromDomain(website);
  }
  
  // Extract city - look for common patterns
  // Format: "City, State/Country" or "City, Country"
  let city = null;
  const cityMatch = addressTrimmed.match(/^([^,]+),/);
  if (cityMatch) {
    city = cityMatch[1].trim();
    // Remove common prefixes
    city = city.replace(/^(city\s+of|town\s+of)\s+/i, '').trim();
  }
  
  // Extract state/province
  let state = null;
  const parts = addressTrimmed.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    // Usually state is the second part if country is at the end
    state = parts[parts.length - 2];
    // Check if it's actually a state code or name
    if (state && state.length <= 3 && /^[A-Z]{2,3}$/.test(state)) {
      // It's a state code
    } else if (state && state.length > 20) {
      // Probably not a state, might be part of address
      state = null;
    }
  }
  
  return {
    city: city || null,
    state: state || null,
    country: country || null,
    formatted: addressTrimmed
  };
}

/**
 * Extract country code from website domain
 * @param {String} website - Website URL
 * @returns {String|null} Country code
 */
function extractCountryFromDomain(website) {
  if (!website) return null;
  
  try {
    const url = new URL(website);
    const hostname = url.hostname.toLowerCase();
    
    // Check for country code TLD
    const countryTLDs = {
      '.ke': 'KE', '.ng': 'NG', '.za': 'ZA', '.gh': 'GH', '.ug': 'UG',
      '.tz': 'TZ', '.et': 'ET', '.eg': 'EG', '.us': 'US', '.uk': 'GB',
      '.ca': 'CA', '.au': 'AU', '.in': 'IN', '.cn': 'CN', '.fr': 'FR',
      '.de': 'DE', '.it': 'IT', '.es': 'ES', '.nl': 'NL', '.be': 'BE',
      '.ch': 'CH', '.at': 'AT', '.se': 'SE', '.no': 'NO', '.dk': 'DK',
      '.pl': 'PL', '.ie': 'IE', '.pt': 'PT', '.br': 'BR', '.mx': 'MX',
      '.ae': 'AE', '.sa': 'SA'
    };
    
    for (const [tld, code] of Object.entries(countryTLDs)) {
      if (hostname.endsWith(tld) || hostname.includes(tld)) {
        return code;
      }
    }
    
    // Check for co.uk, com.ng, etc.
    if (hostname.includes('.co.za')) return 'ZA';
    if (hostname.includes('.co.ke')) return 'KE';
    if (hostname.includes('.com.ng')) return 'NG';
    if (hostname.includes('.co.uk')) return 'GB';
    
    return null;
  } catch (e) {
    return null;
  }
}
