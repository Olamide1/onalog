/**
 * Email verification and deliverability scoring service
 * Provides free syntax validation and optional paid API integration
 */

/**
 * Validate email syntax (FREE - no API costs)
 * @param {String} email - Email address to validate
 * @returns {Object} Validation result
 */
function validateEmailSyntax(email) {
  if (!email || typeof email !== 'string') {
    return {
      valid: false,
      score: 0,
      status: 'invalid',
      reason: 'Invalid input'
    };
  }

  const emailLower = email.toLowerCase().trim();
  
  // Basic email regex pattern
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  // Check basic format
  if (!emailRegex.test(emailLower)) {
    return {
      valid: false,
      score: 0,
      status: 'invalid',
      reason: 'Invalid email format',
      method: 'syntax'
    };
  }

  // Check for common invalid patterns
  const invalidPatterns = [
    /^test@/i,
    /^example@/i,
    /^noreply@/i,
    /^no-reply@/i,
    /^donotreply@/i,
    /^mailer-daemon@/i,
    /^postmaster@/i,
    /^abuse@/i,
    /^webmaster@/i,
    /^admin@/i,
    /^contact@/i,
    /^info@/i,
    /^hello@/i,
    /^hi@/i,
    /@example\.com$/i,
    /@test\.com$/i,
    /@localhost$/i,
    /@domain\.com$/i,
    /@yourdomain\.com$/i,
    /@company\.com$/i
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(emailLower)) {
      return {
        valid: false,
        score: 20,
        status: 'risky',
        reason: 'Generic or placeholder email',
        method: 'syntax'
      };
    }
  }

  // Check for disposable email domains (common ones)
  const disposableDomains = [
    'tempmail.com',
    '10minutemail.com',
    'guerrillamail.com',
    'mailinator.com',
    'throwaway.email',
    'temp-mail.org',
    'yopmail.com',
    'getnada.com'
  ];

  const domain = emailLower.split('@')[1];
  if (disposableDomains.some(d => domain.includes(d))) {
    return {
      valid: false,
      score: 10,
      status: 'risky',
      reason: 'Disposable email domain',
      method: 'syntax'
    };
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /^[0-9]+@/, // Starts with numbers only
    /^[a-z]+\d+@/, // Only letters and numbers (no dots)
    /\.{2,}/, // Multiple consecutive dots
    /@{2,}/, // Multiple @ symbols
    /^\./, // Starts with dot
    /\.$/, // Ends with dot
    /@\./, // @ followed by dot
    /\.@/ // Dot followed by @
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(emailLower)) {
      return {
        valid: false,
        score: 30,
        status: 'risky',
        reason: 'Suspicious email pattern',
        method: 'syntax'
      };
    }
  }

  // Calculate score based on email quality indicators
  let score = 70; // Base score for syntactically valid emails
  
  // Bonus points for professional patterns
  if (emailLower.match(/^[a-z]+\.[a-z]+@/)) {
    score += 10; // firstname.lastname pattern
  }
  
  if (emailLower.match(/^[a-z]\.[a-z]+@/)) {
    score += 5; // f.lastname pattern
  }

  // Check domain quality
  const domainParts = domain.split('.');
  if (domainParts.length >= 2) {
    const tld = domainParts[domainParts.length - 1];
    const commonTlds = ['com', 'org', 'net', 'co', 'io', 'ai', 'tech', 'app'];
    if (commonTlds.includes(tld)) {
      score += 5;
    }
  }

  // Penalty for very long emails (often spam)
  if (emailLower.length > 50) {
    score -= 10;
  }

  // Penalty for very short emails (often invalid)
  if (emailLower.length < 10) {
    score -= 5;
  }

  // Cap score between 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine status based on score
  let status = 'unknown';
  if (score >= 80) {
    status = 'valid';
  } else if (score >= 50) {
    status = 'risky';
  } else {
    status = 'invalid';
  }

  return {
    valid: score >= 50,
    score: score,
    status: status,
    reason: score >= 80 ? 'Valid email format' : 'Needs verification',
    method: 'syntax'
  };
}

/**
 * Verify email using paid API (optional - requires API key)
 * Falls back to syntax validation if API is not configured
 * @param {String} email - Email address to verify
 * @returns {Promise<Object>} Verification result
 */
async function verifyEmailWithAPI(email) {
  // Check if NeverBounce API is configured
  const neverBounceApiKey = process.env.NEVERBOUNCE_API_KEY;
  
  if (!neverBounceApiKey) {
    // Fall back to syntax validation
    return validateEmailSyntax(email);
  }

  try {
    // NeverBounce API integration
    const response = await fetch('https://api.neverbounce.com/v4/single/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${neverBounceApiKey}`
      },
      body: JSON.stringify({
        email: email,
        credit_info: false
      })
    });

    if (!response.ok) {
      throw new Error(`NeverBounce API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Map NeverBounce result to our format
    const result = data.result;
    let status = 'unknown';
    let score = 50;
    let valid = false;

    switch (result) {
      case 'valid':
        status = 'valid';
        score = 95;
        valid = true;
        break;
      case 'invalid':
        status = 'invalid';
        score = 0;
        valid = false;
        break;
      case 'disposable':
        status = 'risky';
        score = 20;
        valid = false;
        break;
      case 'catchall':
        status = 'risky';
        score = 60;
        valid = true; // Catchall can be valid, but risky
        break;
      case 'unknown':
      default:
        status = 'unknown';
        score = 50;
        valid = false;
        break;
    }

    return {
      valid: valid,
      score: score,
      status: status,
      reason: `NeverBounce: ${result}`,
      method: 'api'
    };

  } catch (error) {
    console.log(`[EMAIL_VERIFIER] ⚠️  API verification failed: ${error.message}, falling back to syntax validation`);
    // Fall back to syntax validation on API error
    return validateEmailSyntax(email);
  }
}

/**
 * Verify a single email address
 * Uses free syntax validation by default, optional API for production
 * @param {String} email - Email address to verify
 * @param {Boolean} useAPI - Whether to use paid API (default: false, uses syntax validation)
 * @returns {Promise<Object>} Verification result with deliverability score
 */
export async function verifyEmail(email, useAPI = false) {
  if (!email || typeof email !== 'string') {
    return {
      valid: false,
      score: 0,
      status: 'invalid',
      reason: 'Invalid input',
      method: 'unknown',
      checkedAt: new Date()
    };
  }

  try {
    const result = useAPI 
      ? await verifyEmailWithAPI(email)
      : validateEmailSyntax(email);

    return {
      ...result,
      checkedAt: new Date()
    };
  } catch (error) {
    console.error(`[EMAIL_VERIFIER] ❌ Verification error for ${email}:`, error.message);
    // Return safe default on error
    return {
      valid: false,
      score: 0,
      status: 'unknown',
      reason: 'Verification error',
      method: 'unknown',
      checkedAt: new Date()
    };
  }
}

/**
 * Verify multiple email addresses
 * @param {Array} emails - Array of email objects or strings
 * @param {Boolean} useAPI - Whether to use paid API
 * @returns {Promise<Array>} Array of verified emails with deliverability data
 */
export async function verifyEmails(emails, useAPI = false) {
  if (!Array.isArray(emails) || emails.length === 0) {
    return [];
  }

  try {
    // Process emails in parallel (but respect rate limits)
    const verificationPromises = emails.map(async (emailObj) => {
      const email = typeof emailObj === 'string' ? emailObj : emailObj.email;
      if (!email) return null;

      const verification = await verifyEmail(email, useAPI);
      
      // Return email object with deliverability data
      if (typeof emailObj === 'string') {
        return {
          email: email,
          deliverability: verification
        };
      } else {
        return {
          ...emailObj,
          deliverability: verification
        };
      }
    });

    const results = await Promise.all(verificationPromises);
    
    // Filter out null results and invalid emails (optional - you might want to keep them)
    return results.filter(result => result !== null);
    
  } catch (error) {
    console.error(`[EMAIL_VERIFIER] ❌ Batch verification error:`, error.message);
    // Return original emails with unknown deliverability on error
    return emails.map(emailObj => {
      const email = typeof emailObj === 'string' ? emailObj : emailObj.email;
      return {
        ...(typeof emailObj === 'string' ? {} : emailObj),
        email: email,
        deliverability: {
          valid: false,
          score: 0,
          status: 'unknown',
          reason: 'Verification error',
          method: 'unknown',
          checkedAt: new Date()
        }
      };
    });
  }
}

/**
 * Filter emails by deliverability score
 * @param {Array} emails - Array of email objects with deliverability data
 * @param {Number} minScore - Minimum deliverability score (default: 50)
 * @returns {Array} Filtered emails
 */
export function filterEmailsByDeliverability(emails, minScore = 50) {
  if (!Array.isArray(emails)) {
    return [];
  }

  return emails.filter(email => {
    const deliverability = email.deliverability || email.deliverability;
    if (!deliverability) return true; // Keep emails without deliverability data
    
    return deliverability.score >= minScore && deliverability.status !== 'invalid';
  });
}

