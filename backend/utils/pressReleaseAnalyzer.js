/**
 * Press Release and News Article Analysis
 * Extracts decision makers from press releases and news articles
 */

/**
 * Extract decision makers from press release/news content
 * @param {String} html - HTML content
 * @param {String} companyName - Company name
 * @returns {Array} Array of decision makers found
 */
export function extractFromPressReleases(html, companyName) {
  const decisionMakers = [];
  const seen = new Set();
  
  // Patterns for press releases and news articles
  const patterns = [
    // "CEO John Smith said" or "according to CEO John Smith"
    /(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)\s+([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s+(?:said|announced|stated|commented|explained|noted)/gi,
    // "John Smith, CEO, said" or "John Smith, CEO of Company"
    /([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?),\s*(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)(?:\s+of\s+[^,]+)?/gi,
    // "announced by John Smith, CEO"
    /(?:announced|led|spearheaded|headed)\s+by\s+([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?),\s*(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/gi,
    // Quote attribution: "..." - John Smith, CEO
    /[""''].*?[""'']\s*[-–—]\s*([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?),\s*(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/gi
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
            source: 'press_release',
            confidence: 0.85
          });
        }
      }
    }
  }
  
  return decisionMakers;
}

