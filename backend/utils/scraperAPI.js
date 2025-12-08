/**
 * ScraperAPI integration
 * Free tier: 5,000 requests/month
 * Handles proxy rotation, CAPTCHA solving, and JavaScript rendering
 */

/**
 * Scrape a URL using ScraperAPI
 * @param {String} url - URL to scrape
 * @param {Object} options - Additional options
 * @returns {Promise<String>} HTML content
 */
export async function scrapeWithScraperAPI(url, options = {}) {
  if (!process.env.SCRAPERAPI_API_KEY) {
    // Fallback to regular fetch if API key not configured
    console.log('[SCRAPERAPI] API key not configured, using regular fetch');
    return await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    }).then(r => r.text());
  }
  
  try {
    const apiKey = process.env.SCRAPERAPI_API_KEY;
    const {
      render = false, // Set to true for JavaScript rendering
      country = 'us', // Country code for proxy
      premium = false, // Use premium proxies
      session = null // Session number for maintaining cookies
    } = options;
    
    // Build API URL
    let apiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}`;
    
    if (render) {
      apiUrl += '&render=true';
    }
    
    if (country) {
      apiUrl += `&country_code=${country}`;
    }
    
    if (premium) {
      apiUrl += '&premium=true';
    }
    
    if (session) {
      apiUrl += `&session_number=${session}`;
    }
    
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(15000) // 15-second timeout (fail faster to use regular fetch)
    });
    
    if (!response.ok) {
      throw new Error(`ScraperAPI error: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Check if we hit rate limit
    if (html.includes('rate limit') || html.includes('quota exceeded')) {
      throw new Error('ScraperAPI rate limit exceeded');
    }
    
    return html;
  } catch (error) {
    console.log(`[SCRAPERAPI] Error scraping ${url}: ${error.message}`);
    throw error;
  }
}

/**
 * Check remaining ScraperAPI credits
 * @returns {Promise<Object>} Account info with remaining credits
 */
export async function checkScraperAPICredits() {
  if (!process.env.SCRAPERAPI_API_KEY) {
    return { remaining: 0, error: 'API key not configured' };
  }
  
  try {
    const apiKey = process.env.SCRAPERAPI_API_KEY;
    const response = await fetch(`https://api.scraperapi.com/account?api_key=${apiKey}`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        remaining: data.remaining_requests || 0,
        total: data.request_count || 0,
        limit: data.request_limit || 5000
      };
    }
    
    return { remaining: 0, error: 'Unable to fetch account info' };
  } catch (error) {
    console.log(`[SCRAPERAPI] Error checking credits: ${error.message}`);
    return { remaining: 0, error: error.message };
  }
}

