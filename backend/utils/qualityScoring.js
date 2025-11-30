/**
 * Quality scoring utility for leads
 * Calculates a 5-point quality score based on data completeness
 * 
 * Scoring criteria (1 point each):
 * 1. Company name (required)
 * 2. Website URL (required)
 * 3. Contact info (email OR phone)
 * 4. Decision maker name (at least one)
 * 5. Additional data (address OR socials OR aboutText)
 */

/**
 * Calculate quality score for a lead (0-5)
 * @param {Object} lead - Lead object with extracted data
 * @returns {Number} Quality score from 0 to 5
 */
export function calculateQualityScore(lead) {
  let score = 0;
  
  // 1. Company name (required - 1 point)
  if (lead.companyName && lead.companyName.trim().length > 0) {
    // Reject generic names
    const genericNames = ['business', 'company', 'enterprise', 'corporation', 'inc', 'llc'];
    const nameLower = lead.companyName.toLowerCase().trim();
    const isGeneric = genericNames.some(generic => nameLower.includes(generic) && nameLower.length < 20);
    
    if (!isGeneric) {
      score += 1;
    }
  }
  
  // 2. Website URL (required - 1 point)
  if (lead.website && lead.website.trim().length > 0) {
    try {
      const url = new URL(lead.website);
      if (url.hostname && url.hostname !== 'localhost' && !url.hostname.includes('example.com')) {
        score += 1;
      }
    } catch (e) {
      // Invalid URL, no point
    }
  }
  
  // 3. Contact info - email OR phone (1 point)
  const hasEmail = lead.emails && Array.isArray(lead.emails) && lead.emails.length > 0;
  const hasPhone = lead.phoneNumbers && Array.isArray(lead.phoneNumbers) && lead.phoneNumbers.length > 0;
  if (hasEmail || hasPhone) {
    score += 1;
  }
  
  // 4. Decision maker name (at least one - 1 point)
  if (lead.decisionMakers && Array.isArray(lead.decisionMakers) && lead.decisionMakers.length > 0) {
    const hasValidName = lead.decisionMakers.some(dm => 
      dm.name && dm.name.trim().length > 0 && dm.name.trim().length < 100
    );
    if (hasValidName) {
      score += 1;
    }
  }
  
  // 5. Additional data - address OR socials OR aboutText (1 point)
  const hasAddress = lead.address && lead.address.trim().length > 0;
  const hasSocials = lead.socials && (
    lead.socials.linkedin || 
    lead.socials.twitter || 
    lead.socials.facebook || 
    lead.socials.instagram
  );
  const hasAboutText = lead.aboutText && lead.aboutText.trim().length > 20; // At least 20 chars
  
  if (hasAddress || hasSocials || hasAboutText) {
    score += 1;
  }
  
  return Math.min(5, Math.max(0, score));
}

/**
 * Get quality label based on score
 * @param {Number} score - Quality score (0-5)
 * @returns {String} Quality label
 */
export function getQualityLabel(score) {
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  if (score >= 1) return 'low';
  return 'very_low';
}

