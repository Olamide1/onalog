/**
 * Employee count extraction from LinkedIn and other sources
 */

/**
 * Extract employee count from LinkedIn company page HTML
 * @param {String} html - LinkedIn page HTML
 * @returns {Number|null} Employee count or null if not found
 */
export function extractEmployeeCountFromLinkedIn(html) {
  if (!html) return null;
  
  try {
    // Pattern 1: "X employees" or "X employees on LinkedIn"
    const employeePattern1 = /(\d{1,3}(?:,\d{3})*)\s+employees?/i;
    const match1 = html.match(employeePattern1);
    if (match1) {
      const count = parseInt(match1[1].replace(/,/g, ''), 10);
      if (!isNaN(count) && count > 0 && count < 1000000) { // Sanity check with NaN validation
        return count;
      }
    }
    
    // Pattern 2: "X people" (LinkedIn sometimes says "people")
    const peoplePattern = /(\d{1,3}(?:,\d{3})*)\s+people/i;
    const match2 = html.match(peoplePattern);
    if (match2) {
      const count = parseInt(match2[1].replace(/,/g, ''), 10);
      if (!isNaN(count) && count > 0 && count < 1000000) {
        return count;
      }
    }
    
    // Pattern 3: Look for structured data
    const structuredDataMatch = html.match(/"numberOfEmployees"\s*:\s*"?(\d+)"?/i);
    if (structuredDataMatch) {
      const count = parseInt(structuredDataMatch[1], 10);
      if (!isNaN(count) && count > 0 && count < 1000000) {
        return count;
      }
    }
    
    // Pattern 4: Look in meta tags
    const metaMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*(\d{1,3}(?:,\d{3})*)\s+employees?[^"']*)["']/i);
    if (metaMatch && metaMatch[2]) {
      const count = parseInt(metaMatch[2].replace(/,/g, ''), 10);
      if (!isNaN(count) && count > 0 && count < 1000000) {
        return count;
      }
    }
    
    return null;
  } catch (error) {
    console.log(`[EMPLOYEE_COUNT] Error extracting from LinkedIn: ${error.message}`);
    return null;
  }
}

/**
 * Convert employee count to range bucket
 * @param {Number} count - Employee count
 * @returns {String} Range bucket
 */
export function getEmployeeCountRange(count) {
  if (!count || count <= 0) return null;
  
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  if (count <= 500) return '201-500';
  if (count <= 1000) return '501-1000';
  return '1000+';
}

/**
 * Estimate employee count from company size description
 * @param {String} companySize - Company size description (micro, small, medium, large)
 * @returns {Number|null} Estimated employee count (midpoint of range)
 */
export function estimateEmployeeCountFromSize(companySize) {
  if (!companySize) return null;
  
  const sizeLower = companySize.toLowerCase();
  
  if (sizeLower === 'micro') return 5; // 1-10
  if (sizeLower === 'small') return 25; // 11-50
  if (sizeLower === 'medium') return 125; // 51-200
  if (sizeLower === 'large') return 500; // 201-1000+
  
  return null;
}
