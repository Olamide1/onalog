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
    console.log(`[DECISION_MAKER_VALIDATOR] ⚠️  No decision makers to validate for "${companyName}"`);
    return [];
  }

  // Log what we're validating
  console.log(`[DECISION_MAKER_VALIDATOR] 🔍 Validating ${decisionMakers.length} decision maker(s) for "${companyName}":`);
  decisionMakers.forEach((dm, idx) => {
    console.log(`[DECISION_MAKER_VALIDATOR]   ${idx + 1}. "${dm.name}" (${dm.title || 'No title'}) - Source: ${dm.source || 'unknown'}, Email: ${dm.email || 'none'}`);
  });

  // Check if OpenAI API key is set
  if (!process.env.OPENAI_API_KEY) {
    console.log(`[DECISION_MAKER_VALIDATOR] ⚠️  OPENAI_API_KEY not set - using basic filtering (no AI validation)`);
    const filtered = filterBasicNoise(decisionMakers);
    console.log(`[DECISION_MAKER_VALIDATOR] ✅ Basic filtering: ${filtered.length}/${decisionMakers.length} passed`);
    return filtered;
  }

  console.log(`[DECISION_MAKER_VALIDATOR] ✅ OPENAI_API_KEY is set - using AI validation`);

  const cacheKey = `${companyName}|${decisionMakers.map(dm => dm.name).join(',')}`;
  const cached = VALIDATION_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[DECISION_MAKER_VALIDATOR] ✅ Using cached validation result: ${cached.validated.length}/${decisionMakers.length} passed`);
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

IMPORTANT: Be lenient with validation. If a name looks like it could be a real person (even if you're not 100% certain), ACCEPT it with a confidence score of 0.6-0.8. Only REJECT if you're very confident it's NOT a person name.

Rules:
- REJECT if name is clearly not a person (e.g., "Transport Lagos", "Expired Operations Team Lead", "Training Programmes", "We co", generic department names)
- REJECT if name is a placeholder or generic text (e.g., "Home", "About", "Contact", "Services")
- REJECT if name is too long (likely extracted wrong text, e.g., full sentences over 50 characters)
- REJECT if name contains special characters that don't belong in names (except hyphens, apostrophes, periods)
- REJECT if email is a placeholder (e.g., "jane.doe@domain.com", "john.smith@domain.com", "test@domain.com", "example@domain.com")
- REJECT if email contains placeholder patterns (e.g., "firstname.lastname@", "firstname@", "lastname@")
- ACCEPT if name looks like it could be a real person name (1-4 words, reasonable capitalization, reasonable length 3-50 chars)
- ACCEPT names with common variations (e.g., "Dr. John Smith", "Mr. Jane Doe", "Mary-Jane O'Connor")
- Clean and correct titles (remove extra text, fix capitalization)
- Only keep emails that look real (not placeholder patterns)
- Confidence should reflect how certain you are this is a real person (0.6+ for likely real names, 0.8+ for very confident)

Examples of REJECT:
- "Transport Lagos (Nigeria Social Media Manager)" → REJECT (department name, not person)
- "Expired Operations Team Lead" → REJECT (not a person name)
- "Training Programmes (The Vision, Strategy and Team Building Workshop...)" → REJECT (program name, not person)
- "We co (create bespoke Talent Management solutions...)" → REJECT (company description, not person)

Examples of ACCEPT (be lenient):
- "Jennifer Ikuenobe" → ACCEPT (real person name, confidence: 0.9)
- "John Smith" → ACCEPT (real person name, confidence: 0.9)
- "Mary-Jane O'Connor" → ACCEPT (real person name with hyphen/apostrophe, confidence: 0.9)
- "Omidyar Network" → ACCEPT if it looks like a name (confidence: 0.7)
- "Dr. Sarah Williams" → ACCEPT (with title, confidence: 0.8)
- "Chinedu Okonkwo" → ACCEPT (Nigerian name, confidence: 0.8)

Output the JSON object only:`;

    console.log(`[DECISION_MAKER_VALIDATOR] 🤖 Sending ${decisionMakers.length} decision maker(s) to AI for validation...`);
    
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You validate and filter decision maker names extracted from websites. Be lenient - only reject if you are very confident it is NOT a person name. Output JSON only.' },
        { role: 'user', content: prompt }
      ]
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    console.log(`[DECISION_MAKER_VALIDATOR] 📥 AI Response received (${text.length} chars)`);
    
    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.log(`[DECISION_MAKER_VALIDATOR] ❌ Failed to parse AI response as JSON: ${parseError.message}`);
      console.log(`[DECISION_MAKER_VALIDATOR] Raw response: ${text.substring(0, 500)}`);
      // Fallback to basic filtering
      return filterBasicNoise(decisionMakers);
    }
    
    const aiValidated = result.validated || [];
    console.log(`[DECISION_MAKER_VALIDATOR] 📊 AI returned ${aiValidated.length} validated decision maker(s):`);
    aiValidated.forEach((dm, idx) => {
      console.log(`[DECISION_MAKER_VALIDATOR]   ${idx + 1}. "${dm.name}" (${dm.title || 'No title'}) - Confidence: ${(dm.confidence * 100).toFixed(0)}%, Email: ${dm.email || 'none'}`);
    });
    
    const validated = aiValidated.filter((dm, idx) => {
      // Additional client-side validation
      let rejectionReason = null;
      
      if (!dm.name) {
        rejectionReason = 'Missing name';
      } else if (dm.name.length < 3) {
        rejectionReason = `Name too short (${dm.name.length} chars)`;
      } else if (dm.name.length > 50) {
        rejectionReason = `Name too long (${dm.name.length} chars)`;
      } else if (dm.confidence < 0.6) {
        // CRITICAL FIX: Stricter threshold - require at least 60% confidence
        rejectionReason = `Confidence too low (${(dm.confidence * 100).toFixed(0)}%)`;
      }
      
      // CRITICAL FIX: Reject department/role names
      if (!rejectionReason) {
        const departmentPatterns = [
          /^(retail|corporate|business|commercial|investment|private|wealth|asset|credit|risk|compliance|operations|human|marketing|sales|technology|digital|innovation|strategy|finance|accounting|legal|admin|administrative|customer|client|service|support|product|development|engineering|research|quality|supply|chain|logistics|procurement|sourcing|vendor|partner|alliance|channel|distribution|wholesale|e-commerce|online|mobile|platform|infrastructure|security|information|data|analytics|business intelligence|insights|reporting|audit|internal|external|public|government|regulatory|affairs|relations|communications|media|brand|creative|design|content|editorial|publishing|education|training|learning|talent|recruitment|hr|people|culture|diversity|inclusion|sustainability|environmental|social|responsibility|governance|ethics|compliance|risk|legal|regulatory|tax|treasury|investor|shareholder|stakeholder|community|foundation|charity|non-profit|ngo|public sector|government|municipal|federal|state|local|regional|global|international|emerging|markets|africa|asia|europe|americas|middle east|north|south|east|west|central|northern|southern|eastern|western|central|apac|emea|latam|na)\s+(banking|bank|capital|markets|trading|sales|trading|research|analytics|intelligence|insights|reporting|operations|technology|digital|innovation|strategy|finance|accounting|legal|admin|administrative|customer|client|service|support|product|development|engineering|research|quality|supply|chain|logistics|procurement|sourcing|vendor|partner|alliance|channel|distribution|wholesale|e-commerce|online|mobile|platform|infrastructure|security|information|data|analytics|business intelligence|insights|reporting|audit|internal|external|public|government|regulatory|affairs|relations|communications|media|brand|creative|design|content|editorial|publishing|education|training|learning|talent|recruitment|hr|people|culture|diversity|inclusion|sustainability|environmental|social|responsibility|governance|ethics|compliance|risk|legal|regulatory|tax|treasury|investor|shareholder|stakeholder|community|foundation|charity|non-profit|ngo|public sector|government|municipal|federal|state|local|regional|global|international|emerging|markets|africa|asia|europe|americas|middle east|north|south|east|west|central|northern|southern|eastern|western|central|apac|emea|latam|na)$/i,
          /^(wikidata|wikipedia|metadata|data|info|information|details|summary|overview|description|about|contact|team|staff|employees|people|personnel|workforce|talent|human|capital|resources|hr|recruitment|hiring|onboarding|training|development|learning|education|skills|competencies|capabilities|expertise|knowledge|experience|background|qualifications|credentials|certifications|licenses|permits|authorizations|approvals|clearances|security|clearance|background|check|verification|validation|authentication|authorization|access|permissions|privileges|rights|roles|responsibilities|duties|functions|tasks|activities|actions|operations|processes|procedures|policies|guidelines|standards|rules|regulations|laws|statutes|ordinances|codes|requirements|specifications|criteria|conditions|terms|provisions|clauses|sections|articles|paragraphs|subsections|subparagraphs|items|points|bullet|points|list|items|elements|components|parts|pieces|segments|sections|divisions|departments|units|groups|teams|squads|crews|staffs|personnel|workforces|workforces|talent|pools|pools|of|talent|human|resources|hr|departments|divisions|units|groups|teams|squads|crews|staffs|personnel|workforces|talent|pools|pools|of|talent|human|resources|hr)$/i,
          /^(and|or|the|a|an|of|in|on|at|to|for|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|must|can)$/i,
          /^(co|and co|founded by|founder or|co-founder|cofounder)$/i
        ];
        
        if (departmentPatterns.some(pattern => pattern.test(dm.name))) {
          rejectionReason = `Department/role name, not a person: ${dm.name}`;
        }
      }
      
      // REJECT placeholder emails (jane.doe, john.smith, test, example, etc.)
      if (!rejectionReason && dm.email) {
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
          rejectionReason = `Placeholder email: ${dm.email}`;
        }
      }
      
      if (rejectionReason) {
        console.log(`[DECISION_MAKER_VALIDATOR] ❌ Rejecting "${dm.name}": ${rejectionReason}`);
        return false;
      }
      
      return true;
    });

    console.log(`[DECISION_MAKER_VALIDATOR] ✅ Final validation: ${validated.length}/${decisionMakers.length} decision maker(s) passed (${aiValidated.length - validated.length} rejected by client-side filters)`);

    // Cache the result
    VALIDATION_CACHE.set(cacheKey, {
      validated,
      expiresAt: Date.now() + CACHE_TTL
    });

    return validated;
  } catch (error) {
    console.log(`[DECISION_MAKER_VALIDATOR] ❌ AI validation failed: ${error.message}`);
    console.log(`[DECISION_MAKER_VALIDATOR] 🔄 Falling back to basic filtering...`);
    // Fallback to basic filtering
    const filtered = filterBasicNoise(decisionMakers);
    console.log(`[DECISION_MAKER_VALIDATOR] ✅ Basic filtering: ${filtered.length}/${decisionMakers.length} passed`);
    return filtered;
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

  const filtered = decisionMakers.filter((dm, idx) => {
    const name = (dm.name || '').trim();
    let rejectionReason = null;
    
    if (!name) {
      rejectionReason = 'Missing name';
    } else if (name.length < 3) {
      rejectionReason = `Name too short (${name.length} chars)`;
    } else {
      // Reject if matches noise patterns
      const matchedPattern = noisePatterns.find(pattern => pattern.test(name));
      if (matchedPattern) {
        rejectionReason = `Matches noise pattern: ${matchedPattern}`;
      } else if (name === name.toUpperCase() && name.length > 5) {
        rejectionReason = 'Name is all caps (likely extracted wrong)';
      } else {
        // REJECT placeholder emails
        if (dm.email) {
          const emailLower = dm.email.toLowerCase();
          const matchedEmailPattern = placeholderEmailPatterns.find(pattern => pattern.test(emailLower));
          if (matchedEmailPattern) {
            rejectionReason = `Placeholder email: ${dm.email}`;
          }
        }
        
        // Accept if looks like a person name (1-4 words, reasonable length)
        if (!rejectionReason) {
          const words = name.split(/\s+/);
          if (words.length >= 1 && words.length <= 4 && name.length <= 50) {
            return true; // Accept
          } else {
            rejectionReason = `Invalid word count (${words.length} words) or length (${name.length} chars)`;
          }
        }
      }
    }
    
    if (rejectionReason) {
      console.log(`[DECISION_MAKER_VALIDATOR] ❌ Basic filter rejected "${name}": ${rejectionReason}`);
      return false;
    }
    
    return true;
  });
  
  console.log(`[DECISION_MAKER_VALIDATOR] ✅ Basic filtering: ${filtered.length}/${decisionMakers.length} passed`);
  return filtered;
}

