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
    if (!openai) {
      console.warn('[LINKEDIN] OpenAI not configured, using default contacts');
      return generateDefaultContacts(companyData);
    }
    
    const prompt = buildContactSuggestionPrompt(companyData);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a B2B contact research assistant. Based on company information, suggest key decision makers and contacts that would be relevant for B2B outreach. Return JSON only with an array of suggested contacts.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    const contacts = result.contacts || [];
    
    // Validate and format contacts
    return contacts
      .filter(contact => contact.name && contact.title)
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
  const existingNames = companyData.existingDecisionMakers?.map(dm => `${dm.name} (${dm.title})`).join(', ') || 'None found';
  
  return `Based on this company information, suggest 3-5 key decision makers and contacts that would be relevant for B2B sales outreach:

Company: ${companyData.companyName}
Website: ${companyData.website || 'Not provided'}
Industry: ${companyData.industry || 'Unknown'}
Company Size: ${companyData.companySize || 'Unknown'}
About: ${companyData.aboutText || 'No description'}
${companyData.linkedinCompanyData ? `LinkedIn: ${companyData.linkedinCompanyData.employeeCount ? companyData.linkedinCompanyData.employeeCount + ' employees' : ''} in ${companyData.linkedinCompanyData.location || ''}` : ''}
Existing Decision Makers Found: ${existingNames}

IMPORTANT: If existing decision makers are listed above, prioritize using those REAL names and titles. Only suggest additional contacts if needed.

Provide a JSON response with:
{
  "contacts": [
    {
      "name": "Full name (e.g., John Smith)",
      "title": "Job title (e.g., CEO, Marketing Director, Operations Manager)",
      "department": "Department (e.g., Sales, Marketing, Operations, Executive)",
      "relevance": 0-100 score for how relevant this contact is for B2B outreach,
      "suggestedEmail": "Guessed email pattern (e.g., john.smith@company.com) or null",
      "notes": "Why this contact is relevant (1 sentence)"
    }
  ]
}

Focus on:
- Decision makers (CEO, Founder, Director, Manager)
- People who would handle partnerships, sales, or business development
- Contacts relevant to the company's industry and size
- Make names realistic but generic (don't use real people's names unless certain)

IMPORTANT: If you see actual names in the company data, use those real names instead of generic ones.`;
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

