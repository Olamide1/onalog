/**
 * Sitemap Crawler
 * Discovers team/leadership pages via sitemap.xml
 */

/**
 * Find team/leadership pages from sitemap
 * @param {String} website - Company website URL
 * @returns {Promise<Array>} Array of URLs to team/leadership pages
 */
export async function findTeamPagesFromSitemap(website) {
  if (!website) return [];
  
  const teamPages = [];
  
  try {
    const urlObj = new URL(website);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    
    const response = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!response.ok) {
      // Try robots.txt for sitemap location
      const robotsResponse = await fetch(`${baseUrl}/robots.txt`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (robotsResponse.ok) {
        const robotsText = await robotsResponse.text();
        const sitemapMatch = robotsText.match(/Sitemap:\s*(.+)/i);
        if (sitemapMatch) {
          const altSitemapUrl = sitemapMatch[1].trim();
          const altResponse = await fetch(altSitemapUrl, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          
          if (altResponse.ok) {
            const sitemapText = await altResponse.text();
            return parseSitemap(sitemapText, baseUrl);
          }
        }
      }
      
      return [];
    }
    
    const sitemapText = await response.text();
    return parseSitemap(sitemapText, baseUrl);
    
  } catch (error) {
    console.log(`[SITEMAP] Error: ${error.message}`);
    return [];
  }
}

/**
 * Parse sitemap XML and find team/leadership pages
 * @param {String} sitemapText - Sitemap XML content
 * @param {String} baseUrl - Base URL
 * @returns {Array} Array of team/leadership page URLs
 */
function parseSitemap(sitemapText, baseUrl) {
  const teamPages = [];
  const teamKeywords = [
    'team', 'about', 'leadership', 'management', 'executives',
    'founders', 'staff', 'people', 'directors', 'board'
  ];
  
  // Simple regex-based parsing (for basic sitemaps)
  const urlPattern = /<loc>(.*?)<\/loc>/gi;
  let match;
  
  while ((match = urlPattern.exec(sitemapText)) !== null && teamPages.length < 10) {
    const url = match[1].trim();
    const urlLower = url.toLowerCase();
    
    // Check if URL contains team-related keywords
    if (teamKeywords.some(keyword => urlLower.includes(keyword))) {
      teamPages.push(url);
    }
  }
  
  return teamPages;
}

