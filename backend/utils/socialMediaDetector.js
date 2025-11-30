/**
 * Utility to detect and handle social media URLs
 * Prevents social media URLs from being used as main website URLs
 */

/**
 * Check if a URL is a social media platform URL
 * @param {String} url - URL to check
 * @returns {Boolean} True if URL is a social media platform
 */
export function isSocialMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
    
    // Common social media platforms
    const socialMediaDomains = [
      'facebook.com',
      'instagram.com',
      'twitter.com',
      'x.com',
      'linkedin.com',
      'youtube.com',
      'tiktok.com',
      'pinterest.com',
      'snapchat.com',
      'reddit.com',
      'tumblr.com',
      'flickr.com',
      'vimeo.com',
      'dribbble.com',
      'behance.com',
      'github.com', // Developer profiles, not business websites
      'medium.com',
      'wikipedia.org'
    ];
    
    return socialMediaDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    // If URL parsing fails, check if it contains social media domain patterns
    const urlLower = url.toLowerCase();
    return /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|snapchat|reddit|tumblr|flickr|vimeo|dribbble|behance|github|medium|wikipedia)\.(com|org|net|io)/.test(urlLower);
  }
}

/**
 * Extract social media platform name from URL
 * @param {String} url - Social media URL
 * @returns {String|null} Platform name (e.g., 'facebook', 'linkedin') or null
 */
export function getSocialMediaPlatform(url) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
    
    const platformMap = {
      'facebook.com': 'facebook',
      'instagram.com': 'instagram',
      'twitter.com': 'twitter',
      'x.com': 'twitter',
      'linkedin.com': 'linkedin',
      'youtube.com': 'youtube',
      'tiktok.com': 'tiktok',
      'pinterest.com': 'pinterest',
      'snapchat.com': 'snapchat',
      'reddit.com': 'reddit',
      'tumblr.com': 'tumblr',
      'flickr.com': 'flickr',
      'vimeo.com': 'vimeo',
      'dribbble.com': 'dribbble',
      'behance.com': 'behance',
      'github.com': 'github',
      'medium.com': 'medium',
      'wikipedia.org': 'wikipedia'
    };
    
    for (const [domain, platform] of Object.entries(platformMap)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return platform;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

