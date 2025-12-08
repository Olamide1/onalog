/**
 * TheHarvester integration for email discovery
 * Uses multiple sources to find emails for decision makers
 * 
 * Note: This is a wrapper that can call TheHarvester CLI or use its methods
 * For production, you may want to install TheHarvester: pip install theHarvester
 */

/**
 * Search for emails using TheHarvester-like approach
 * Since TheHarvester is a Python tool, we'll implement similar logic in Node.js
 * @param {String} name - Person's name
 * @param {String} domain - Company domain
 * @returns {Promise<Array<String>>} Array of found email addresses
 */
export async function searchEmails(name, domain) {
  if (!name || !domain) return [];
  
  const emails = new Set();
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  
  // Search patterns to try
  const searchQueries = [
    `"${name}" "${domain}" email`,
    `"${firstName} ${lastName}" "@${domain}"`,
    `"${firstName}.${lastName}@${domain}"`,
    `"${firstName}@${domain}"`,
    `"${lastName}@${domain}"`,
    `site:${domain} "${name}" email`,
    `site:${domain} "${firstName} ${lastName}" contact`
  ];
  
  // Use Google Custom Search API if available
  if (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY && process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
    try {
      for (const query of searchQueries.slice(0, 3)) { // Limit to 3 queries to save API calls
        const foundEmails = await searchGoogleForEmails(query);
        foundEmails.forEach(email => emails.add(email));
      }
    } catch (error) {
      console.log(`[THEHARVESTER] Google search error: ${error.message}`);
    }
  }
  
  // Use Bing Web Search API if available
  if (process.env.BING_WEB_SEARCH_API_KEY) {
    try {
      for (const query of searchQueries.slice(0, 2)) { // Limit to 2 queries
        const foundEmails = await searchBingForEmails(query);
        foundEmails.forEach(email => emails.add(email));
      }
    } catch (error) {
      console.log(`[THEHARVESTER] Bing search error: ${error.message}`);
    }
  }
  
  // Extract emails from domain's contact page
  try {
    const contactEmails = await extractEmailsFromContactPage(domain);
    contactEmails.forEach(email => emails.add(email));
  } catch (error) {
    console.log(`[THEHARVESTER] Contact page extraction error: ${error.message}`);
  }
  
  return Array.from(emails);
}

/**
 * Search Google for emails
 * @param {String} query - Search query
 * @returns {Promise<Array<String>>} Found emails
 */
async function searchGoogleForEmails(query) {
  if (!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || !process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
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
      throw new Error(`Google API error: ${response.status}`);
    }
    
    const data = await response.json();
    const emails = new Set();
    
    // Extract emails from search results
    if (data.items) {
      for (const item of data.items) {
        const text = `${item.title} ${item.snippet} ${item.link}`;
        const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        if (emailMatches) {
          emailMatches.forEach(email => emails.add(email.toLowerCase()));
        }
      }
    }
    
    return Array.from(emails);
  } catch (error) {
    console.log(`[THEHARVESTER] Google search error: ${error.message}`);
    return [];
  }
}

/**
 * Search Bing for emails
 * @param {String} query - Search query
 * @returns {Promise<Array<String>>} Found emails
 */
async function searchBingForEmails(query) {
  if (!process.env.BING_WEB_SEARCH_API_KEY) {
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
      throw new Error(`Bing API error: ${response.status}`);
    }
    
    const data = await response.json();
    const emails = new Set();
    
    // Extract emails from search results
    if (data.webPages && data.webPages.value) {
      for (const page of data.webPages.value) {
        const text = `${page.name} ${page.snippet} ${page.url}`;
        const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        if (emailMatches) {
          emailMatches.forEach(email => emails.add(email.toLowerCase()));
        }
      }
    }
    
    return Array.from(emails);
  } catch (error) {
    console.log(`[THEHARVESTER] Bing search error: ${error.message}`);
    return [];
  }
}

/**
 * Extract emails from company contact page
 * @param {String} domain - Company domain
 * @returns {Promise<Array<String>>} Found emails
 */
async function extractEmailsFromContactPage(domain) {
  const emails = new Set();
  const contactUrls = [
    `https://${domain}/contact`,
    `https://${domain}/contact-us`,
    `https://${domain}/get-in-touch`,
    `https://www.${domain}/contact`,
    `https://www.${domain}/contact-us`
  ];
  
  for (const url of contactUrls.slice(0, 2)) { // Limit to 2 URLs
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const html = await response.text();
        const emailMatches = html.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        if (emailMatches) {
          emailMatches.forEach(email => {
            const emailLower = email.toLowerCase();
            // Filter out common non-person emails
            if (!emailLower.includes('noreply') && 
                !emailLower.includes('no-reply') &&
                !emailLower.includes('donotreply')) {
              emails.add(emailLower);
            }
          });
        }
      }
    } catch (error) {
      // Continue to next URL
    }
  }
  
  return Array.from(emails);
}

