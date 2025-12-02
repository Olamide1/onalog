/**
 * AI-based decision maker validation
 * Filters out noise and validates that extracted names are real people
 */

import { OpenAI } from 'openai';

const VALIDATION_CACHE = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Validate and filter decision makers using AI
 * Removes generic/placeholder names, validates person names, and improves titles
 * @param {Array} decisionMakers - Array of decision maker objects
 * @param {String} companyName - Company name for context
 * @param {String} website - Company website for context
 * @returns {Promise<Array>} Validated and filtered decision makers
 */
export async function validateDecisionMakers(decisionMakers, companyName, website) {
  if (!decisionMakers || decisionMakers.length === 0) {
    return [];
  }

  if (!process.env.OPENAI_API_KEY) {
    // If no OpenAI key, use basic filtering
    return filterBasicNoise(decisionMakers);
  }

  const cacheKey = `${companyName}|${decisionMakers.map(dm => dm.name).join(',')}`;
  const cached = VALIDATION_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.validated;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Validate and filter these decision makers extracted from a company website.

Company: ${companyName || 'Unknown'}
Website: ${website || 'Not provided'}

Decision Makers:
${JSON.stringify(decisionMakers, null, 2)}

Return ONLY a JSON object:
{
  "validated": [
    {
      "name": "validated person name (cleaned and corrected)",
      "title": "validated job title (cleaned and corrected)",
      "email": "email if provided, or null",
      "source": "original source",
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- REJECT if name is clearly not a person (e.g., "Transport Lagos", "Expired Operations Team Lead", "Training Programmes", "We co", generic department names)
- REJECT if name is a placeholder or generic text (e.g., "Home", "About", "Contact", "Services")
- REJECT if name is too long (likely extracted wrong text, e.g., full sentences)
- REJECT if name contains special characters that don't belong in names (except hyphens, apostrophes)
- REJECT if email is a placeholder (e.g., "jane.doe@domain.com", "john.smith@domain.com", "test@domain.com", "example@domain.com")
- REJECT if email contains placeholder patterns (e.g., "firstname.lastname@", "firstname@", "lastname@")
- ACCEPT if name looks like a real person name (2-4 words, proper capitalization, reasonable length)
- Clean and correct titles (remove extra text, fix capitalization)
- Only keep emails that look real (not placeholder patterns)
- Confidence should reflect how certain you are this is a real person

Examples of REJECT:
- "Transport Lagos (Nigeria Social Media Manager)" → REJECT (department name, not person)
- "Expired Operations Team Lead" → REJECT (not a person name)
- "Training Programmes (The Vision, Strategy and Team Building Workshop...)" → REJECT (program name, not person)
- "We co (create bespoke Talent Management solutions...)" → REJECT (company description, not person)

Examples of ACCEPT:
- "Jennifer Ikuenobe" → ACCEPT (real person name)
- "John Smith" → ACCEPT (real person name)
- "Mary-Jane O'Connor" → ACCEPT (real person name with hyphen/apostrophe)

Output the JSON object only:`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You validate and filter decision maker names extracted from websites. Remove noise and keep only real person names. Output JSON only.' },
        { role: 'user', content: prompt }
      ]
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const result = JSON.parse(text);
    
    const validated = (result.validated || []).filter(dm => {
      // Additional client-side validation
      if (!dm.name || dm.name.length < 3 || dm.name.length > 50 || dm.confidence <= 0.5) {
        return false;
      }
      
      // REJECT placeholder emails (jane.doe, john.smith, test, example, etc.)
      if (dm.email) {
        const emailLower = dm.email.toLowerCase();
        const placeholderPatterns = [
          /jane\.doe@/i,
          /john\.smith@/i,
          /test@/i,
          /example@/i,
          /firstname\.lastname@/i,
          /firstname@/i,
          /lastname@/i,
          /first\.last@/i,
          /f\.last@/i,
          /first\.l@/i,
          /placeholder@/i,
          /sample@/i,
          /demo@/i,
          /user@/i,
          /admin@/i,
          /contact@/i,
          /info@/i,
          /hello@/i,
          /hi@/i
        ];
        
        if (placeholderPatterns.some(pattern => pattern.test(emailLower))) {
          console.log(`[DECISION_MAKER_VALIDATOR] ⚠️  Rejecting placeholder email: ${dm.email}`);
          return false;
        }
      }
      
      return true;
    });

    // Cache the result
    VALIDATION_CACHE.set(cacheKey, {
      validated,
      expiresAt: Date.now() + CACHE_TTL
    });

    return validated;
  } catch (error) {
    console.log(`[DECISION_MAKER_VALIDATOR] AI validation failed: ${error.message}`);
    // Fallback to basic filtering
    return filterBasicNoise(decisionMakers);
  }
}

/**
 * Basic noise filtering without AI (fallback)
 */
function filterBasicNoise(decisionMakers) {
  const noisePatterns = [
    /^(transport|expired|training|we co|home|about|contact|services|products|solutions|programmes?|workshop)/i,
    /\(.*\)$/, // Names ending with parentheses (often descriptions)
    /^[A-Z][a-z]+ [A-Z][a-z]+ \(/, // Pattern like "Name Name (description)"
    /^[^A-Z]/, // Doesn't start with capital letter
    /^.{0,2}$/, // Too short
    /^.{51,}$/, // Too long (likely extracted wrong text)
    /[0-9]{3,}/, // Contains 3+ digits (likely not a name)
    /^(the|a|an|our|your|my|we|they|it)\s/i, // Starts with common words
  ];
  
  const placeholderEmailPatterns = [
    /jane\.doe@/i,
    /john\.smith@/i,
    /test@/i,
    /example@/i,
    /firstname\.lastname@/i,
    /firstname@/i,
    /lastname@/i,
    /first\.last@/i,
    /f\.last@/i,
    /first\.l@/i,
    /placeholder@/i,
    /sample@/i,
    /demo@/i,
    /user@/i,
    /admin@/i,
    /contact@/i,
    /info@/i,
    /hello@/i,
    /hi@/i
  ];

  return decisionMakers.filter(dm => {
    const name = (dm.name || '').trim();
    if (!name || name.length < 3) return false;
    
    // Reject if matches noise patterns
    if (noisePatterns.some(pattern => pattern.test(name))) {
      return false;
    }
    
    // Reject if name is all caps (likely extracted wrong)
    if (name === name.toUpperCase() && name.length > 5) {
      return false;
    }
    
    // REJECT placeholder emails
    if (dm.email) {
      const emailLower = dm.email.toLowerCase();
      if (placeholderEmailPatterns.some(pattern => pattern.test(emailLower))) {
        console.log(`[DECISION_MAKER_VALIDATOR] ⚠️  Rejecting placeholder email: ${dm.email}`);
        return false;
      }
    }
    
    // Accept if looks like a person name (2-4 words, reasonable length)
    const words = name.split(/\s+/);
    if (words.length >= 1 && words.length <= 4 && name.length <= 50) {
      return true;
    }
    
    return false;
  });
}

