import Lead from '../models/Lead.js';

/**
 * Detect and mark duplicate leads
 */
export async function detectDuplicates(newLead, searchId) {
  try {
    // Check for duplicates by website (most reliable)
    if (newLead.website) {
      const websiteDuplicate = await Lead.findOne({
        website: newLead.website,
        searchId: { $ne: searchId },
        isDuplicate: false
      });
      
      if (websiteDuplicate) {
        return {
          isDuplicate: true,
          duplicateOf: websiteDuplicate._id
        };
      }
    }
    
    // Check for duplicates by company name (fuzzy match)
    if (newLead.companyName) {
      const nameDuplicate = await Lead.findOne({
        companyName: { $regex: new RegExp(newLead.companyName, 'i') },
        searchId: { $ne: searchId },
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
          return {
            isDuplicate: true,
            duplicateOf: nameDuplicate._id
          };
        }
      }
    }
    
    return {
      isDuplicate: false,
      duplicateOf: null
    };
    
  } catch (error) {
    console.error('❌ Duplicate detection error:', error.message);
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

