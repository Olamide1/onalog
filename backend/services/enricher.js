import OpenAI from 'openai';
import dotenv from 'dotenv';
import { enrichLinkedInContacts } from './linkedinEnricher.js';
import { parseLocation } from '../utils/locationParser.js';
import { detectHiringSignals } from '../utils/hiringSignalDetector.js';
import { normalizeJobTitle, getSeniorityLevel, extractDepartment } from '../utils/jobTitleNormalizer.js';
import { getEmployeeCountRange, estimateEmployeeCountFromSize } from '../utils/employeeCountExtractor.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Enrich lead data with AI predictions
 */
export async function enrichLead(leadData) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[ENRICH] ⚠️  OPENAI_API_KEY not found in environment variables');
      throw new Error('OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.');
    }
    
    const prompt = buildEnrichmentPrompt(leadData);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a B2B lead enrichment assistant. Analyze business data and provide structured predictions about company size, revenue, industry, and contact relevance. Return JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    
    const enrichment = JSON.parse(response.choices[0].message.content);
    
    // Validate and clean email pattern - reject patterns with literal placeholder text
    if (enrichment.emailPattern) {
      const placeholderTerms = ['firstname', 'lastname', 'firstinitial', 'lastinitial'];
      
      // Fix: Check if pattern contains literal placeholder text (not in {placeholder} format)
      // Also check for mixed formats (both placeholder and literal)
      // A pattern like "firstname_{firstname}@example.com" should be rejected because
      // it has a literal "firstname" at the start, even though it also has {firstname}
      // Also reject patterns like "{firstname}.lastname" (mixed format)
      const hasLiteralPlaceholder = placeholderTerms.some(term => {
        const patternLower = enrichment.emailPattern.toLowerCase();
        
        // Check if term appears in the pattern
        if (!patternLower.includes(term)) {
          return false;
        }
        
        // Find all occurrences of the term in the pattern
        const termRegex = new RegExp(term, 'gi');
        let match;
        let foundLiteral = false;
        
        // Reset regex lastIndex to ensure we check from the start
        termRegex.lastIndex = 0;
        
        while ((match = termRegex.exec(enrichment.emailPattern)) !== null) {
          const matchIndex = match.index;
          const beforeChar = matchIndex > 0 ? enrichment.emailPattern[matchIndex - 1] : '';
          const afterChar = matchIndex + term.length < enrichment.emailPattern.length 
            ? enrichment.emailPattern[matchIndex + term.length] 
            : '';
          
          // Check if this occurrence is NOT wrapped in curly braces
          // It's literal if:
          // - It's at the start (no char before) OR the char before is not '{'
          // - AND it's at the end (no char after) OR the char after is not '}'
          const isAtStart = matchIndex === 0;
          const isAtEnd = matchIndex + term.length === enrichment.emailPattern.length;
          const notWrappedInBraces = (isAtStart || beforeChar !== '{') && (isAtEnd || afterChar !== '}');
          
          if (notWrappedInBraces) {
            foundLiteral = true;
            break;
          }
        }
        
        return foundLiteral;
      });
      
      // Fix: Also check for mixed formats (e.g., "{firstname}.lastname" or "firstname.{lastname}")
      // These should be rejected because they mix placeholder format with literal text
      const hasMixedFormat = placeholderTerms.some(term => {
        const pattern = enrichment.emailPattern;
        // Check if pattern has both {term} and literal term
        const hasPlaceholderFormat = pattern.includes(`{${term}}`);
        const hasLiteralTerm = new RegExp(`[^{]${term}[^}]`, 'i').test(pattern) || 
                              pattern.startsWith(term) || 
                              pattern.endsWith(term);
        
        return hasPlaceholderFormat && hasLiteralTerm;
      });
      
      if (hasLiteralPlaceholder || hasMixedFormat) {
        console.log(`[ENRICH] ⚠️  Rejected email pattern with ${hasLiteralPlaceholder ? 'literal' : 'mixed format'} placeholder text: ${enrichment.emailPattern}`);
        enrichment.emailPattern = null; // Reject invalid pattern
      }
    }
    
    // Enrich with LinkedIn contacts (this also extracts employee count and founded year)
    let linkedinContacts = null;
    let employeeCount = null;
    let employeeCountRange = null;
    let foundedYear = null;
    
    try {
      console.log('[ENRICH] Enriching LinkedIn contacts...');
      linkedinContacts = await enrichLinkedInContacts({
        companyName: leadData.companyName,
        website: leadData.website,
        aboutText: leadData.aboutText,
        socials: leadData.socials,
        decisionMakers: leadData.decisionMakers || [], // Pass extracted decision makers
        enrichment: {
          industry: enrichment.industry,
          companySize: enrichment.companySize
        }
      });
      console.log(`[ENRICH] ✅ Found ${linkedinContacts.contacts?.length || 0} suggested contacts`);
      
      // Extract employee count and founded year from LinkedIn data
      if (linkedinContacts) {
        employeeCount = linkedinContacts.employeeCount || null;
        employeeCountRange = linkedinContacts.employeeCountRange || null;
        foundedYear = linkedinContacts.foundedYear || null;
      }
    } catch (linkedinError) {
      console.log(`[ENRICH] ⚠️  LinkedIn enrichment failed: ${linkedinError.message}`);
    }
    
    // Try to get employee count - first from LinkedIn, then estimate from company size
    if (!employeeCount && enrichment.companySize && enrichment.companySize !== 'unknown') {
      // Estimate from company size if we have it
      const estimatedCount = estimateEmployeeCountFromSize(enrichment.companySize);
      if (estimatedCount) {
        employeeCount = estimatedCount;
        employeeCountRange = getEmployeeCountRange(estimatedCount);
      }
    }
    
    // Parse location
    const locationData = parseLocation(leadData.address, leadData.website);
    
    // Detect hiring signals
    let hiringSignals = {
      isHiring: false,
      hasCareersPage: false,
      hasJobPostings: false,
      detectedAt: new Date()
    };
    try {
      hiringSignals = await detectHiringSignals(leadData);
    } catch (hiringError) {
      console.log(`[ENRICH] ⚠️  Hiring signal detection failed: ${hiringError.message}`);
    }
    
    // Generate emails for decision makers using email pattern and normalize titles
    // CRITICAL FIX: Merge LinkedIn contacts into decision makers
    const allDecisionMakers = [...(leadData.decisionMakers || [])];
    
    // Add LinkedIn contacts as decision makers if available
    if (linkedinContacts && linkedinContacts.contacts && Array.isArray(linkedinContacts.contacts)) {
      const existingNames = new Set((leadData.decisionMakers || []).map(dm => (dm.name || '').toLowerCase()));
      for (const contact of linkedinContacts.contacts) {
        if (contact.name && !existingNames.has(contact.name.toLowerCase())) {
          allDecisionMakers.push({
            name: contact.name,
            title: contact.title || contact.role || 'Executive',
            email: contact.email || null,
            source: 'linkedin',
            confidence: 0.7
          });
          existingNames.add(contact.name.toLowerCase());
        }
      }
    }
    
    const enrichedDecisionMakers = allDecisionMakers.map(dm => {
      if (!dm.name) return null; // Skip invalid decision makers
      
      // Normalize job title
      const normalizedTitle = normalizeJobTitle(dm.title) || dm.title;
      const seniority = getSeniorityLevel(dm.title);
      const department = extractDepartment(dm.title);
      
      let email = dm.email || null;
      if (enrichment.emailPattern && dm.name && !email && leadData.website) {
        // Generate email from name + pattern
        email = generateEmailFromName(dm.name, enrichment.emailPattern, leadData.website);
      }
      
      return {
        name: dm.name,
        title: dm.title,
        normalizedTitle: normalizedTitle,
        seniority: seniority,
        department: department,
        email: email,
        source: dm.source || 'ai_inferred',
        confidence: dm.confidence || 0.75
      };
    }).filter(dm => dm !== null); // Remove null entries
    
    return {
      businessSummary: enrichment.businessSummary || '',
      companySize: enrichment.companySize || 'unknown',
      employeeCount: employeeCount || null,
      employeeCountRange: employeeCountRange || null,
      revenueBracket: enrichment.revenueBracket || 'unknown',
      industry: enrichment.industry || 'unknown',
      emailPattern: enrichment.emailPattern || '',
      contactRelevance: enrichment.contactRelevance || 50,
      signalStrength: enrichment.signalStrength || 50,
      foundedYear: foundedYear || null,
      location: locationData,
      hiringSignals: hiringSignals,
      linkedinContacts: linkedinContacts || null,
      decisionMakers: enrichedDecisionMakers.length > 0 ? enrichedDecisionMakers : null,
      enrichedAt: new Date()
    };
    
  } catch (error) {
    console.error('❌ Enrichment error:', error.message);
    // Return default enrichment on error
    return {
      businessSummary: '',
      companySize: 'unknown',
      employeeCount: null,
      employeeCountRange: null,
      revenueBracket: 'unknown',
      industry: 'unknown',
      emailPattern: '',
      contactRelevance: 50,
      signalStrength: 50,
      foundedYear: null,
      location: parseLocation(null, leadData?.website || null),
      hiringSignals: {
        isHiring: false,
        hasCareersPage: false,
        hasJobPostings: false,
        detectedAt: new Date()
      },
      linkedinContacts: null,
      decisionMakers: null,
      enrichedAt: new Date()
    };
  }
}

/**
 * Generate email address from name and email pattern
 */
export function generateEmailFromName(name, emailPattern, website) {
  if (!name || !emailPattern || !website) return null;
  
  try {
    // CRITICAL: Reject marketing copy, headings, and non-name text
    const marketingCopyPatterns = [
      /^(of|in|on|at|to|for|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|must|can)/i,
      /(book|schedule|order|buy|get|try|start|sign|register|login|subscribe|download|view|see|read|learn|explore|join|follow|contact|call|email|message|chat|support|help|now|today|boost|increase|improve|enhance|marketing|business|company|services|solutions|products|software|technology|digital|online|web|internet|social|media|content|blog|news|press|strategy|tactic|campaign|project|program|system|platform|tool|application|service|product|solution|feature|benefit|value|quality|performance|results|outcome|impact|effect|success|growth|revenue|sales|leads|customers|clients|partners|engages|drives|leads|guides|helps|supports|enables|empowers|transforms|revolutionizes|innovates|creates|builds|develops|delivers|provides|offers|sells|markets|promotes|advertises|audience|trends|day|night|morning|evening|afternoon)/i
    ];
    
    const nameLower = name.toLowerCase().trim();
    if (marketingCopyPatterns.some(pattern => pattern.test(nameLower))) {
      console.log(`[EMAIL_GEN] ⚠️  Rejected marketing copy as name: ${name}`);
      return null; // Reject marketing copy
    }
    
    // Reject if name doesn't look like a proper person name (must have at least 2 capitalized words)
    if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(name)) {
      console.log(`[EMAIL_GEN] ⚠️  Rejected invalid name pattern: ${name}`);
      return null;
    }
    
    // Extract domain from website
    const domain = new URL(website).hostname.replace('www.', '');
    
    // Fix: Remove title prefixes before extracting name parts
    // Common titles: Dr., Mr., Mrs., Ms., Prof., Professor, etc.
    const titlePrefixes = ['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'professor', 'sir', 'madam', 'lord', 'lady', 'rev', 'reverend', 'fr', 'father', 'sr', 'sister', 'brother'];
    let cleanedName = name.trim();
    
    // Remove title prefix if present (case-insensitive)
    for (const title of titlePrefixes) {
      const titleRegex = new RegExp(`^${title}\\.?\\s+`, 'i');
      if (titleRegex.test(cleanedName)) {
        cleanedName = cleanedName.replace(titleRegex, '').trim();
        break; // Only remove the first matching title
      }
    }
    
    // Parse name into parts - require at least first and last name
    const nameParts = cleanedName.split(/\s+/).filter(p => p.length > 0);
    if (nameParts.length < 2) {
      // Need at least first and last name to generate a proper email
      // Single names are not reliable for email generation
      return null;
    }
    
    const firstName = nameParts[0].toLowerCase().replace(/[^a-z]/g, ''); // Remove non-letters
    const lastName = nameParts[nameParts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
    
    // Validate we have actual names (not placeholders or single letters)
    if (!firstName || firstName.length < 2 || !lastName || lastName.length < 2) {
      return null;
    }
    
    const firstInitial = firstName[0];
    const lastInitial = lastName[0];
    
    // Common email patterns - handle both placeholder format and literal text
    // IMPORTANT: Replace composite patterns BEFORE individual terms to avoid partial replacements
    let email = emailPattern
      // Placeholder format replacements
      .replace(/{firstname}/gi, firstName)
      .replace(/{lastname}/gi, lastName)
      .replace(/{firstinitial}/gi, firstInitial)
      .replace(/{lastinitial}/gi, lastInitial)
      .replace(/{firstname\.lastname}/gi, `${firstName}.${lastName}`)
      .replace(/{firstname_lastname}/gi, `${firstName}_${lastName}`)
      .replace(/{firstname-lastname}/gi, `${firstName}-${lastName}`)
      .replace(/{firstinitiallastname}/gi, `${firstInitial}${lastName}`)
      .replace(/{firstnamelastinitial}/gi, `${firstName}${lastInitial}`)
      // Literal text replacements (common LLM mistakes)
      // Fix: Replace composite patterns FIRST, before individual terms
      // Otherwise, "firstname.lastname" becomes "john.lastname" then "john.smith",
      // and the composite pattern replacement never matches
      .replace(/firstname\.lastname/gi, `${firstName}.${lastName}`)
      .replace(/firstname_lastname/gi, `${firstName}_${lastName}`)
      .replace(/firstname-lastname/gi, `${firstName}-${lastName}`)
      // Replace composite patterns with initials (e.g., "firstinitial.lastname")
      .replace(/firstinitial\.lastname/gi, `${firstInitial}.${lastName}`)
      .replace(/firstinitial_lastname/gi, `${firstInitial}_${lastName}`)
      .replace(/firstinitial-lastname/gi, `${firstInitial}-${lastName}`)
      .replace(/firstname\.lastinitial/gi, `${firstName}.${lastInitial}`)
      .replace(/firstname_lastinitial/gi, `${firstName}_${lastInitial}`)
      .replace(/firstname-lastinitial/gi, `${firstName}-${lastInitial}`)
      .replace(/firstinitiallastname/gi, `${firstInitial}${lastName}`)
      .replace(/firstnamelastinitial/gi, `${firstName}${lastInitial}`)
      // Now replace individual terms (these won't interfere with composites anymore)
      .replace(/firstname/gi, firstName)
      .replace(/lastname/gi, lastName)
      .replace(/firstinitial/gi, firstInitial)
      .replace(/lastinitial/gi, lastInitial)
      .toLowerCase();
    
    // Validate email doesn't contain placeholder text
    const placeholderTerms = ['firstname', 'lastname', 'firstinitial', 'lastinitial', 'firstname.lastname', 'firstname_lastname', 'firstname-lastname'];
    if (placeholderTerms.some(term => email.includes(term))) {
      // Still has placeholder text - don't return it
      return null;
    }
    
    // If pattern doesn't have domain, add it
    if (!email.includes('@')) {
      email = `${email}@${domain}`;
    }
    
    // Final validation: ensure email looks valid
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    if (!emailRegex.test(email)) {
      return null;
    }
    
    return email;
  } catch (e) {
    return null;
  }
}

/**
 * Build enrichment prompt
 */
function buildEnrichmentPrompt(leadData) {
  const context = {
    companyName: leadData.companyName || 'Unknown',
    website: leadData.website || 'Not provided',
    aboutText: leadData.aboutText || 'No description available',
    categorySignals: leadData.categorySignals || [],
    emails: leadData.emails?.length || 0,
    phoneNumbers: leadData.phoneNumbers?.length || 0,
    socials: leadData.socials || {}
  };
  
  return `Analyze this B2B lead data and provide enrichment:

Company: ${context.companyName}
Website: ${context.website}
About: ${context.aboutText}
Categories: ${context.categorySignals.join(', ') || 'None'}
Contacts: ${context.emails} emails, ${context.phoneNumbers} phones
Socials: ${Object.keys(context.socials).filter(k => context.socials[k]).join(', ') || 'None'}

Provide a JSON response with:
{
  "businessSummary": "2-3 sentence summary of what this business does",
  "companySize": "micro|small|medium|large",
  "revenueBracket": "0-50k|50k-200k|200k-1m|1m+|unknown",
  "industry": "primary industry category",
  "emailPattern": "guessed email pattern if missing. Use placeholder format with curly braces: {firstname}.{lastname}@domain.com or {firstinitial}{lastname}@domain.com. NEVER use literal text like 'firstname.lastname' - always use {firstname} and {lastname} placeholders. If uncertain, return null.",
  "contactRelevance": 0-100 score for how relevant this lead is for B2B outreach,
  "signalStrength": 0-100 score for data quality and completeness
}

IMPORTANT for emailPattern:
- Use {firstname}, {lastname}, {firstinitial}, {lastinitial} as placeholders
- Examples: "{firstname}.{lastname}@domain.com", "{firstinitial}{lastname}@domain.com"
- NEVER return literal text like "firstname.lastname@domain.com"
- If you cannot determine a pattern, return null`;
}

/**
 * Generate outreach lines
 */
export async function generateOutreachLines(leadData, searchQuery, icpDescription = null) {
  try {
    const prompt = buildOutreachPrompt(leadData, searchQuery, icpDescription);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a B2B outreach assistant. Generate concise, professional outreach messages for African B2B sales. Return JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7
    });
    
    const outreach = JSON.parse(response.choices[0].message.content);
    
    return {
      intro: outreach.intro || '',
      whatsapp: outreach.whatsapp || '',
      email: outreach.email || '',
      callScript: outreach.callScript || ''
    };
    
  } catch (error) {
    console.error('❌ Outreach generation error:', error.message);
    return {
      intro: `Hi, I noticed ${leadData.companyName} and thought you might be interested in...`,
      whatsapp: `Hi! I came across your business and wanted to reach out about...`,
      email: `Subject: Partnership opportunity\n\nHi there,\n\nI noticed ${leadData.companyName}...`,
      callScript: `Hi, this is [Your Name] calling about a potential partnership opportunity...`
    };
  }
}

/**
 * Build outreach prompt
 */
function buildOutreachPrompt(leadData, searchQuery, icpDescription) {
  return `Generate B2B outreach messages for:

Company: ${leadData.companyName}
Industry: ${leadData.enrichment?.industry || 'Unknown'}
Website: ${leadData.website || 'Unknown'}
Location: ${leadData.location || 'Unknown'}
About: ${leadData.aboutText ? leadData.aboutText.slice(0, 400) : 'N/A'}
Signals: ${(leadData.categorySignals || []).slice(0,5).join(', ')}
Search Context: ${searchQuery}
${icpDescription ? `ICP: ${icpDescription}` : ''}

Provide JSON with:
{
  "intro": "One-line introduction (max 100 chars)",
  "whatsapp": "WhatsApp opener message (friendly, concise)",
  "email": { "subject": "short subject", "body": "2-4 sentence body. Reference company context above." },
  "callScript": "30-second call script"
}`;
}

