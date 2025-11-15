import OpenAI from 'openai';
import dotenv from 'dotenv';
import { enrichLinkedInContacts } from './linkedinEnricher.js';

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
    
    // Enrich with LinkedIn contacts
    let linkedinContacts = null;
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
    } catch (linkedinError) {
      console.log(`[ENRICH] ⚠️  LinkedIn enrichment failed: ${linkedinError.message}`);
    }
    
    // Generate emails for decision makers using email pattern
    const enrichedDecisionMakers = (leadData.decisionMakers || []).map(dm => {
      if (enrichment.emailPattern && dm.name) {
        // Generate email from name + pattern
        const email = generateEmailFromName(dm.name, enrichment.emailPattern, leadData.website);
        return {
          ...dm,
          email: email,
          source: dm.source === 'website' ? 'website' : 'ai_inferred'
        };
      }
      return dm;
    });
    
    return {
      businessSummary: enrichment.businessSummary || '',
      companySize: enrichment.companySize || 'unknown',
      revenueBracket: enrichment.revenueBracket || 'unknown',
      industry: enrichment.industry || 'unknown',
      emailPattern: enrichment.emailPattern || '',
      contactRelevance: enrichment.contactRelevance || 50,
      signalStrength: enrichment.signalStrength || 50,
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
      revenueBracket: 'unknown',
      industry: 'unknown',
      emailPattern: '',
      contactRelevance: 50,
      signalStrength: 50,
      linkedinContacts: null,
      decisionMakers: null,
      enrichedAt: new Date()
    };
  }
}

/**
 * Generate email address from name and email pattern
 */
function generateEmailFromName(name, emailPattern, website) {
  if (!name || !emailPattern || !website) return null;
  
  try {
    // Extract domain from website
    const domain = new URL(website).hostname.replace('www.', '');
    
    // Parse name into parts
    const nameParts = name.trim().split(/\s+/).filter(p => p.length > 0);
    if (nameParts.length === 0) return null;
    
    const firstName = nameParts[0].toLowerCase();
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    const firstInitial = firstName[0];
    const lastInitial = lastName[0];
    
    // Common email patterns
    let email = emailPattern
      .replace(/{firstname}/gi, firstName)
      .replace(/{lastname}/gi, lastName)
      .replace(/{firstinitial}/gi, firstInitial)
      .replace(/{lastinitial}/gi, lastInitial)
      .replace(/{firstname\.lastname}/gi, `${firstName}.${lastName}`)
      .replace(/{firstname_lastname}/gi, `${firstName}_${lastName}`)
      .replace(/{firstname-lastname}/gi, `${firstName}-${lastName}`)
      .replace(/{firstinitiallastname}/gi, `${firstInitial}${lastName}`)
      .replace(/{firstnamelastinitial}/gi, `${firstName}${lastInitial}`)
      .toLowerCase();
    
    // If pattern doesn't have domain, add it
    if (!email.includes('@')) {
      email = `${email}@${domain}`;
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
  "emailPattern": "guessed email pattern if missing (e.g., firstname.lastname@company.com)",
  "contactRelevance": 0-100 score for how relevant this lead is for B2B outreach,
  "signalStrength": 0-100 score for data quality and completeness
}`;
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

