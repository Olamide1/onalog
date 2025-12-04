/**
 * Hiring signal detection
 * Detects if a company is hiring based on various signals
 */

/**
 * Check if company has a careers/jobs page
 * @param {String} website - Company website URL
 * @returns {Promise<Boolean>} True if careers page exists
 */
export async function checkCareersPage(website, overallTimeoutMs = 10000) {
  if (!website) return false;
  
  try {
    const baseUrl = new URL(website);
    const careersPaths = [
      '/careers',
      '/jobs',
      '/job',
      '/career',
      '/hiring',
      '/join-us',
      '/join-our-team',
      '/we-are-hiring',
      '/open-positions',
      '/vacancies',
      '/opportunities'
    ];
    
    const startTime = Date.now();
    const maxDuration = overallTimeoutMs; // Overall timeout (10s default)
    const perPathTimeout = Math.min(2000, maxDuration / careersPaths.length); // 2s per path max, but respect overall timeout
    
    // Check if any careers path exists
    for (const path of careersPaths) {
      // Check overall timeout
      if (Date.now() - startTime > maxDuration) {
        console.log(`[HIRING_SIGNALS] Overall timeout (${maxDuration}ms) reached for careers page check`);
        break;
      }
      
      try {
        const careersUrl = new URL(path, baseUrl.origin).href;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), perPathTimeout);
        
        const response = await fetch(careersUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: controller.signal,
          redirect: 'follow'
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok && response.status === 200) {
          return true;
        }
      } catch (e) {
        // Continue to next path
        continue;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check for hiring keywords in website content
 * @param {String} html - Website HTML content
 * @returns {Boolean} True if hiring keywords found
 */
export function detectHiringKeywords(html) {
  if (!html) return false;
  
  const hiringKeywords = [
    /we['']re\s+hiring/i,
    /now\s+hiring/i,
    /join\s+our\s+team/i,
    /open\s+positions/i,
    /job\s+openings/i,
    /career\s+opportunities/i,
    /we\s+are\s+hiring/i,
    /come\s+work\s+with\s+us/i,
    /open\s+roles/i,
    /vacancies/i,
    /apply\s+now/i
  ];
  
  return hiringKeywords.some(pattern => pattern.test(html));
}

/**
 * Detect hiring signals from multiple sources
 * @param {Object} leadData - Lead data object
 * @returns {Promise<Object>} Hiring signals object
 */
export async function detectHiringSignals(leadData) {
  const signals = {
    isHiring: false,
    hasCareersPage: false,
    hasJobPostings: false,
    detectedAt: new Date()
  };
  
  if (!leadData.website) {
    return signals;
  }
  
  try {
    // Check for careers page with overall timeout (10 seconds max)
    const overallTimeout = 10000; // 10 seconds total
    signals.hasCareersPage = await checkCareersPage(leadData.website, overallTimeout);
    
    // If we have HTML content, check for hiring keywords (fast, no timeout needed)
    if (leadData.aboutText) {
      const hasKeywords = detectHiringKeywords(leadData.aboutText);
      if (hasKeywords) {
        signals.hasJobPostings = true;
      }
    }
    
    // Company is hiring if they have careers page or job postings
    signals.isHiring = signals.hasCareersPage || signals.hasJobPostings;
    
    return signals;
  } catch (error) {
    console.log(`[HIRING_SIGNALS] Error detecting hiring signals: ${error.message}`);
    return signals;
  }
}
