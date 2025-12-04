/**
 * Centralized domain validation configuration
 * This file contains patterns and rules for domain validation that can be updated
 * without modifying core logic files.
 */

/**
 * Invalid domains that should never be used as business websites
 * These are test/placeholder/development domains
 */
export const INVALID_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'example.com',
  'test.com',
  'placeholder.com',
  'domain.com',
  'website.com',
  'site.com',
  'demo.com',
  'sample.com',
  'temp.com',
  'temporary.com'
];

/**
 * Pattern-based detection for invalid domains
 * More flexible than hardcoded list - catches variations
 */
export function isInvalidDomain(hostname) {
  if (!hostname) return true;
  const hostnameLower = hostname.toLowerCase();
  
  // Check against known invalid domains
  if (INVALID_DOMAINS.some(invalid => hostnameLower.includes(invalid))) {
    return true;
  }
  
  // Pattern-based detection for invalid domains
  const invalidPatterns = [
    /^localhost(\.|$)/i,
    /^127\.0\.0\.1$/,
    /^0\.0\.0\.0$/,
    /^example\./i,
    /^test\./i,
    /^placeholder\./i,
    /^demo\./i,
    /^sample\./i,
    /^temp/i,
    /^temporary\./i,
    /\.local$/i, // Local development domains
    /\.test$/i,  // Test TLDs
    /\.invalid$/i // Invalid TLDs
  ];
  
  return invalidPatterns.some(pattern => pattern.test(hostnameLower));
}

/**
 * Universal platforms that should always be blocked
 * These are major platforms that are never actual business websites
 */
export const UNIVERSAL_BLOCKED_PATTERNS = [
  /^google\.com$/i,
  /^facebook\.com$/i,
  /^instagram\.com$/i,
  /^twitter\.com$/i,
  /^x\.com$/i,
  /^linkedin\.com$/i,
  /^youtube\.com$/i,
  /^wikipedia\.org$/i
];

/**
 * Check if a domain is a universal blocked platform
 */
export function isUniversalBlocked(hostname) {
  if (!hostname) return false;
  const hostnameLower = hostname.toLowerCase().replace('www.', '');
  return UNIVERSAL_BLOCKED_PATTERNS.some(pattern => pattern.test(hostnameLower));
}

/**
 * Directory/aggregator domain patterns (dynamic detection)
 * Uses pattern matching instead of hardcoded lists
 */
export const DIRECTORY_DOMAIN_PATTERNS = [
  // Domain name patterns
  /directory/i,
  /listings?/i,
  /marketplace/i,
  /aggregator/i,
  /bizinfo/i,
  /yellow/i,
  /businesslist/i,
  /companylist/i,
  /aggregate/i,
  /collector/i,
  /indexer/i,
  /catalog/i,
  /registry/i,
  /database/i, // Ranking/database sites (e.g., footballdatabase.com)
  /hub/i, // But needs false positive filtering
  /portal/i // But needs false positive filtering
];

/**
 * False positives for directory detection
 * Legitimate businesses that might match directory patterns
 */
export const DIRECTORY_FALSE_POSITIVES = [
  'hubspot',
  'hubdoc',
  'hubstaff',
  'hubpages',
  'hubzilla',
  'hubdoc',
  'hubstaff'
];

/**
 * Domain marketplace patterns (dynamic)
 */
export const DOMAIN_MARKETPLACE_PATTERNS = [
  /hugedomains/i,
  /sortlist/i,
  /sedo/i,
  /afternic/i,
  /flippa/i,
  /domain.*profile/i,
  /domain.*sale/i,
  /domain.*for.*sale/i,
  /buy.*domain/i,
  /premium.*domain/i,
  /domain.*marketplace/i,
  /domain.*auction/i,
  /is.*for.*sale/i,
  /\.com.*is.*for.*sale/i,
  /domain.*details.*page/i,
  /domain_profile/i,
  /godaddy.*marketplace/i,
  /namecheap.*marketplace/i
];

/**
 * Social media platform patterns (dynamic detection)
 * More flexible than hardcoded list
 */
export const SOCIAL_MEDIA_PATTERNS = [
  /facebook\.(com|net|org)/i,
  /instagram\.(com|net)/i,
  /twitter\.(com|net)/i,
  /x\.com/i,
  /linkedin\.(com|net)/i,
  /youtube\.(com|net)/i,
  /tiktok\.(com|net)/i,
  /pinterest\.(com|net)/i,
  /snapchat\.(com|net)/i,
  /reddit\.(com|net)/i,
  /tumblr\.(com|net)/i,
  /flickr\.(com|net)/i,
  /vimeo\.(com|net)/i,
  /dribbble\.(com|net)/i,
  /behance\.(com|net)/i,
  /github\.(com|net|io)/i,
  /medium\.(com|net)/i,
  /wikipedia\.(org|com)/i,
  /whatsapp\.(com|net)/i,
  /web\.whatsapp\.com/i,
  /discord\.(com|gg|net)/i,
  /telegram\.(org|me)/i,
  /twitch\.tv/i,
  /spotify\.com/i,
  /soundcloud\.com/i
];

/**
 * Check if a domain is a social media platform (pattern-based)
 */
export function isSocialMediaDomain(hostname) {
  if (!hostname) return false;
  const hostnameLower = hostname.toLowerCase().replace('www.', '');
  return SOCIAL_MEDIA_PATTERNS.some(pattern => pattern.test(hostnameLower));
}

/**
 * Generic company name patterns (dynamic detection)
 * Uses pattern matching instead of hardcoded list
 */
export const GENERIC_NAME_PATTERNS = [
  // Generic page names
  /^(home|homepage|welcome|index|default|page|site|website)$/i,
  // Domain-related
  /domain\s*(details\s*page|profile|for\s*sale|sale|marketplace|auction|details)/i,
  /(is\s+for\s+sale|for\s+sale|domain\s+sale|buy\s+domain|premium\s+domain)/i,
  // Generic business terms
  /^(unknown\s+company|company|business|organization)$/i,
  // Page placeholders
  /^(untitled|new\s+page|page\s+title|default\s+page|coming\s+soon|under\s+construction|maintenance)$/i,
  // Domain extension patterns
  /\.(com|net|org|io|co)\s+is\s+for\s+sale/i
];

/**
 * Check if a name is generic/placeholder (pattern-based)
 */
export function isGenericCompanyName(name) {
  if (!name || name.length < 2) return true;
  const nameLower = name.toLowerCase().trim();
  
  // Check against patterns
  if (GENERIC_NAME_PATTERNS.some(pattern => pattern.test(nameLower))) {
    return true;
  }
  
  // Check for domain marketplace indicators
  if (/hugedomains|domain.*profile|domain.*marketplace/i.test(nameLower)) {
    return true;
  }
  
  // Reject single-word generic terms if too short
  if (nameLower.length < 4 && ['home', 'page', 'site', 'web'].includes(nameLower)) {
    return true;
  }
  
  return false;
}

/**
 * Known directory/aggregator domains (fallback for performance)
 * This is a fast-path cache, but primary detection should be pattern-based
 */
export const KNOWN_DIRECTORY_DOMAINS = [
  // Data aggregators
  'tomba.io', 'cybo.com', 'zoominfo.com', 'opencorporates.com',
  'dnb.com', 'f6s.com', 'tracxn.com',
  // Business directories
  'yelp.com', 'yellowpages.com', 'whitepages.com', 'business.com',
  'manta.com', 'bbb.org', 'indeed.com', 'glassdoor.com',
  // Domain marketplaces (critical)
  'hugedomains.com', 'sortlist.com', 'sedo.com', 'afternic.com',
  'flippa.com', 'domain.com', 'domainmarketplace.com',
  // Review aggregators
  'tripadvisor.com', 'zomato.com', 'foursquare.com', 'opentable.com',
  'restaurantguru.com',
  // OpenStreetMap
  'openstreetmap.org'
];

/**
 * Check if a domain is a known directory (fast-path)
 * This is a performance optimization, but pattern-based detection is primary
 */
export function isKnownDirectoryDomain(hostname) {
  if (!hostname) return false;
  const hostnameLower = hostname.toLowerCase().replace('www.', '');
  return KNOWN_DIRECTORY_DOMAINS.some(domain => hostnameLower.includes(domain));
}

