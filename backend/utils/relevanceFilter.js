/**
 * AI-based relevance filtering for leads
 * Uses LLM to determine if a lead is relevant to the search query
 */

import { OpenAI } from 'openai';

const RELEVANCE_CACHE = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a lead is relevant to the search query using AI
 * @param {Object} leadData - Lead data (companyName, website, aboutText, etc.)
 * @param {String} searchQuery - Original search query
 * @param {String} industry - Extracted industry (optional)
 * @returns {Promise<{relevant: boolean, confidence: number, reason: string}>}
 */
export async function isLeadRelevant(leadData, searchQuery, industry = null) {
  if (!process.env.OPENAI_API_KEY) {
    // If no OpenAI key, default to relevant (don't filter)
    return { relevant: true, confidence: 0.5, reason: 'No AI key - defaulting to relevant' };
  }

  const cacheKey = `${leadData.companyName || ''}|${searchQuery}|${industry || ''}`;
  const cached = RELEVANCE_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Determine if this business is relevant to the search query.

Search Query: "${searchQuery}"
${industry ? `Industry: "${industry}"` : ''}

Business:
- Company Name: ${leadData.companyName || 'Unknown'}
- Website: ${leadData.website || 'Not provided'}
- About: ${leadData.aboutText || 'No description available'}
- Categories: ${(leadData.categorySignals || []).join(', ') || 'None'}

Return ONLY a JSON object:
{
  "relevant": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation"
}

Rules:
- Reject if business is clearly irrelevant (e.g., domain seller in "phone stores" search, tech company in "grocery stores" search)
- Reject if business is a directory/aggregator site (not a first-party business)
- Reject if business is social media only (no actual business website)
- Accept if business matches the search intent (even if not exact match)
- Be permissive for generic queries (e.g., "companies")
- Confidence should reflect certainty

Examples:
- Query: "phone stores in Abuja", Business: "Wagner Group" → {"relevant": false, "confidence": 0.95, "reason": "Military contractor, not a phone store"}
- Query: "grocery stores", Business: "Steezetech" → {"relevant": false, "confidence": 0.9, "reason": "Tech/education company, not a grocery store"}
- Query: "hr companies", Business: "Paid HR" → {"relevant": true, "confidence": 0.95, "reason": "HR company matches search intent"}

Output the JSON object only:`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You determine if businesses are relevant to search queries. Output JSON only.' },
        { role: 'user', content: prompt }
      ]
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const result = JSON.parse(text);
    
    const relevance = {
      relevant: result.relevant === true,
      confidence: result.confidence || 0.5,
      reason: result.reason || 'No reason provided'
    };

    // Cache the result
    RELEVANCE_CACHE.set(cacheKey, {
      result: relevance,
      expiresAt: Date.now() + CACHE_TTL
    });

    return relevance;
  } catch (error) {
    console.log(`[RELEVANCE_FILTER] AI relevance check failed: ${error.message}`);
    // Default to relevant on error (don't filter out leads if AI fails)
    return { relevant: true, confidence: 0.5, reason: `AI check failed: ${error.message}` };
  }
}

