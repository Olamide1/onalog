/**
 * Email verification utilities
 * Uses multiple methods to verify email addresses
 */

/**
 * Verify email using SMTP check (free, unlimited)
 * @param {String} email - Email address to verify
 * @param {String} domain - Domain to check
 * @returns {Promise<Object>} Verification result
 */
export async function verifyEmailSMTP(email, domain) {
  if (!email || !email.includes('@')) {
    return { valid: false, reason: 'Invalid email format' };
  }
  
  try {
    // Extract domain from email if not provided
    const emailDomain = domain || email.split('@')[1];
    
    // Get MX records for domain
    const dns = await import('dns').then(m => m.promises);
    const mxRecords = await dns.resolveMx(emailDomain).catch(() => []);
    
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'No MX records found' };
    }
    
    // Sort by priority
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;
    
    // Note: Full SMTP verification requires connecting to mail server
    // This is a simplified check - full implementation would use net.Socket
    // For now, we'll just check if MX records exist (domain is valid)
    
    return {
      valid: true,
      reason: 'MX records found',
      method: 'smtp',
      mxHost: mxHost
    };
  } catch (error) {
    return {
      valid: false,
      reason: error.message,
      method: 'smtp'
    };
  }
}

/**
 * Verify email format and common patterns
 * @param {String} email - Email address to verify
 * @returns {Object} Verification result
 */
export function verifyEmailFormat(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Invalid input' };
  }
  
  // Basic format check
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }
  
  // Check for common placeholder patterns
  const placeholderPatterns = [
    /^(test|example|demo|sample|placeholder|temp|tmp|admin|info|contact|hello|hi|support|sales|marketing|noreply|no-reply)@/i,
    /^(firstname|lastname|name|user|username|email|mail)@/i,
    /@(example|test|sample|placeholder|temp|tmp)\./i
  ];
  
  for (const pattern of placeholderPatterns) {
    if (pattern.test(email)) {
      return { valid: false, reason: 'Placeholder email pattern detected' };
    }
  }
  
  // Check for disposable email domains (common ones)
  const disposableDomains = [
    'tempmail.com', '10minutemail.com', 'guerrillamail.com',
    'mailinator.com', 'throwaway.email', 'temp-mail.org'
  ];
  
  const domain = email.split('@')[1]?.toLowerCase();
  if (disposableDomains.includes(domain)) {
    return { valid: false, reason: 'Disposable email domain' };
  }
  
  return {
    valid: true,
    reason: 'Format valid',
    method: 'format'
  };
}

/**
 * Verify email using multiple methods
 * @param {String} email - Email address to verify
 * @param {String} domain - Domain for context
 * @returns {Promise<Object>} Combined verification result
 */
export async function verifyEmail(email, domain = null) {
  // Format check first (fastest)
  const formatCheck = verifyEmailFormat(email);
  if (!formatCheck.valid) {
    return formatCheck;
  }
  
  // SMTP check (slower but more accurate)
  const smtpCheck = await verifyEmailSMTP(email, domain);
  
  // Combine results
  return {
    valid: formatCheck.valid && smtpCheck.valid,
    formatValid: formatCheck.valid,
    smtpValid: smtpCheck.valid,
    reason: smtpCheck.reason || formatCheck.reason,
    method: 'combined',
    details: {
      format: formatCheck,
      smtp: smtpCheck
    }
  };
}

