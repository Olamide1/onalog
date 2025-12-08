/**
 * Email pattern discovery and generation
 * Analyzes existing emails on a website to discover patterns
 * Then generates emails for decision makers using those patterns
 */

/**
 * Discover email patterns from a list of emails
 * @param {Array<String>} emails - Array of email addresses
 * @param {String} domain - Company domain
 * @returns {Object} Pattern information
 */
export function discoverEmailPattern(emails, domain) {
  if (!emails || emails.length === 0 || !domain) {
    return null;
  }
  
  const patterns = {
    firstLast: 0,      // john.smith@domain.com
    firstLastInitial: 0, // john.s@domain.com
    firstInitialLast: 0, // j.smith@domain.com
    firstInitialLastInitial: 0, // j.s@domain.com
    firstLastHyphen: 0, // john-smith@domain.com
    firstLastUnderscore: 0, // john_smith@domain.com
    firstOnly: 0,      // john@domain.com
    lastOnly: 0,       // smith@domain.com
    firstDotLast: 0,   // john.smith@domain.com (same as firstLast)
    lastDotFirst: 0    // smith.john@domain.com
  };
  
  for (const email of emails) {
    if (!email || !email.includes('@')) continue;
    
    const localPart = email.split('@')[0].toLowerCase();
    const parts = localPart.split(/[._-]/);
    
    if (parts.length === 2) {
      const [first, last] = parts;
      
      // Check pattern type
      if (first.length > 1 && last.length > 1) {
        patterns.firstLast++;
      } else if (first.length > 1 && last.length === 1) {
        patterns.firstLastInitial++;
      } else if (first.length === 1 && last.length > 1) {
        patterns.firstInitialLast++;
      } else if (first.length === 1 && last.length === 1) {
        patterns.firstInitialLastInitial++;
      }
      
      // Check separator
      if (localPart.includes('-')) {
        patterns.firstLastHyphen++;
      } else if (localPart.includes('_')) {
        patterns.firstLastUnderscore++;
      } else {
        patterns.firstDotLast++;
      }
    } else if (parts.length === 1) {
      // Single part - could be first or last name
      // We can't determine without more context, but we'll count it
      if (localPart.length < 5) {
        patterns.firstOnly++;
      } else {
        patterns.lastOnly++;
      }
    }
  }
  
  // Find the most common pattern
  const maxPattern = Object.entries(patterns).reduce((a, b) => 
    patterns[a[0]] > patterns[b[0]] ? a : b
  );
  
  if (maxPattern[1] === 0) {
    return null; // No clear pattern
  }
  
  // Determine separator
  let separator = '.';
  if (patterns.firstLastHyphen > patterns.firstDotLast) {
    separator = '-';
  } else if (patterns.firstLastUnderscore > patterns.firstDotLast) {
    separator = '_';
  }
  
  // Determine format
  let format = 'first.last';
  if (maxPattern[0] === 'firstLast') {
    format = `first${separator}last`;
  } else if (maxPattern[0] === 'firstLastInitial') {
    format = `first${separator}lastInitial`;
  } else if (maxPattern[0] === 'firstInitialLast') {
    format = `firstInitial${separator}last`;
  } else if (maxPattern[0] === 'firstInitialLastInitial') {
    format = `firstInitial${separator}lastInitial`;
  } else if (maxPattern[0] === 'firstOnly') {
    format = 'first';
  } else if (maxPattern[0] === 'lastOnly') {
    format = 'last';
  }
  
  return {
    format,
    separator,
    confidence: maxPattern[1] / emails.length,
    sampleCount: maxPattern[1]
  };
}

/**
 * Generate email from name using discovered pattern
 * @param {String} name - Person's full name
 * @param {Object} pattern - Email pattern object
 * @param {String} domain - Company domain
 * @returns {String|null} Generated email address
 */
export function generateEmailFromPattern(name, pattern, domain) {
  if (!name || !pattern || !domain) return null;
  
  // Normalize name
  const nameParts = name.trim().toLowerCase().split(/\s+/);
  if (nameParts.length < 2) return null;
  
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  const firstInitial = firstName[0];
  const lastInitial = lastName[0];
  
  let localPart = '';
  
  switch (pattern.format) {
    case 'first.last':
    case 'first-last':
    case 'first_last':
      localPart = `${firstName}${pattern.separator}${lastName}`;
      break;
      
    case 'first.lastInitial':
    case 'first-lastInitial':
    case 'first_lastInitial':
      localPart = `${firstName}${pattern.separator}${lastInitial}`;
      break;
      
    case 'firstInitial.last':
    case 'firstInitial-last':
    case 'firstInitial_last':
      localPart = `${firstInitial}${pattern.separator}${lastName}`;
      break;
      
    case 'firstInitial.lastInitial':
    case 'firstInitial-lastInitial':
    case 'firstInitial_lastInitial':
      localPart = `${firstInitial}${pattern.separator}${lastInitial}`;
      break;
      
    case 'first':
      localPart = firstName;
      break;
      
    case 'last':
      localPart = lastName;
      break;
      
    default:
      // Default to first.last
      localPart = `${firstName}${pattern.separator}${lastName}`;
  }
  
  // Clean up local part (remove special chars, handle multiple separators)
  localPart = localPart
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, pattern.separator)
    .toLowerCase();
  
  return `${localPart}@${domain}`;
}

/**
 * Extract domain from URL
 * @param {String} url - Website URL
 * @returns {String|null} Domain name
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return null;
  }
}

