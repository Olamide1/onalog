/**
 * Verification scoring utility for enriched leads
 * Calculates a 5-point verification score based on data cross-validation
 * 
 * Scoring criteria (1 point each):
 * 1. Company name matches across sources (website, LinkedIn, search)
 * 2. LinkedIn company page exists and is accessible
 * 3. Decision maker names found on website match LinkedIn suggestions
 * 4. Email pattern verified (domain matches website)
 * 5. Additional signals (employee count, location, industry consistency)
 */

/**
 * Calculate verification score for an enriched lead (0-5)
 * @param {Object} lead - Lead object with extraction and enrichment data
 * @returns {Object} { score: Number (0-5), sources: Array<String> }
 */
export function calculateVerificationScore(lead) {
  let score = 0;
  const sources = [];
  
  // 1. Company name consistency (1 point)
  // Check if company name is consistent across sources
  const companyName = lead.companyName || '';
  const enrichmentIndustry = lead.enrichment?.industry || '';
  const linkedinCompanyUrl = lead.enrichment?.linkedinContacts?.linkedinCompanyUrl;
  
  // If we have LinkedIn URL and company name, that's a good sign
  if (companyName && linkedinCompanyUrl) {
    // Basic check: LinkedIn URL typically contains company name or slug
    const nameSlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (linkedinCompanyUrl.toLowerCase().includes(nameSlug.substring(0, 10))) {
      score += 1;
      sources.push('company_name_match');
    }
  } else if (companyName && lead.website) {
    // Company name and website exist (basic consistency)
    try {
      const domain = new URL(lead.website).hostname.replace('www.', '');
      const nameWords = companyName.toLowerCase().split(/\s+/);
      // Check if any word from company name appears in domain
      const hasMatch = nameWords.some(word => 
        word.length > 3 && domain.includes(word)
      );
      if (hasMatch) {
        score += 1;
        sources.push('website_name_match');
      }
    } catch (e) {
      // URL parsing failed
    }
  }
  
  // 2. LinkedIn company page exists (1 point)
  if (linkedinCompanyUrl) {
    score += 1;
    sources.push('linkedin_company_page');
  } else if (lead.socials?.linkedin) {
    // We have LinkedIn URL from extraction
    score += 1;
    sources.push('linkedin_social_link');
  }
  
  // 3. Decision maker name matching (1 point)
  // Check if decision makers from website match LinkedIn suggestions
  const websiteDecisionMakers = lead.decisionMakers || [];
  const linkedinContacts = lead.enrichment?.linkedinContacts?.contacts || [];
  
  if (websiteDecisionMakers.length > 0 && linkedinContacts.length > 0) {
    // Check for name matches (fuzzy)
    const websiteNames = new Set(
      websiteDecisionMakers
        .map(dm => (dm.name || '').toLowerCase().trim())
        .filter(name => name.length > 0)
    );
    
    const linkedinNames = new Set(
      linkedinContacts
        .map(contact => (contact.name || '').toLowerCase().trim())
        .filter(name => name.length > 0)
    );
    
    // Check for any overlap (exact or partial match)
    let hasMatch = false;
    for (const websiteName of websiteNames) {
      for (const linkedinName of linkedinNames) {
        // Exact match
        if (websiteName === linkedinName) {
          hasMatch = true;
          break;
        }
        // Partial match (first name or last name)
        const websiteParts = websiteName.split(/\s+/);
        const linkedinParts = linkedinName.split(/\s+/);
        if (websiteParts.some(part => linkedinParts.includes(part) && part.length > 2)) {
          hasMatch = true;
          break;
        }
      }
      if (hasMatch) break;
    }
    
    if (hasMatch) {
      score += 1;
      sources.push('decision_maker_match');
    }
  } else if (websiteDecisionMakers.length > 0) {
    // We have decision makers from website (even without LinkedIn match)
    score += 0.5; // Half point for having decision makers
    sources.push('website_decision_makers');
  }
  
  // 4. Email pattern verification (1 point)
  // Check if email pattern domain matches website domain
  const emailPattern = lead.enrichment?.emailPattern || '';
  if (emailPattern && lead.website) {
    try {
      const websiteDomain = new URL(lead.website).hostname.replace('www.', '');
      // Check if email pattern contains domain or if we can extract domain from pattern
      if (emailPattern.includes('@')) {
        const patternDomain = emailPattern.split('@')[1];
        if (patternDomain === websiteDomain) {
          score += 1;
          sources.push('email_pattern_verified');
        }
      } else if (lead.emails && lead.emails.length > 0) {
        // Check if any extracted email matches website domain
        const hasMatchingEmail = lead.emails.some(email => {
          const emailStr = email.email || email;
          if (emailStr.includes('@')) {
            const emailDomain = emailStr.split('@')[1];
            return emailDomain === websiteDomain;
          }
          return false;
        });
        if (hasMatchingEmail) {
          score += 1;
          sources.push('email_domain_verified');
        }
      }
    } catch (e) {
      // URL parsing failed
    }
  }
  
  // 5. Additional signals (1 point)
  // Check for consistency in industry, company size, location
  let additionalSignals = 0;
  
  // Industry consistency
  if (enrichmentIndustry && enrichmentIndustry !== 'unknown') {
    additionalSignals += 0.3;
  }
  
  // Company size
  const companySize = lead.enrichment?.companySize || '';
  if (companySize && companySize !== 'unknown') {
    additionalSignals += 0.3;
  }
  
  // Location/address
  if (lead.address && lead.address.trim().length > 0) {
    additionalSignals += 0.2;
  }
  
  // Social media presence
  const socialCount = Object.values(lead.socials || {}).filter(Boolean).length;
  if (socialCount >= 2) {
    additionalSignals += 0.2;
  }
  
  // NEW: Email deliverability verification (bonus)
  const hasVerifiedEmail = lead.emails && lead.emails.some(email => {
    const deliverability = email.deliverability;
    return deliverability && deliverability.status === 'valid' && deliverability.score >= 80;
  });
  if (hasVerifiedEmail) {
    additionalSignals += 0.2; // Bonus for verified emails
    sources.push('email_deliverability_verified');
  }
  
  if (additionalSignals >= 0.7) {
    score += 1;
    sources.push('additional_signals');
  }
  
  return {
    score: Math.min(5, Math.max(0, Math.round(score))),
    sources: sources
  };
}

/**
 * Get verification label based on score
 * @param {Number} score - Verification score (0-5)
 * @returns {String} Verification label
 */
export function getVerificationLabel(score) {
  if (score >= 5) return 'highly_verified';
  if (score >= 3) return 'verified';
  if (score >= 1) return 'partially_verified';
  return 'unverified';
}

