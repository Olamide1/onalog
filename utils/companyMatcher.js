/**
 * Normalize company name for matching
 */
export function normalizeCompanyName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/[^\w\s]/g, '') // Remove special characters
    .trim();
}

/**
 * Calculate similarity between two strings (0-1)
 */
export function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Find similar companies (above threshold)
 */
export async function findSimilarCompanies(companyName, Company, threshold = 0.85) {
  const normalized = normalizeCompanyName(companyName);
  
  // First try exact match
  const exactMatch = await Company.findOne({ normalizedName: normalized });
  if (exactMatch) {
    return { match: exactMatch, similarity: 1.0, type: 'exact' };
  }
  
  // Get all companies for fuzzy matching
  const allCompanies = await Company.find({});
  
  const matches = [];
  for (const company of allCompanies) {
    const similarity = calculateSimilarity(normalized, company.normalizedName);
    if (similarity >= threshold) {
      matches.push({
        company,
        similarity
      });
    }
  }
  
  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);
  
  if (matches.length > 0) {
    return {
      match: matches[0].company,
      similarity: matches[0].similarity,
      type: 'similar',
      alternatives: matches.slice(0, 3) // Top 3 similar
    };
  }
  
  return { match: null, similarity: 0, type: 'none' };
}

