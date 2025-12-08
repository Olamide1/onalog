/**
 * Bing Web Search API integration
 * Free tier: 3,000 queries/month
 * Use for finding decision makers and emails
 */

/**
 * Search Bing for decision makers
 * @param {String} query - Search query
 * @returns {Promise<Array>} Search results
 */
export async function searchBing(query) {
  if (!process.env.BING_WEB_SEARCH_API_KEY) {
    console.log('[BING_SEARCH] API key not configured');
    return [];
  }
  
  try {
    const apiKey = process.env.BING_WEB_SEARCH_API_KEY;
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=10`;
    
    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.log('[BING_SEARCH] Rate limit exceeded');
        return [];
      }
      throw new Error(`Bing API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.webPages?.value || [];
  } catch (error) {
    console.log(`[BING_SEARCH] Error: ${error.message}`);
    return [];
  }
}

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
    /^(retail|corporate|business|commercial|investment|private|wealth|asset|credit|risk|compliance|operations|human|marketing|sales|technology|digital|innovation|strategy|finance|accounting|legal|admin|administrative|customer|client|service|support|product|development|engineering|research|quality|supply|chain|logistics|procurement|sourcing|vendor|partner|alliance|channel|distribution|retail|wholesale|e-commerce|online|mobile|platform|infrastructure|security|information|data|analytics|business intelligence|insights|reporting|audit|internal|external|public|government|regulatory|affairs|relations|communications|media|brand|creative|design|content|editorial|publishing|education|training|learning|talent|recruitment|hr|people|culture|diversity|inclusion|sustainability|environmental|social|responsibility|governance|ethics|compliance|risk|legal|regulatory|tax|treasury|investor|shareholder|stakeholder|community|foundation|charity|non-profit|ngo|public sector|government|municipal|federal|state|local|regional|global|international|emerging|markets|africa|asia|europe|americas|middle east|north|south|east|west|central|northern|southern|eastern|western|central|apac|emea|latam|na)\s+(banking|bank|capital|markets|trading|sales|trading|research|analytics|intelligence|insights|reporting|operations|technology|digital|innovation|strategy|finance|accounting|legal|admin|administrative|customer|client|service|support|product|development|engineering|research|quality|supply|chain|logistics|procurement|sourcing|vendor|partner|alliance|channel|distribution|retail|wholesale|e-commerce|online|mobile|platform|infrastructure|security|information|data|analytics|business intelligence|insights|reporting|audit|internal|external|public|government|regulatory|affairs|relations|communications|media|brand|creative|design|content|editorial|publishing|education|training|learning|talent|recruitment|hr|people|culture|diversity|inclusion|sustainability|environmental|social|responsibility|governance|ethics|compliance|risk|legal|regulatory|tax|treasury|investor|shareholder|stakeholder|community|foundation|charity|non-profit|ngo|public sector|government|municipal|federal|state|local|regional|global|international|emerging|markets|africa|asia|europe|americas|middle east|north|south|east|west|central|northern|southern|eastern|western|central|apac|emea|latam|na)$/i,
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
  
  return true;
}

/**
 * Search for decision makers using Bing
 * @param {String} companyName - Company name
 * @param {String} domain - Company domain (optional)
 * @returns {Promise<Array>} Found decision makers with emails
 */
export async function searchDecisionMakers(companyName, domain = null) {
  const decisionMakers = [];
  const queries = [];
  
  // CRITICAL FIX: Exclude Wikidata from searches
  // Build enhanced search queries (more targeted patterns) - exclude wikidata.org
  if (domain && !domain.includes('wikidata.org')) {
    queries.push(`site:${domain} -site:wikidata.org CEO OR founder OR director`);
    queries.push(`site:${domain} -site:wikidata.org "${companyName}" team OR leadership`);
    queries.push(`site:${domain} -site:wikidata.org "meet the team" OR "our leadership" OR "our team"`);
    queries.push(`site:${domain} -site:wikidata.org "press release" OR "announces" CEO OR founder`);
  }
  // Exclude wikidata from general searches too
  queries.push(`"${companyName}" -site:wikidata.org CEO OR founder OR director email`);
  queries.push(`"${companyName}" -site:wikidata.org "meet the team" OR "our leadership"`);
  queries.push(`"${companyName}" -site:wikidata.org "press release" "announces" CEO`);
  
  // Limit to 3 queries to save API calls but get better coverage
  for (const query of queries.slice(0, 3)) {
    try {
      const results = await searchBing(query);
      
      // CRITICAL FIX: Filter out Wikidata results
      const filteredResults = results.filter(page => 
        !page.url || !page.url.toLowerCase().includes('wikidata.org')
      );
      
      for (const page of filteredResults) {
        const text = `${page.name} ${page.snippet} ${page.url}`;
        
        // Extract emails
        const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        const emails = emailMatches ? [...new Set(emailMatches.map(e => e.toLowerCase()))] : [];
        
        // Extract names and titles
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
                source: 'bing_search',
                confidence: associatedEmail ? 0.8 : 0.6
              });
            }
          }
        }
      }
    } catch (error) {
      console.log(`[BING_SEARCH] Error searching for decision makers: ${error.message}`);
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

