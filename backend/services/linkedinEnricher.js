import OpenAI from 'openai';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { extractEmployeeCountFromLinkedIn, getEmployeeCountRange } from '../utils/employeeCountExtractor.js';
import { normalizeJobTitle, getSeniorityLevel, extractDepartment } from '../utils/jobTitleNormalizer.js';

dotenv.config();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

/**
 * Enrich lead with LinkedIn contact information
 * Uses AI to suggest key decision makers based on company information
 */
export async function enrichLinkedInContacts(leadData) {
  try {
    console.log(`[LINKEDIN] Enriching contacts for: ${leadData.companyName}`);
    
    // If we have a LinkedIn company URL, try to extract info
    let linkedinCompanyData = null;
    if (leadData.socials?.linkedin) {
      try {
        linkedinCompanyData = await extractLinkedInCompanyInfo(leadData.socials.linkedin);
      } catch (error) {
        console.log(`[LINKEDIN] Could not extract from LinkedIn URL: ${error.message}`);
      }
    }
    
    // Use AI to suggest key contacts (but prefer real names from website if available)
    const suggestedContacts = await suggestKeyContacts({
      companyName: leadData.companyName,
      website: leadData.website,
      aboutText: leadData.aboutText,
      industry: leadData.enrichment?.industry,
      companySize: leadData.enrichment?.companySize,
      linkedinCompanyData: linkedinCompanyData,
      existingDecisionMakers: leadData.decisionMakers || [] // Pass real names from website
    });
    
    return {
      contacts: suggestedContacts,
      linkedinCompanyUrl: leadData.socials?.linkedin || null,
      employeeCount: linkedinCompanyData?.employeeCount || null,
      employeeCountRange: linkedinCompanyData?.employeeCountRange || null,
      foundedYear: linkedinCompanyData?.foundedYear || null,
      enrichedAt: new Date()
    };
    
  } catch (error) {
    console.error('[LINKEDIN] ❌ Enrichment error:', error.message);
    return {
      contacts: [],
      linkedinCompanyUrl: leadData.socials?.linkedin || null,
      enrichedAt: new Date()
    };
  }
}

/**
 * Extract basic info from LinkedIn company page (if accessible)
 */
async function extractLinkedInCompanyInfo(linkedinUrl) {
  try {
    // Clean LinkedIn URL
    let cleanUrl = linkedinUrl;
    if (linkedinUrl.includes('/company/')) {
      const match = linkedinUrl.match(/\/company\/([^\/\?]+)/);
      if (match) {
        cleanUrl = `https://www.linkedin.com/company/${match[1]}`;
      }
    }
    
    console.log(`[LINKEDIN] Fetching company page: ${cleanUrl}`);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    // Read HTML with timeout (should be fast, but add safety)
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract employee count using enhanced utility
    const employeeCountNum = extractEmployeeCountFromLinkedIn(html);
    const employeeCountRange = employeeCountNum ? getEmployeeCountRange(employeeCountNum) : null;
    
    // Extract founded year
    const foundedYear = extractFoundedYear($, html);
    
    // Try to extract company info from meta tags
    const companyInfo = {
      name: $('meta[property="og:title"]').attr('content') || 
            $('title').text().replace(' | LinkedIn', ''),
      description: $('meta[property="og:description"]').attr('content') || 
                   $('meta[name="description"]').attr('content') || '',
      employeeCount: employeeCountNum,
      employeeCountRange: employeeCountRange,
      foundedYear: foundedYear,
      location: extractLocation($)
    };
    
    return companyInfo;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`[LINKEDIN] Request timeout while fetching company page`);
    } else {
      console.log(`[LINKEDIN] Could not extract company info: ${error.message}`);
    }
    return null;
  }
}

/**
 * Extract founded year from LinkedIn page
 */
function extractFoundedYear($, html) {
  try {
    // Look for founded year in various formats
    const text = html || $('body').text();
    
    // Pattern 1: "Founded 2020" or "Established 2020"
    const foundedPattern = /(?:founded|established|since|started)\s+(?:in\s+)?(\d{4})/i;
    const foundedMatch = text.match(foundedPattern);
    if (foundedMatch) {
      const year = parseInt(foundedMatch[1], 10);
      if (!isNaN(year) && year >= 1800 && year <= new Date().getFullYear()) {
        return year;
      }
    }
    
    // Pattern 2: Look in structured data
    const structuredMatch = text.match(/"foundingDate"\s*:\s*"?(\d{4})"?/i);
    if (structuredMatch) {
      const year = parseInt(structuredMatch[1], 10);
      if (!isNaN(year) && year >= 1800 && year <= new Date().getFullYear()) {
        return year;
      }
    }
    
    // Pattern 3: Look for date in company description
    const descMatch = text.match(/(?:since|from|established|founded)\s+(\d{4})/i);
    if (descMatch) {
      const year = parseInt(descMatch[1], 10);
      if (!isNaN(year) && year >= 1800 && year <= new Date().getFullYear()) {
        return year;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract location from LinkedIn page
 */
function extractLocation($) {
  const location = $('meta[property="og:locality"]').attr('content') ||
                   $('[data-test-id="company-location"]').text() ||
                   $('.org-top-card-summary-info-list__info-item').first().text();
  
  return location ? location.trim() : null;
}

/**
 * Use AI to suggest key decision makers and contacts
 */
async function suggestKeyContacts(companyData) {
  try {
    // CRITICAL: If no real decision makers were extracted, return empty array - never invent names
    const existingDecisionMakers = companyData.existingDecisionMakers || [];
    if (existingDecisionMakers.length === 0) {
      console.log('[LINKEDIN] No real decision makers found - returning empty array (no fake names)');
      return [];
    }
    
    if (!openai) {
      console.warn('[LINKEDIN] OpenAI not configured - returning existing decision makers as-is');
      // Return existing decision makers formatted
      return existingDecisionMakers.map(dm => ({
        name: dm.name,
        title: dm.title || 'Executive',
        normalizedTitle: dm.title || 'Executive',
        seniority: getSeniorityLevel(dm.title || 'Executive'),
        department: extractDepartment(dm.title || 'Executive') || 'General',
        relevance: 95,
        suggestedEmail: dm.email || null,
        linkedinSearchQuery: `${dm.name} ${companyData.companyName} LinkedIn`,
        notes: 'Real contact extracted from company website'
      }));
    }
    
    const prompt = buildContactSuggestionPrompt(companyData);
    
    // If prompt is null, it means no real decision makers - return empty
    if (!prompt) {
      return [];
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a contact formatter. Format existing decision makers into structured JSON. NEVER invent or create new names - only use the exact names provided.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1 // Lower temperature to ensure exact name matching
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    const contacts = result.contacts || [];
    
    // CRITICAL: Filter out generic placeholder names
    const genericNames = [
      'jane doe', 'john smith', 'emily johnson', 'bob johnson', 'sarah williams',
      'michael brown', 'david jones', 'mary wilson', 'robert taylor', 'jennifer davis',
      'james johnson', 'lisa anderson', 'william martinez', 'patricia thomas',
      'ceo/founder', 'founder/ceo', 'owner/founder', 'business development manager',
      'operations director', 'operations manager'
    ];
    
    // Validate and format contacts
    const filteredContacts = contacts
      .filter(contact => {
        if (!contact.name || !contact.title) return false;
        
        // Reject ONLY obvious generic placeholder names (exact matches)
        const nameLower = contact.name.toLowerCase().trim();
        if (genericNames.some(generic => nameLower === generic)) {
          console.log(`[LINKEDIN] ⚠️  Rejected exact generic name match: ${contact.name}`);
          return false;
        }
        
        // Reject if name is exactly the same as title (e.g., "CEO/Founder" as name)
        if (nameLower === contact.title.toLowerCase().trim()) {
          console.log(`[LINKEDIN] ⚠️  Rejected name that's exactly the title: ${contact.name}`);
          return false;
        }
        
        // Be more lenient - allow names that contain "/" if they're not exact generic matches
        // This allows for names like "John/CEO" which might be realistic in some contexts
        
        return true;
      })
      .map(contact => {
        const normalizedTitle = normalizeJobTitle(contact.title) || contact.title;
        const seniority = getSeniorityLevel(contact.title);
        const department = extractDepartment(contact.title) || contact.department || 'General';
        
        return {
          name: contact.name,
          title: contact.title,
          normalizedTitle: normalizedTitle,
          seniority: seniority,
          department: department,
          relevance: contact.relevance || 70,
          suggestedEmail: contact.suggestedEmail || null,
          linkedinSearchQuery: `${contact.name} ${companyData.companyName} LinkedIn`,
          notes: contact.notes || ''
        };
      })
      .slice(0, 5); // Limit to top 5 contacts
    
    // CRITICAL: If all contacts were filtered out, return empty array
    // We should NEVER invent fake names - only use real decision makers from extraction
    if (filteredContacts.length === 0) {
      console.log(`[LINKEDIN] ⚠️  No real contacts found - returning empty array (no fake names)`);
      return [];
    }
    
    return filteredContacts;
    
  } catch (error) {
    console.error('[LINKEDIN] ❌ AI contact suggestion error:', error.message);
    // Return default suggestions based on company size
    return generateDefaultContacts(companyData);
  }
}

/**
 * Build prompt for contact suggestions
 */
function buildContactSuggestionPrompt(companyData) {
  const existingDecisionMakers = companyData.existingDecisionMakers || [];
  const existingNames = existingDecisionMakers.length > 0 
    ? existingDecisionMakers.map(dm => `${dm.name || 'Unknown'} (${dm.title || 'Unknown'})`).join(', ')
    : 'None found';
  
  // CRITICAL: If we have real decision makers from extraction, ONLY return those. Never invent names.
  if (existingDecisionMakers.length === 0) {
    // No real decision makers found - return empty array, don't invent fake ones
    return null; // Signal to return empty array
  }
  
  return `You are a contact formatter. Format the EXISTING decision makers provided below into a structured JSON response.

Company: ${companyData.companyName}
Website: ${companyData.website || 'Not provided'}

EXISTING Decision Makers (REAL names - DO NOT change or invent):
${existingNames}

CRITICAL RULES:
1. Return ONLY the decision makers listed above - EXACT names and titles as provided
2. DO NOT invent, guess, or create any new names
3. DO NOT modify the names or titles - use them exactly as provided
4. If a name is missing or invalid, skip that contact

Provide a JSON response with:
{
  "contacts": [
    {
      "name": "EXACT name from list above",
      "title": "EXACT title from list above",
      "department": "Department based on title (e.g., Sales, Marketing, Operations, Executive)",
      "relevance": 95,
      "suggestedEmail": null,
      "notes": "Real contact extracted from company website"
    }
  ]
}

Return ALL decision makers from the list above, using their exact names and titles.`;
}

/**
 * Generate default contact suggestions when AI fails
 */
function generateDefaultContacts(companyData) {
  const contacts = [];
  const companySize = companyData.companySize || 'small';
  
  // Base contacts on company size
  if (companySize === 'large') {
    contacts.push(
      { name: 'CEO/Founder', title: 'Chief Executive Officer', department: 'Executive', relevance: 95, notes: 'Top decision maker' },
      { name: 'Business Development Manager', title: 'Business Development Manager', department: 'Sales', relevance: 85, notes: 'Handles partnerships and growth' },
      { name: 'Operations Director', title: 'Operations Director', department: 'Operations', relevance: 75, notes: 'Manages day-to-day operations' }
    );
  } else if (companySize === 'medium') {
    contacts.push(
      { name: 'Founder/CEO', title: 'Founder or CEO', department: 'Executive', relevance: 90, notes: 'Primary decision maker' },
      { name: 'Operations Manager', title: 'Operations Manager', department: 'Operations', relevance: 80, notes: 'Key operational contact' }
    );
  } else {
    contacts.push(
      { name: 'Owner/Founder', title: 'Owner or Founder', department: 'Executive', relevance: 95, notes: 'Main decision maker for small business' }
    );
  }
  
  return contacts.map(contact => {
    const normalizedTitle = normalizeJobTitle(contact.title) || contact.title;
    const seniority = getSeniorityLevel(contact.title);
    const department = extractDepartment(contact.title) || contact.department || 'General';
    
    return {
      ...contact,
      normalizedTitle: normalizedTitle,
      seniority: seniority,
      department: department,
      suggestedEmail: null,
      linkedinSearchQuery: `${contact.title} ${companyData.companyName} LinkedIn`
    };
  });
}

