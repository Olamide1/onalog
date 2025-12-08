/**
 * Wikipedia Extraction
 * Extracts decision makers from company Wikipedia pages
 */

/**
 * Extract decision makers from Wikipedia page
 * @param {String} companyName - Company name
 * @returns {Promise<Array>} Array of decision makers found
 */
export async function extractFromWikipedia(companyName) {
  if (!companyName) return [];
  
  const decisionMakers = [];
  
  try {
    // Search Wikipedia for company page
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName)}`;
    
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    if (!response.ok) {
      // Try searching instead
      const searchResponse = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/search/${encodeURIComponent(companyName)}?limit=1`,
        {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }
      );
      
      if (!searchResponse.ok) return [];
      
      const searchData = await searchResponse.json();
      if (!searchData.pages || searchData.pages.length === 0) return [];
      
      const pageTitle = searchData.pages[0].key;
      const pageUrl = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(pageTitle)}`;
      const pageResponse = await fetch(pageUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!pageResponse.ok) return [];
      
      const html = await pageResponse.text();
      return extractFromWikipediaHTML(html);
    }
    
    // Get full page HTML
    const pageUrl = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(companyName)}`;
    const pageResponse = await fetch(pageUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!pageResponse.ok) return [];
    
    const html = await pageResponse.text();
    return extractFromWikipediaHTML(html);
    
  } catch (error) {
    console.log(`[WIKIPEDIA] Error: ${error.message}`);
    return [];
  }
}

/**
 * Extract decision makers from Wikipedia HTML
 * @param {String} html - Wikipedia page HTML
 * @returns {Array} Array of decision makers
 */
function extractFromWikipediaHTML(html) {
  const decisionMakers = [];
  const seen = new Set();
  
  // Patterns for Wikipedia infobox and leadership sections
  const patterns = [
    // Infobox patterns: "| CEO = John Smith"
    /\|\s*(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)\s*=\s*([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)/gi,
    // Leadership section: "== Leadership ==\n* John Smith (CEO)"
    /==\s*Leadership\s*==[\s\S]*?\*\s*([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s*\(([^)]+)\)/gi,
    // "John Smith is the CEO"
    /([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s+is\s+the\s+(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/gi
  ];
  
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(html)) !== null && decisionMakers.length < 10) {
      const name = match[1]?.trim();
      const title = match[2]?.trim() || match[0].match(/(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/i)?.[0];
      
      if (name && name.length >= 3 && name.length <= 50) {
        const key = name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          decisionMakers.push({
            name: name,
            title: title || 'Executive',
            source: 'wikipedia',
            confidence: 0.9
          });
        }
      }
    }
  }
  
  return decisionMakers;
}

