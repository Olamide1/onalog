/**
 * Utility to detect and handle social media URLs
 * Prevents social media URLs from being used as main website URLs
 * Uses pattern-based detection instead of hardcoded lists
 */
import { isSocialMediaDomain } from '../config/domainValidation.js';

/**
 * Check if a URL is a social media platform URL (pattern-based)
 * @param {String} url - URL to check
 * @returns {Boolean} True if URL is a social media platform
 */
export function isSocialMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
    
    // Use centralized pattern-based detection
    return isSocialMediaDomain(hostname);
  } catch {
    // If URL parsing fails, check if it contains social media domain patterns
    const urlLower = url.toLowerCase();
    return /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|snapchat|reddit|tumblr|flickr|vimeo|dribbble|behance|github|medium|wikipedia|whatsapp|discord|telegram|twitch|spotify|soundcloud)\.(com|org|net|io|gg|me|tv)/.test(urlLower);
  }
}

/**
 * Extract social media platform name from URL (pattern-based)
 * @param {String} url - Social media URL
 * @returns {String|null} Platform name (e.g., 'facebook', 'linkedin') or null
 */
export function getSocialMediaPlatform(url) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
    
    // Pattern-based platform extraction (more flexible than hardcoded map)
    const platformPatterns = [
      { pattern: /facebook/i, name: 'facebook' },
      { pattern: /instagram/i, name: 'instagram' },
      { pattern: /twitter|x\.com/i, name: 'twitter' },
      { pattern: /linkedin/i, name: 'linkedin' },
      { pattern: /youtube/i, name: 'youtube' },
      { pattern: /tiktok/i, name: 'tiktok' },
      { pattern: /pinterest/i, name: 'pinterest' },
      { pattern: /snapchat/i, name: 'snapchat' },
      { pattern: /reddit/i, name: 'reddit' },
      { pattern: /tumblr/i, name: 'tumblr' },
      { pattern: /flickr/i, name: 'flickr' },
      { pattern: /vimeo/i, name: 'vimeo' },
      { pattern: /dribbble/i, name: 'dribbble' },
      { pattern: /behance/i, name: 'behance' },
      { pattern: /github/i, name: 'github' },
      { pattern: /medium/i, name: 'medium' },
      { pattern: /wikipedia/i, name: 'wikipedia' },
      { pattern: /whatsapp/i, name: 'whatsapp' },
      { pattern: /discord/i, name: 'discord' },
      { pattern: /telegram/i, name: 'telegram' },
      { pattern: /twitch/i, name: 'twitch' },
      { pattern: /spotify/i, name: 'spotify' },
      { pattern: /soundcloud/i, name: 'soundcloud' }
    ];
    
    for (const { pattern, name } of platformPatterns) {
      if (pattern.test(hostname)) {
        return name;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

