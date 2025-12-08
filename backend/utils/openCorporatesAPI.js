/**
 * OpenCorporates API Integration
 * Free tier: 50 requests/day
 * Gets official company registration data including directors/officers
 */

/**
 * Search for company in OpenCorporates
 * @param {String} companyName - Company name
 * @param {String} country - Country code (optional)
 * @returns {Promise<Array>} Array of decision makers (directors/officers)
 */
export async function searchOpenCorporates(companyName, country = null) {
  if (!companyName) return [];
  
  // OpenCorporates API endpoint (free tier)
  const apiUrl = 'https://api.opencorporates.com/v0.4/companies/search';
  const params = new URLSearchParams({
    q: companyName,
    format: 'json'
  });
  
  if (country) {
    params.append('jurisdiction_code', country.toLowerCase());
  }
  
  try {
    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.log('[OPENCORPORATES] Rate limit exceeded');
        return [];
      }
      return [];
    }
    
    const data = await response.json();
    const decisionMakers = [];
    
    if (data.results && data.results.companies) {
      // Get the first matching company
      const company = data.results.companies[0]?.company;
      if (company && company.officers) {
        for (const officer of company.officers.slice(0, 5)) {
          if (officer.officer && officer.officer.name) {
            decisionMakers.push({
              name: officer.officer.name,
              title: officer.officer.position || 'Director',
              source: 'opencorporates',
              confidence: 0.95 // Very high accuracy from official records
            });
          }
        }
      }
    }
    
    return decisionMakers;
  } catch (error) {
    console.log(`[OPENCORPORATES] Error: ${error.message}`);
    return [];
  }
}

