/**
 * Email Signature Parser
 * Extracts decision maker information from email signatures
 */

/**
 * Parse email signature for name and title
 * @param {String} emailBody - Email body text
 * @param {String} emailAddress - Email address
 * @returns {Object|null} Decision maker object or null
 */
export function parseEmailSignature(emailBody, emailAddress) {
  if (!emailBody || !emailAddress) return null;
  
  // Common signature patterns
  const signaturePatterns = [
    // "Best regards, John Smith, CEO"
    /(?:best\s+regards|sincerely|thanks|thank\s+you|cheers|warm\s+regards)[,\s]+([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)[,\s]+(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/i,
    // "John Smith\nCEO\nCompany Name"
    /([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s*\n\s*(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/i,
    // "--\nJohn Smith\nCEO"
    /--\s*\n\s*([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s*\n\s*(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/i
  ];
  
  for (const pattern of signaturePatterns) {
    const match = emailBody.match(pattern);
    if (match) {
      const name = match[1]?.trim();
      const title = match[2]?.trim() || match[0].match(/(?:CEO|CTO|CFO|Founder|Director|Manager|President|Owner|Head|Lead|VP|Vice President|Chief|Executive)/i)?.[0];
      
      if (name && name.length >= 3 && name.length <= 50) {
        return {
          name: name,
          title: title || 'Executive',
          email: emailAddress,
          source: 'email_signature',
          confidence: 0.9
        };
      }
    }
  }
  
  // Fallback: Extract name from email address if it looks like a person name
  const emailLocal = emailAddress.split('@')[0];
  const nameFromEmail = emailLocal.split(/[._-]/).map(part => 
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join(' ');
  
  if (nameFromEmail && nameFromEmail.split(' ').length >= 2 && nameFromEmail.length <= 50) {
    return {
      name: nameFromEmail,
      title: null,
      email: emailAddress,
      source: 'email_inference',
      confidence: 0.6
    };
  }
  
  return null;
}

