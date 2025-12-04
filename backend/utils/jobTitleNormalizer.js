/**
 * Job title normalization and seniority detection
 * Normalizes job titles and assigns seniority levels
 */

/**
 * Normalize a job title to a standard format
 * @param {String} title - Raw job title
 * @returns {String} Normalized title
 */
export function normalizeJobTitle(title) {
  if (!title || typeof title !== 'string') return null;
  
  const titleLower = title.toLowerCase().trim();
  
  // CEO/Executive level
  if (/(chief\s+executive|ceo|founder|co-founder|cofounder|president|owner|proprietor)/i.test(title)) {
    return 'Chief Executive Officer';
  }
  if (/(chief\s+technology|cto|chief\s+tech)/i.test(title)) {
    return 'Chief Technology Officer';
  }
  if (/(chief\s+financial|cfo|chief\s+finance)/i.test(title)) {
    return 'Chief Financial Officer';
  }
  if (/(chief\s+operating|coo|chief\s+operations)/i.test(title)) {
    return 'Chief Operating Officer';
  }
  if (/(chief\s+marketing|cmo|chief\s+marketing)/i.test(title)) {
    return 'Chief Marketing Officer';
  }
  
  // VP/Director level
  if (/(vice\s+president|vp\s+of|v\.p\.|vice\s+pres)/i.test(title)) {
    return 'Vice President';
  }
  if (/(executive\s+director|exec\s+director)/i.test(title)) {
    return 'Executive Director';
  }
  if (/(managing\s+director|md\b)/i.test(title)) {
    return 'Managing Director';
  }
  if (/^director\b/i.test(title)) {
    return 'Director';
  }
  if (/(director\s+of|head\s+of)/i.test(title)) {
    return 'Director';
  }
  
  // Manager level
  if (/(general\s+manager|gm\b|country\s+manager)/i.test(title)) {
    return 'General Manager';
  }
  if (/(senior\s+manager|sr\s+manager)/i.test(title)) {
    return 'Senior Manager';
  }
  if (/^manager\b/i.test(title)) {
    return 'Manager';
  }
  if (/(manager\s+of|head\s+of)/i.test(title)) {
    return 'Manager';
  }
  
  // Lead/Supervisor level
  if (/(team\s+lead|lead\s+developer|lead\s+engineer|technical\s+lead)/i.test(title)) {
    return 'Team Lead';
  }
  if (/(supervisor|supervising)/i.test(title)) {
    return 'Supervisor';
  }
  
  // Coordinator/Specialist
  if (/(coordinator|co-ordinator)/i.test(title)) {
    return 'Coordinator';
  }
  if (/(specialist|expert|consultant)/i.test(title)) {
    return 'Specialist';
  }
  
  // Sales specific
  if (/(sales\s+director|head\s+of\s+sales)/i.test(title)) {
    return 'Sales Director';
  }
  if (/(sales\s+manager)/i.test(title)) {
    return 'Sales Manager';
  }
  if (/(business\s+development|bd\s+manager|bdm)/i.test(title)) {
    return 'Business Development Manager';
  }
  
  // Marketing specific
  if (/(marketing\s+director|head\s+of\s+marketing)/i.test(title)) {
    return 'Marketing Director';
  }
  if (/(marketing\s+manager)/i.test(title)) {
    return 'Marketing Manager';
  }
  
  // Operations specific
  if (/(operations\s+director|head\s+of\s+operations)/i.test(title)) {
    return 'Operations Director';
  }
  if (/(operations\s+manager)/i.test(title)) {
    return 'Operations Manager';
  }
  
  // Return cleaned version of original if no match
  return title.trim();
}

/**
 * Determine seniority level from job title
 * @param {String} title - Job title
 * @returns {String} Seniority level: 'executive', 'senior', 'mid', 'junior'
 */
export function getSeniorityLevel(title) {
  if (!title || typeof title !== 'string') return 'mid';
  
  const titleLower = title.toLowerCase().trim();
  
  // Executive level
  if (/(chief|ceo|cto|cfo|coo|cmo|president|founder|owner|executive\s+director|managing\s+director|vp|vice\s+president)/i.test(titleLower)) {
    return 'executive';
  }
  
  // Senior level
  if (/(senior|sr|head\s+of|director|lead|principal)/i.test(titleLower)) {
    return 'senior';
  }
  
  // Junior level
  if (/(junior|jr|intern|trainee|assistant|associate)/i.test(titleLower)) {
    return 'junior';
  }
  
  // Default to mid-level
  return 'mid';
}

/**
 * Extract department from job title
 * @param {String} title - Job title
 * @returns {String} Department name
 */
export function extractDepartment(title) {
  if (!title || typeof title !== 'string') return 'General';
  
  const titleLower = title.toLowerCase().trim();
  
  if (/(sales|business\s+development|bd)/i.test(titleLower)) return 'Sales';
  if (/(marketing|brand|advertising|promotion)/i.test(titleLower)) return 'Marketing';
  if (/(technology|tech|engineering|software|development|it|technical)/i.test(titleLower)) return 'Technology';
  if (/(operations|ops|logistics|supply\s+chain)/i.test(titleLower)) return 'Operations';
  if (/(finance|financial|accounting|accountant|cfp)/i.test(titleLower)) return 'Finance';
  if (/(hr|human\s+resources|recruiting|talent|people)/i.test(titleLower)) return 'Human Resources';
  if (/(customer\s+success|customer\s+service|support|client\s+services)/i.test(titleLower)) return 'Customer Success';
  if (/(product|products|pm|product\s+management)/i.test(titleLower)) return 'Product';
  if (/(executive|ceo|president|founder|owner|board)/i.test(titleLower)) return 'Executive';
  if (/(legal|compliance|regulatory)/i.test(titleLower)) return 'Legal';
  
  return 'General';
}
