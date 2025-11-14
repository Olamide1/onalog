import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Enrich lead data with AI predictions
 */
export async function enrichLead(leadData) {
  try {
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
    
    return {
      businessSummary: enrichment.businessSummary || '',
      companySize: enrichment.companySize || 'unknown',
      revenueBracket: enrichment.revenueBracket || 'unknown',
      industry: enrichment.industry || 'unknown',
      emailPattern: enrichment.emailPattern || '',
      contactRelevance: enrichment.contactRelevance || 50,
      signalStrength: enrichment.signalStrength || 50,
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
      enrichedAt: new Date()
    };
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
Search Context: ${searchQuery}
${icpDescription ? `ICP: ${icpDescription}` : ''}

Provide JSON with:
{
  "intro": "One-line introduction (max 100 chars)",
  "whatsapp": "WhatsApp opener message (friendly, concise)",
  "email": "Email subject and body (professional, brief)",
  "callScript": "30-second call script"
}`;
}

