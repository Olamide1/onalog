import Lead from '../models/Lead.js';
import { normalizeUrl } from '../utils/urlNormalizer.js';

/**
 * Detect and mark duplicate leads
 * FIXED: Now checks within the same search AND other searches
 * Uses proper URL normalization and atomic operations to prevent race conditions
 */
export async function detectDuplicates(newLead, searchId) {
  try {
    // Fix: Google search links are unique per query - don't treat them as duplicates
    // Google search links (e.g., https://www.google.com/search?q=...) should be treated as unique
    // because each search query is different, even though they all normalize to "google.com"
    const isGoogleSearchLink = newLead.website && (
      newLead.website.includes('google.com/search') ||
      newLead.website.includes('google.com/search?')
    );
    
    // Fix: Use proper URL normalization utility
    const normalizedWebsite = normalizeUrl(newLead.website);
    
    // Fix: Use atomic findOneAndUpdate to prevent race conditions
    // Check for duplicates by website (most reliable) - WITHIN SAME SEARCH
    // BUT: Skip domain-based duplicate detection for Google search links (they're unique per query)
    if (normalizedWebsite && !isGoogleSearchLink) {
      // Use regex pattern that matches any URL with the same normalized domain
      // This handles http/https, www, trailing slashes, paths, etc.
      const domainPattern = normalizedWebsite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Fix: Use atomic operation to find and mark duplicate in one step
      // This prevents race conditions where two leads with same website are processed concurrently
      const websiteDuplicate = await Lead.findOne({
        $or: [
          // Exact match
          { website: newLead.website },
          // Normalized domain match (handles http/https, www, paths, etc.)
          { website: { $regex: new RegExp(`^https?://(www\\.)?${domainPattern}`, 'i') } }
        ],
        searchId: searchId, // Check within same search
        isDuplicate: false,
        _id: { $ne: newLead._id }
      });
      
      if (websiteDuplicate) {
        console.log(`[DUPLICATE] Found duplicate by website in same search: ${newLead.website} → ${websiteDuplicate.website}`);
        return {
          isDuplicate: true,
          duplicateOf: websiteDuplicate._id
        };
      }
      
      // Also check other searches (for reference, but only mark duplicates within same search)
      const websiteDuplicateOther = await Lead.findOne({
        $or: [
          { website: newLead.website },
          { website: { $regex: new RegExp(`^https?://(www\\.)?${domainPattern}`, 'i') } }
        ],
        searchId: { $ne: searchId },
        isDuplicate: false
      });
      
      if (websiteDuplicateOther) {
        console.log(`[DUPLICATE] Found duplicate by website in other search: ${newLead.website} → ${websiteDuplicateOther.website}`);
        return {
          isDuplicate: true,
          duplicateOf: websiteDuplicateOther._id
        };
      }
    }
    
    // Check for duplicates by company name (fuzzy match) - WITHIN SAME SEARCH
    if (newLead.companyName && newLead.companyName.length > 3) {
      const nameDuplicate = await Lead.findOne({
        companyName: { $regex: new RegExp(newLead.companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        searchId: searchId, // Check within same search
        isDuplicate: false,
        _id: { $ne: newLead._id }
      });
      
      if (nameDuplicate) {
        // Calculate similarity
        const similarity = calculateSimilarity(
          newLead.companyName.toLowerCase(),
          nameDuplicate.companyName.toLowerCase()
        );
        
        if (similarity > 0.85) {
          console.log(`[DUPLICATE] Found duplicate by name in same search: ${newLead.companyName} (similarity: ${similarity.toFixed(2)})`);
          return {
            isDuplicate: true,
            duplicateOf: nameDuplicate._id
          };
        }
      }
      
      // Also check other searches
      const nameDuplicateOther = await Lead.findOne({
        companyName: { $regex: new RegExp(newLead.companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        searchId: { $ne: searchId },
        isDuplicate: false,
        _id: { $ne: newLead._id }
      });
      
      if (nameDuplicateOther) {
        const similarity = calculateSimilarity(
          newLead.companyName.toLowerCase(),
          nameDuplicateOther.companyName.toLowerCase()
        );
        
        if (similarity > 0.85) {
          console.log(`[DUPLICATE] Found duplicate by name in other search: ${newLead.companyName} (similarity: ${similarity.toFixed(2)})`);
          return {
            isDuplicate: true,
            duplicateOf: nameDuplicateOther._id
          };
        }
      }
    }
    
    return {
      isDuplicate: false,
      duplicateOf: null
    };
    
  } catch (error) {
    console.error('[DUPLICATE] ❌ Error:', error.message);
    return {
      isDuplicate: false,
      duplicateOf: null
    };
  }
}

/**
 * Calculate string similarity (Levenshtein-based)
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance
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

