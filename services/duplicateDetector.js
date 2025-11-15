import Lead from '../models/Lead.js';

/**
 * Detect and mark duplicate leads
 * FIXED: Now checks within the same search AND other searches
 */
export async function detectDuplicates(newLead, searchId) {
  try {
    // Normalize website URL for comparison
    const normalizeUrl = (url) => {
      if (!url) return '';
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '').toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    };
    
    const normalizedWebsite = normalizeUrl(newLead.website);
    
    // Check for duplicates by website (most reliable) - WITHIN SAME SEARCH
    if (normalizedWebsite) {
      const websiteDuplicate = await Lead.findOne({
        $or: [
          { website: newLead.website },
          { website: { $regex: new RegExp(normalizedWebsite.replace(/\./g, '\\.'), 'i') } }
        ],
        searchId: searchId, // Check within same search
        isDuplicate: false,
        _id: { $ne: newLead._id }
      });
      
      if (websiteDuplicate) {
        console.log(`[DUPLICATE] Found duplicate by website in same search: ${newLead.website}`);
        return {
          isDuplicate: true,
          duplicateOf: websiteDuplicate._id
        };
      }
      
      // Also check other searches
      const websiteDuplicateOther = await Lead.findOne({
        $or: [
          { website: newLead.website },
          { website: { $regex: new RegExp(normalizedWebsite.replace(/\./g, '\\.'), 'i') } }
        ],
        searchId: { $ne: searchId },
        isDuplicate: false
      });
      
      if (websiteDuplicateOther) {
        console.log(`[DUPLICATE] Found duplicate by website in other search: ${newLead.website}`);
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

