import * as cheerio from 'cheerio';

/**
 * Extract contact information from a website
 */
export async function extractContactInfo(url) {
  try {
    // Use AbortController for timeout (Node.js 18+)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract emails
    const emails = extractEmails(html, url);
    
    // Extract phone numbers
    const phoneNumbers = extractPhoneNumbers(html, url);
    
    // Extract WhatsApp links
    const whatsappLinks = extractWhatsAppLinks(html, url);
    
    // Extract social media links
    const socials = extractSocialLinks($, url);
    
    // Extract address
    const address = extractAddress($);
    
    // Extract about text
    const aboutText = extractAboutText($);
    
    // Extract category signals
    const categorySignals = extractCategorySignals($);
    
    // Extract company name
    const companyName = extractCompanyName($, url);
    
    return {
      companyName,
      emails,
      phoneNumbers,
      whatsappLinks,
      socials,
      address,
      aboutText,
      categorySignals
    };
    
  } catch (error) {
    console.error(`❌ Extraction error for ${url}:`, error.message);
    return {
      companyName: null,
      emails: [],
      phoneNumbers: [],
      whatsappLinks: [],
      socials: {},
      address: null,
      aboutText: null,
      categorySignals: []
    };
  }
}

/**
 * Extract email addresses from HTML
 */
function extractEmails(html, baseUrl) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(emailRegex) || [];
  
  // Filter out common false positives
  const filtered = matches.filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes('example.com') &&
           !lower.includes('test@') &&
           !lower.includes('placeholder') &&
           !lower.includes('your-email');
  });
  
  // Remove duplicates and add source
  const unique = [...new Set(filtered)];
  return unique.map(email => ({
    email: email.toLowerCase(),
    source: 'website',
    confidence: 0.8
  }));
}

/**
 * Extract phone numbers from HTML
 */
function extractPhoneNumbers(html, baseUrl) {
  // Common phone patterns
  const patterns = [
    /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    /\+?\d{10,15}/g
  ];
  
  const matches = [];
  patterns.forEach(pattern => {
    const found = html.match(pattern) || [];
    matches.push(...found);
  });
  
  // Clean and format
  const cleaned = matches
    .map(phone => phone.replace(/[^\d+]/g, ''))
    .filter(phone => phone.length >= 10 && phone.length <= 15)
    .filter((phone, index, self) => self.indexOf(phone) === index);
  
  return cleaned.map(phone => ({
    phone,
    country: detectCountry(phone),
    formatted: formatPhone(phone),
    source: 'website',
    confidence: 0.7
  }));
}

/**
 * Extract WhatsApp links
 */
function extractWhatsAppLinks(html, baseUrl) {
  const whatsappRegex = /https?:\/\/wa\.me\/[\d+]+|https?:\/\/api\.whatsapp\.com\/send\?phone=[\d+]+/gi;
  const matches = html.match(whatsappRegex) || [];
  return [...new Set(matches)];
}

/**
 * Extract social media links
 */
function extractSocialLinks($, baseUrl) {
  const socials = {
    linkedin: null,
    twitter: null,
    facebook: null,
    instagram: null
  };
  
  // Find all links
  $('a[href]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (!href) return;
    
    const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
    
    if (fullUrl.includes('linkedin.com')) {
      socials.linkedin = fullUrl;
    } else if (fullUrl.includes('twitter.com') || fullUrl.includes('x.com')) {
      socials.twitter = fullUrl;
    } else if (fullUrl.includes('facebook.com')) {
      socials.facebook = fullUrl;
    } else if (fullUrl.includes('instagram.com')) {
      socials.instagram = fullUrl;
    }
  });
  
  return socials;
}

/**
 * Extract address information
 */
function extractAddress($) {
  // Look for common address patterns
  const addressSelectors = [
    '[itemprop="address"]',
    '.address',
    '#address',
    '[class*="address"]'
  ];
  
  for (const selector of addressSelectors) {
    const elem = $(selector).first();
    if (elem.length) {
      return elem.text().trim();
    }
  }
  
  return null;
}

/**
 * Extract about/description text
 */
function extractAboutText($) {
  const selectors = [
    'meta[name="description"]',
    '[itemprop="description"]',
    '.about',
    '#about',
    '[class*="about"]'
  ];
  
  for (const selector of selectors) {
    const elem = $(selector).first();
    if (elem.length) {
      return elem.attr('content') || elem.text().trim();
    }
  }
  
  // Fallback to first paragraph
  const firstP = $('p').first();
  if (firstP.length) {
    return firstP.text().trim().substring(0, 500);
  }
  
  return null;
}

/**
 * Extract category/business type signals
 */
function extractCategorySignals($) {
  const signals = [];
  
  // Look for keywords in meta tags, headings, and content
  const text = $('body').text().toLowerCase();
  const keywords = [
    'manufacturing', 'retail', 'wholesale', 'distribution',
    'services', 'consulting', 'technology', 'software',
    'logistics', 'transport', 'agriculture', 'mining',
    'construction', 'real estate', 'finance', 'banking'
  ];
  
  keywords.forEach(keyword => {
    if (text.includes(keyword)) {
      signals.push(keyword);
    }
  });
  
  return signals;
}

/**
 * Extract company name
 */
function extractCompanyName($, url) {
  // Try meta tags first
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) return ogTitle.trim();
  
  const title = $('title').text();
  if (title) {
    // Clean up title (remove common suffixes)
    return title.replace(/\s*[-|]\s*.*$/, '').trim();
  }
  
  // Fallback to domain name
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  } catch {
    return 'Unknown Company';
  }
}

/**
 * Detect country from phone number
 */
function detectCountry(phone) {
  if (phone.startsWith('+234')) return 'NG'; // Nigeria
  if (phone.startsWith('+27')) return 'ZA'; // South Africa
  if (phone.startsWith('+254')) return 'KE'; // Kenya
  if (phone.startsWith('+233')) return 'GH'; // Ghana
  if (phone.startsWith('+256')) return 'UG'; // Uganda
  return 'Unknown';
}

/**
 * Format phone number
 */
function formatPhone(phone) {
  // Basic formatting - can be enhanced
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  return `+${cleaned}`;
}

