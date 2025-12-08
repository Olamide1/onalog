/**
 * Multi-page crawler for decision maker extraction
 * Crawls team/about/leadership pages to find decision makers
 */

import * as cheerio from 'cheerio';

/**
 * Discover relevant pages for decision maker extraction
 * @param {String} baseUrl - Base website URL
 * @param {String} html - HTML content of the homepage
 * @returns {Array<String>} Array of URLs to crawl
 */
export async function discoverTeamPages(baseUrl, html) {
  if (!baseUrl || !html) return [];
  
  const $ = cheerio.load(html);
  const teamPages = new Set();
  
  try {
    const urlObj = new URL(baseUrl);
    const baseOrigin = `${urlObj.protocol}//${urlObj.host}`;
    
    // Common team page paths
    const teamPathPatterns = [
      '/about', '/team', '/leadership', '/management', '/founders',
      '/executives', '/staff', '/people', '/directors', '/board',
      '/contact', '/who-we-are', '/our-team', '/meet-the-team'
    ];
    
    // Check sitemap.xml if available
    try {
      const sitemapUrl = `${baseOrigin}/sitemap.xml`;
      const sitemapResponse = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      });
      if (sitemapResponse.ok) {
        const sitemapText = await sitemapResponse.text();
        const sitemapUrls = sitemapText.match(/<loc>(.*?)<\/loc>/g) || [];
        for (const locTag of sitemapUrls) {
          const url = locTag.replace(/<\/?loc>/g, '');
          const urlLower = url.toLowerCase();
          if (teamPathPatterns.some(pattern => urlLower.includes(pattern))) {
            teamPages.add(url);
          }
        }
      }
    } catch (e) {
      // Sitemap not available or error - continue
    }
    
    // Find links in navigation and footer
    const linkSelectors = [
      'nav a', 'footer a', '.navigation a', '.menu a',
      '.header a', '[role="navigation"] a'
    ];
    
    for (const selector of linkSelectors) {
      $(selector).each((i, elem) => {
        const href = $(elem).attr('href');
        if (!href) return;
        
        const hrefLower = href.toLowerCase();
        const linkText = $(elem).text().toLowerCase();
        
        // Check if link text or href contains team-related keywords
        const teamKeywords = ['team', 'about', 'leadership', 'management', 'founder', 'executive', 'staff', 'people', 'contact', 'who we are'];
        const isTeamLink = teamKeywords.some(keyword => 
          hrefLower.includes(keyword) || linkText.includes(keyword)
        );
        
        if (isTeamLink) {
          try {
            const fullUrl = new URL(href, baseOrigin).href;
            teamPages.add(fullUrl);
          } catch (e) {
            // Invalid URL - skip
          }
        }
      });
    }
    
    // Also check for direct paths
    for (const path of teamPathPatterns) {
      try {
        const fullUrl = `${baseOrigin}${path}`;
        teamPages.add(fullUrl);
      } catch (e) {
        // Skip invalid URLs
      }
    }
    
    // Limit to top 10 pages to avoid too many requests
    return Array.from(teamPages).slice(0, 10);
  } catch (error) {
    console.log(`[CRAWLER] Error discovering team pages: ${error.message}`);
    return [];
  }
}

/**
 * Crawl a single page and extract decision makers
 * @param {String} url - URL to crawl
 * @param {Function} extractDecisionMakersFn - Function to extract decision makers from HTML
 * @returns {Array} Array of decision makers found on this page
 */
export async function crawlPage(url, extractDecisionMakersFn) {
  try {
    console.log(`[CRAWLER] Crawling: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`[CRAWLER] Failed to fetch ${url}: HTTP ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract decision makers using the provided function
    const decisionMakers = extractDecisionMakersFn($, url);
    
    console.log(`[CRAWLER] Found ${decisionMakers.length} decision makers on ${url}`);
    return decisionMakers;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`[CRAWLER] Timeout crawling ${url}`);
    } else {
      console.log(`[CRAWLER] Error crawling ${url}: ${error.message}`);
    }
    return [];
  }
}

/**
 * Crawl multiple pages and aggregate decision makers
 * @param {String} baseUrl - Base website URL
 * @param {String} homepageHtml - HTML content of homepage
 * @param {Function} extractDecisionMakersFn - Function to extract decision makers
 * @param {Number} maxPages - Maximum number of pages to crawl (default: 5)
 * @returns {Promise<Array>} Aggregated decision makers from all pages
 */
export async function crawlTeamPages(baseUrl, homepageHtml, extractDecisionMakersFn, maxPages = 5) {
  const allDecisionMakers = [];
  const seen = new Set();
  
  try {
    // Discover team pages
    const teamPages = await discoverTeamPages(baseUrl, homepageHtml);
    console.log(`[CRAWLER] Discovered ${teamPages.length} team pages`);
    
    // Limit pages to crawl
    const pagesToCrawl = teamPages.slice(0, maxPages);
    
    // Crawl pages in parallel (but limit concurrency)
    const crawlPromises = pagesToCrawl.map(url => crawlPage(url, extractDecisionMakersFn));
    const results = await Promise.allSettled(crawlPromises);
    
    // Aggregate results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const dm of result.value) {
          const key = `${dm.name?.toLowerCase()}-${dm.title?.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            allDecisionMakers.push(dm);
          }
        }
      }
    }
    
    console.log(`[CRAWLER] Total unique decision makers found: ${allDecisionMakers.length}`);
    return allDecisionMakers;
  } catch (error) {
    console.log(`[CRAWLER] Error in multi-page crawl: ${error.message}`);
    return allDecisionMakers; // Return what we found so far
  }
}

