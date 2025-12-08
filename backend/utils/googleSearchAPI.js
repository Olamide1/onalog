/**
 * Google Custom Search API integration
 * Free tier: 100 searches/day = 3,000/month
 * Use for finding decision makers and emails
 */

/**
 * Search Google for decision makers
 * @param {String} query - Search query (e.g., "CEO [Company Name]")
 * @returns {Promise<Array>} Search results
 */
export async function searchGoogle(query) {
  if (!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || !process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
    console.log('[GOOGLE_SEARCH] API key or engine ID not configured');
    return [];
  }
  
  try {
    const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const engineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(query)}&num=10`;
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.log('[GOOGLE_SEARCH] Rate limit exceeded');
        return [];
      }
      throw new Error(`Google API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.log(`[GOOGLE_SEARCH] API error: ${data.error.message}`);
      return [];
    }
    
    return data.items || [];
  } catch (error) {
    console.log(`[GOOGLE_SEARCH] Error: ${error.message}`);
    return [];
  }
}

/**
 * Search for decision makers using Google
 * @param {String} companyName - Company name
 * @param {String} domain - Company domain (optional)
 * @returns {Promise<Array>} Found decision makers with emails
 */
/**
 * Validate if a string looks like a real person name (not a department/role)
 */
function isValidPersonName(name) {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // Must be between 3 and 50 characters
  if (trimmed.length < 3 || trimmed.length > 50) return false;
  
  // Reject common department/role names
  const departmentPatterns = [
    /^(retail|corporate|business|commercial|investment|private|wealth|asset|credit|risk|compliance|operations|human|marketing|sales|technology|digital|innovation|strategy|finance|accounting|legal|admin|administrative|customer|client|service|support|product|development|engineering|research|quality|supply|chain|logistics|procurement|sourcing|vendor|partner|alliance|channel|distribution|retail|wholesale|e-commerce|online|mobile|platform|infrastructure|security|information|data|analytics|business intelligence|insights|reporting|audit|internal|external|public|government|regulatory|affairs|relations|communications|media|brand|creative|design|content|editorial|publishing|education|training|learning|talent|recruitment|hr|people|culture|diversity|inclusion|sustainability|environmental|social|responsibility|governance|ethics|compliance|risk|legal|regulatory|tax|treasury|investor|shareholder|stakeholder|community|foundation|charity|non-profit|ngo|public sector|government|municipal|federal|state|local|regional|global|international|emerging|markets|africa|asia|europe|americas|middle east|north|south|east|west|central|northern|southern|eastern|western|central|apac|emea|latam|na|apac|emea|latam|na|apac|emea|latam|na)\s+(banking|bank|capital|markets|trading|sales|trading|research|analytics|intelligence|insights|reporting|operations|technology|digital|innovation|strategy|finance|accounting|legal|admin|administrative|customer|client|service|support|product|development|engineering|research|quality|supply|chain|logistics|procurement|sourcing|vendor|partner|alliance|channel|distribution|retail|wholesale|e-commerce|online|mobile|platform|infrastructure|security|information|data|analytics|business intelligence|insights|reporting|audit|internal|external|public|government|regulatory|affairs|relations|communications|media|brand|creative|design|content|editorial|publishing|education|training|learning|talent|recruitment|hr|people|culture|diversity|inclusion|sustainability|environmental|social|responsibility|governance|ethics|compliance|risk|legal|regulatory|tax|treasury|investor|shareholder|stakeholder|community|foundation|charity|non-profit|ngo|public sector|government|municipal|federal|state|local|regional|global|international|emerging|markets|africa|asia|europe|americas|middle east|north|south|east|west|central|northern|southern|eastern|western|central|apac|emea|latam|na)$/i,
    /^(wikidata|wikipedia|metadata|data|info|information|details|summary|overview|description|about|contact|team|staff|employees|people|personnel|workforce|talent|human|capital|resources|hr|recruitment|hiring|onboarding|training|development|learning|education|skills|competencies|capabilities|expertise|knowledge|experience|background|qualifications|credentials|certifications|licenses|permits|authorizations|approvals|clearances|security|clearance|background|check|verification|validation|authentication|authorization|access|permissions|privileges|rights|roles|responsibilities|duties|functions|tasks|activities|actions|operations|processes|procedures|policies|guidelines|standards|rules|regulations|laws|statutes|ordinances|codes|requirements|specifications|criteria|conditions|terms|provisions|clauses|sections|articles|paragraphs|subsections|subparagraphs|items|points|bullet|points|list|items|elements|components|parts|pieces|segments|sections|divisions|departments|units|groups|teams|squads|crews|staffs|personnel|workforces|workforces|talent|pools|pools|of|talent|human|resources|hr|departments|divisions|units|groups|teams|squads|crews|staffs|personnel|workforces|talent|pools|pools|of|talent|human|resources|hr|departments|divisions|units|groups|teams|squads|crews|staffs|personnel|workforces|talent|pools|pools|of|talent|human|resources|hr)$/i,
    /^(and|or|the|a|an|of|in|on|at|to|for|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|must|can)$/i,
    /^(co|and co|founded by|founder or|co-founder|cofounder)$/i
  ];
  
  if (departmentPatterns.some(pattern => pattern.test(trimmed))) return false;
  
  // Must match proper name pattern: FirstName LastName (at least 2 capitalized words)
  const properNamePattern = /^[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*$/;
  if (!properNamePattern.test(trimmed)) return false;
  
  // Must have at least two words
  const words = trimmed.split(/\s+/);
  if (words.length < 2) return false;
  
  // Each word must start with capital letter and be at least 2 characters
  if (!words.every(word => /^[A-Z][a-z]{1,}$/.test(word))) return false;
  
  // Reject if contains common business/marketing words
  const businessWords = ['banking', 'capital', 'markets', 'trading', 'sales', 'operations', 'technology', 'digital', 'innovation', 'strategy', 'finance', 'accounting', 'legal', 'admin', 'customer', 'client', 'service', 'support', 'product', 'development', 'engineering', 'research', 'quality', 'supply', 'chain', 'logistics', 'procurement', 'sourcing', 'vendor', 'partner', 'alliance', 'channel', 'distribution', 'retail', 'wholesale', 'e-commerce', 'online', 'mobile', 'platform', 'infrastructure', 'security', 'information', 'data', 'analytics', 'business', 'intelligence', 'insights', 'reporting', 'audit', 'internal', 'external', 'public', 'government', 'regulatory', 'affairs', 'relations', 'communications', 'media', 'brand', 'creative', 'design', 'content', 'editorial', 'publishing', 'education', 'training', 'learning', 'talent', 'recruitment', 'hr', 'people', 'culture', 'diversity', 'inclusion', 'sustainability', 'environmental', 'social', 'responsibility', 'governance', 'ethics', 'compliance', 'risk', 'legal', 'regulatory', 'tax', 'treasury', 'investor', 'shareholder', 'stakeholder', 'community', 'foundation', 'charity', 'non-profit', 'ngo', 'public', 'sector', 'government', 'municipal', 'federal', 'state', 'local', 'regional', 'global', 'international', 'emerging', 'markets', 'africa', 'asia', 'europe', 'americas', 'middle', 'east', 'north', 'south', 'east', 'west', 'central', 'northern', 'southern', 'eastern', 'western', 'central', 'apac', 'emea', 'latam', 'na'];
  const nameLower = trimmed.toLowerCase();
  if (businessWords.some(word => nameLower.includes(word) && nameLower.match(new RegExp(`\\b${word}\\b`)))) {
    return false;
  }
  
  return true;
}

export async function searchDecisionMakers(companyName, domain = null) {
  if (!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || !process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
    console.log('[GOOGLE_SEARCH] API key or engine ID not configured - skipping decision maker search');
    return [];
  }
  
  console.log(`[GOOGLE_SEARCH] Searching for decision makers: "${companyName}"${domain ? ` (${domain})` : ''}`);
  
  const decisionMakers = [];
  const queries = [];
  
  // CRITICAL FIX: Exclude Wikidata from searches
  // Build enhanced search queries (more targeted patterns) - exclude wikidata.org
  if (domain && !domain.includes('wikidata.org')) {
    queries.push(`site:${domain} -site:wikidata.org CEO OR founder OR director`);
    queries.push(`site:${domain} -site:wikidata.org "${companyName}" team OR leadership`);
    queries.push(`site:${domain} -site:wikidata.org "meet the team" OR "our leadership" OR "our team"`);
    queries.push(`site:${domain} -site:wikidata.org "press release" OR "announces" CEO OR founder`);
    queries.push(`site:${domain} -site:wikidata.org "speaker" OR "presenter" conference`);
  }
  // Exclude wikidata from general searches too
  queries.push(`"${companyName}" -site:wikidata.org CEO OR founder OR director email`);
  queries.push(`"${companyName}" -site:wikidata.org leadership team contact`);
  queries.push(`"${companyName}" -site:wikidata.org "meet the team" OR "our leadership"`);
  queries.push(`"${companyName}" -site:wikidata.org "press release" "announces" CEO`);
  queries.push(`"${companyName}" -site:wikidata.org "award" OR "recognition" CEO OR founder`);
  queries.push(`"${companyName}" -site:wikidata.org "partnership" "announces" founder`);
  queries.push(`"${companyName}" -site:wikidata.org site:linkedin.com CEO OR founder OR director`);
  
  // Limit to 4 queries to save API calls but get better coverage
  for (const query of queries.slice(0, 4)) {
    try {
      console.log(`[GOOGLE_SEARCH] Executing query: "${query}"`);
      const results = await searchGoogle(query);
      console.log(`[GOOGLE_SEARCH] Found ${results.length} results for query: "${query}"`);
      
      // CRITICAL FIX: Filter out Wikidata results
      const filteredResults = results.filter(item => 
        !item.link || !item.link.toLowerCase().includes('wikidata.org')
      );
      
      for (const item of filteredResults) {
        const text = `${item.title} ${item.snippet} ${item.link}`;
        
        // Extract emails
        const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        const emails = emailMatches ? [...new Set(emailMatches.map(e => e.toLowerCase()))] : [];
        
        // Extract names and titles (simple pattern matching)
        const nameTitlePatterns = [
          /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[,\-–]\s*(CEO|CTO|CFO|Founder|Director|Manager|President)/gi,
          /(CEO|CTO|CFO|Founder|Director|Manager|President)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi
        ];
        
        for (const pattern of nameTitlePatterns) {
          const matches = [...text.matchAll(pattern)];
          for (const match of matches) {
            const name = pattern === nameTitlePatterns[0] ? match[1] : match[2];
            const title = pattern === nameTitlePatterns[0] ? match[2] : match[1];
            
            // CRITICAL FIX: Validate name is a real person name before adding
            if (name && title && isValidPersonName(name)) {
              // Find associated email if available
              const associatedEmail = emails.find(e => 
                e.includes(name.split(' ')[0].toLowerCase()) || 
                e.includes(name.split(' ')[name.split(' ').length - 1].toLowerCase())
              );
              
              decisionMakers.push({
                name: name.trim(),
                title: title.trim(),
                email: associatedEmail || null,
                source: 'google_search',
                confidence: associatedEmail ? 0.8 : 0.6
              });
            }
          }
        }
      }
    } catch (error) {
      console.log(`[GOOGLE_SEARCH] Error searching for decision makers: ${error.message}`);
    }
  }
  
  // Deduplicate
  const seen = new Set();
  return decisionMakers.filter(dm => {
    const key = `${dm.name.toLowerCase()}-${dm.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

