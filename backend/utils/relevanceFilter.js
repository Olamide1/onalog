/**
 * AI-based relevance filtering for leads
 * Replaces hardcoded business type patterns with dynamic AI/LLM validation
 */
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Cache for relevance checks (to avoid repeated API calls)
const RELEVANCE_CACHE = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a lead is relevant to the search query using AI
 * Replaces hardcoded business type patterns with dynamic AI validation
 * 
 * @param {Object} leadData - Lead data to check
 * @param {String} searchQuery - Original search query
 * @param {String} industry - Extracted industry from query (optional)
 * @returns {Promise<Object>} { isRelevant: boolean, reason: string, confidence: number, relevant: boolean }
 */
export async function isLeadRelevant(leadData, searchQuery, industry = null) {
  // If no OpenAI key, fall back to basic pattern matching (less accurate but works)
  if (!process.env.OPENAI_API_KEY) {
    return fallbackRelevanceCheck(leadData, searchQuery, industry);
  }
  
  const cacheKey = `${searchQuery}:${leadData.companyName}:${leadData.website}`;
  const cached = RELEVANCE_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }
  
  try {
    const prompt = `Analyze if this business is relevant to the search query.

Search Query: "${searchQuery}"
${industry ? `Industry: "${industry}"` : ''}

Business Information:
- Company Name: ${leadData.companyName || 'Unknown'}
- Website: ${leadData.website || 'Not provided'}
- About: ${leadData.aboutText || 'No description'}
- Categories: ${(leadData.categorySignals || []).join(', ') || 'None'}

Determine if this business is RELEVANT to the search query.

Return ONLY a JSON object:
{
  "isRelevant": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation of why it is or isn't relevant"
}

Rules:
- REJECT if business is clearly irrelevant (e.g., domain marketplace when searching for phone stores, computer repair when searching for marketing agencies)
- REJECT if business is a directory/aggregator site (not an actual business)
- REJECT if business is a placeholder/example site
- ACCEPT if business matches the search intent, even if not exact match
- Be permissive for generic queries (e.g., "companies in Lagos")
- Be strict for specific queries (e.g., "phone stores in Lagos")

Examples:
- Query: "phone stores in Lagos", Business: "HugeDomains - Domain Marketplace" → {"isRelevant": false, "confidence": 0.95, "reason": "Domain marketplace, not a phone store"}
- Query: "phone stores in Lagos", Business: "Computer Repair Shop" → {"isRelevant": false, "confidence": 0.9, "reason": "Computer repair service, not a phone store"}
- Query: "marketing agencies", Business: "Digital Marketing Agency" → {"isRelevant": true, "confidence": 0.95, "reason": "Matches search intent"}
- Query: "companies in Lagos", Business: "Any legitimate business" → {"isRelevant": true, "confidence": 0.8, "reason": "Generic query, accept any legitimate business"}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You determine if a business is relevant to a search query. Return JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    
    const text = response.choices?.[0]?.message?.content?.trim() || '{}';
    const result = JSON.parse(text);
    
    // Return result with both formats for backward compatibility
    const relevance = {
      isRelevant: result.isRelevant === true && result.confidence > 0.5,
      relevant: result.isRelevant === true && result.confidence > 0.5, // Backward compatibility
      reason: result.reason || '',
      confidence: result.confidence || 0
    };
    
    // Cache the result
    RELEVANCE_CACHE.set(cacheKey, {
      result: relevance,
      expiresAt: Date.now() + CACHE_TTL
    });
    
    return relevance;
  } catch (error) {
    console.log(`[RELEVANCE] AI relevance check failed: ${error.message}, using fallback`);
    return fallbackRelevanceCheck(leadData, searchQuery, industry);
  }
}

/**
 * Fallback relevance check using pattern matching
 * Used when OpenAI API is not available
 */
function fallbackRelevanceCheck(leadData, searchQuery, industry) {
  const combinedText = [
    leadData.companyName,
    leadData.aboutText,
    (leadData.categorySignals || []).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
  
  // Basic pattern-based rejection (only for obvious cases)
  const obviousIrrelevantPatterns = [
    /domain.*marketplace|domain.*sale|hugedomains|sortlist/i,
    /example\.com|localhost|test\.com|placeholder/i
  ];
  
  const isObviouslyIrrelevant = obviousIrrelevantPatterns.some(pattern => pattern.test(combinedText));
  
  if (isObviouslyIrrelevant) {
    return {
      isRelevant: false,
      relevant: false, // Backward compatibility
      reason: 'Obvious irrelevant business type (domain marketplace, placeholder, etc.)',
      confidence: 0.8
    };
  }
  
  // For generic queries, be permissive
  if (!industry || industry.trim().length === 0) {
    return {
      isRelevant: true,
      relevant: true, // Backward compatibility
      reason: 'Generic query, accepting any legitimate business',
      confidence: 0.6
    };
  }
  
  // For specific queries, do basic keyword matching
  const industryLower = industry.toLowerCase();
  const hasIndustryKeyword = combinedText.includes(industryLower) || 
                            industryLower.split(' ').some(word => combinedText.includes(word));
  
  return {
    isRelevant: hasIndustryKeyword,
    relevant: hasIndustryKeyword, // Backward compatibility
    reason: hasIndustryKeyword ? 'Contains industry keywords' : 'No industry keywords found',
    confidence: hasIndustryKeyword ? 0.7 : 0.5
  };
}
