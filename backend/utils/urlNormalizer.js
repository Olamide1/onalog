/**
 * URL normalization utility
 * Normalizes URLs for duplicate detection by:
 * - Removing scheme differences (http vs https)
 * - Removing trailing slashes
 * - Removing paths (keeping only domain)
 * - Handling URL encoding
 * - Removing www. prefix
 * - Converting to lowercase
 */

/**
 * Normalize URL to a canonical form for duplicate detection
 * @param {String} url - URL to normalize
 * @returns {String} Normalized URL (domain only, lowercase, no www)
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  
  try {
    // Handle URLs without scheme
    let urlToParse = url.trim();
    if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
      urlToParse = 'https://' + urlToParse;
    }
    
    const urlObj = new URL(urlToParse);
    
    // Extract domain (hostname without www)
    let hostname = urlObj.hostname.toLowerCase();
    
    // Remove www. prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    // Remove trailing dot (some domains have it)
    hostname = hostname.replace(/\.$/, '');
    
    return hostname;
  } catch (error) {
    // If URL parsing fails, try basic normalization
    let normalized = url.toLowerCase().trim();
    
    // Remove scheme
    normalized = normalized.replace(/^https?:\/\//i, '');
    
    // Remove www. prefix
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    
    // Remove path, query, fragment
    normalized = normalized.split('/')[0].split('?')[0].split('#')[0];
    
    // Remove trailing dot
    normalized = normalized.replace(/\.$/, '');
    
    return normalized;
  }
}

/**
 * Check if two URLs point to the same domain
 * @param {String} url1 - First URL
 * @param {String} url2 - Second URL
 * @returns {Boolean} True if URLs point to the same domain
 */
export function urlsMatch(url1, url2) {
  if (!url1 || !url2) return false;
  
  const normalized1 = normalizeUrl(url1);
  const normalized2 = normalizeUrl(url2);
  
  return normalized1 === normalized2 && normalized1.length > 0;
}

