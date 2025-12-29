import express from 'express';
import Lead from '../models/Lead.js';
import createCsvWriter from 'csv-writer';
import XLSX from 'xlsx';
import { Readable } from 'stream';

const router = express.Router();

/**
 * Helper function to format lead data for export
 * Returns a consistent object structure for both CSV and Excel
 */
function formatLeadForExport(lead) {
  // Format emails with deliverability
  const emails = (lead.emails || []).map(e => {
    const email = e.email || '';
    const deliverability = e.deliverability?.status || '';
    const score = e.deliverability?.score || '';
    return deliverability ? `${email} (${deliverability}${score ? ` ${score}` : ''})` : email;
  });
  
  // Format phone numbers
  const phones = (lead.phoneNumbers || []).map(p => p.formatted || p.phone || '').filter(Boolean);
  
  // Format decision makers
  const decisionMakers = (lead.decisionMakers || []).map(dm => {
    const parts = [dm.name || ''];
    if (dm.title) parts.push(`(${dm.title})`);
    if (dm.email) parts.push(`- ${dm.email}`);
    return parts.join(' ');
  });
  
  // Format LinkedIn contacts
  const linkedinContacts = (lead.enrichment?.linkedinContacts?.contacts || []).map(contact => {
    const parts = [contact.name || ''];
    if (contact.title) parts.push(`(${contact.title})`);
    if (contact.suggestedEmail) parts.push(`- ${contact.suggestedEmail}`);
    if (contact.seniority) parts.push(`[${contact.seniority}]`);
    return parts.join(' ');
  });
  
  // Primary decision maker (first one)
  const primaryDM = lead.decisionMakers?.[0] || null;
  
  // Structured location
  const location = lead.enrichment?.location || {};
  
  // Employee count formatting
  let employeeCount = '';
  if (lead.enrichment?.employeeCount && typeof lead.enrichment.employeeCount === 'number') {
    employeeCount = lead.enrichment.employeeCount.toString();
  } else if (lead.enrichment?.employeeCountRange) {
    employeeCount = lead.enrichment.employeeCountRange;
  }
  
  // Hiring signals
  const hiringSignals = lead.enrichment?.hiringSignals || {};
  const isHiring = hiringSignals.isHiring ? 'Yes' : (hiringSignals.isHiring === false ? 'No' : '');
  
  return {
    // Basic company info
    companyName: lead.companyName || '',
    website: lead.website || '',
    about: lead.enrichment?.businessSummary || lead.aboutText || '',
    
    // Contact info - primary
    primaryEmail: lead.emails?.[0]?.email || '',
    primaryEmailDeliverability: lead.emails?.[0]?.deliverability?.status || '',
    primaryEmailScore: lead.emails?.[0]?.deliverability?.score || '',
    allEmails: emails.join('; '),
    primaryPhone: phones[0] || '',
    allPhones: phones.join('; '),
    whatsapp: lead.whatsappLinks?.[0] || '',
    allWhatsApp: (lead.whatsappLinks || []).join('; '),
    
    // Location
    location: lead.address || '',
    locationCity: location.city || '',
    locationState: location.state || '',
    locationCountry: location.country || '',
    locationFormatted: location.formatted || lead.address || '',
    
    // Decision makers
    primaryDecisionMakerName: primaryDM?.name || '',
    primaryDecisionMakerTitle: primaryDM?.title || '',
    primaryDecisionMakerEmail: primaryDM?.email || '',
    primaryDecisionMakerSource: primaryDM?.source || '',
    primaryDecisionMakerConfidence: primaryDM?.confidence ? `${Math.round(primaryDM.confidence)}%` : '',
    allDecisionMakers: decisionMakers.join('; '),
    decisionMakerCount: (lead.decisionMakers || []).length,
    
    // LinkedIn contacts
    linkedinContacts: linkedinContacts.join('; '),
    linkedinContactsCount: linkedinContacts.length,
    linkedinCompanyUrl: lead.enrichment?.linkedinContacts?.linkedinCompanyUrl || '',
    
    // Enrichment data
    industry: lead.enrichment?.industry || '',
    companySize: lead.enrichment?.companySize || '',
    employeeCount: employeeCount,
    revenueBracket: lead.enrichment?.revenueBracket || '',
    foundedYear: lead.enrichment?.foundedYear || '',
    emailPattern: lead.enrichment?.emailPattern || '',
    
    // Hiring signals
    isHiring: isHiring,
    hasCareersPage: hiringSignals.hasCareersPage ? 'Yes' : (hiringSignals.hasCareersPage === false ? 'No' : ''),
    hasJobPostings: hiringSignals.hasJobPostings ? 'Yes' : (hiringSignals.hasJobPostings === false ? 'No' : ''),
    
    // Scores
    signalStrength: lead.enrichment?.signalStrength || 0,
    verificationScore: lead.enrichment?.verificationScore || '',
    qualityScore: lead.qualityScore || '',
    contactRelevance: lead.enrichment?.contactRelevance || '',
    
    // Social media
    linkedin: lead.socials?.linkedin || '',
    twitter: lead.socials?.twitter || '',
    facebook: lead.socials?.facebook || '',
    instagram: lead.socials?.instagram || '',
    
    // Metadata
    distanceKm: lead.distanceKm || '',
    categorySignals: (lead.categorySignals || []).join('; ')
  };
}

/**
 * GET /api/export/csv - Export leads as CSV
 */
router.get('/csv', async (req, res) => {
  try {
    const { searchId, leadIds } = req.query;
    
    const query = { isDuplicate: false };
    if (searchId) {
      query.searchId = searchId;
    }
    if (leadIds) {
      const ids = leadIds.split(',');
      query._id = { $in: ids };
    }
    
    const leads = await Lead.find(query)
      .sort({ 'enrichment.signalStrength': -1 })
      .limit(10000);
    
    const csvWriter = createCsvWriter.createObjectCsvStringifier({
      header: [
        // Basic company info
        { id: 'companyName', title: 'Company Name' },
        { id: 'website', title: 'Website' },
        { id: 'about', title: 'About' },
        
        // Contact info - primary
        { id: 'primaryEmail', title: 'Primary Email' },
        { id: 'primaryEmailDeliverability', title: 'Email Deliverability Status' },
        { id: 'primaryEmailScore', title: 'Email Deliverability Score' },
        { id: 'allEmails', title: 'All Emails' },
        { id: 'primaryPhone', title: 'Primary Phone' },
        { id: 'allPhones', title: 'All Phones' },
        { id: 'whatsapp', title: 'WhatsApp' },
        { id: 'allWhatsApp', title: 'All WhatsApp Links' },
        
        // Location
        { id: 'location', title: 'Location (Raw)' },
        { id: 'locationCity', title: 'City' },
        { id: 'locationState', title: 'State' },
        { id: 'locationCountry', title: 'Country' },
        { id: 'locationFormatted', title: 'Location (Formatted)' },
        
        // Decision makers
        { id: 'primaryDecisionMakerName', title: 'Decision Maker Name' },
        { id: 'primaryDecisionMakerTitle', title: 'Decision Maker Title' },
        { id: 'primaryDecisionMakerEmail', title: 'Decision Maker Email' },
        { id: 'primaryDecisionMakerSource', title: 'Decision Maker Source' },
        { id: 'primaryDecisionMakerConfidence', title: 'Decision Maker Confidence' },
        { id: 'allDecisionMakers', title: 'All Decision Makers' },
        { id: 'decisionMakerCount', title: 'Decision Maker Count' },
        
        // LinkedIn contacts
        { id: 'linkedinContacts', title: 'LinkedIn Suggested Contacts' },
        { id: 'linkedinContactsCount', title: 'LinkedIn Contacts Count' },
        { id: 'linkedinCompanyUrl', title: 'LinkedIn Company URL' },
        
        // Enrichment data
        { id: 'industry', title: 'Industry' },
        { id: 'companySize', title: 'Company Size' },
        { id: 'employeeCount', title: 'Employee Count' },
        { id: 'revenueBracket', title: 'Revenue Bracket' },
        { id: 'foundedYear', title: 'Founded Year' },
        { id: 'emailPattern', title: 'Email Pattern' },
        
        // Hiring signals
        { id: 'isHiring', title: 'Is Hiring' },
        { id: 'hasCareersPage', title: 'Has Careers Page' },
        { id: 'hasJobPostings', title: 'Has Job Postings' },
        
        // Scores
        { id: 'signalStrength', title: 'Signal Strength Score' },
        { id: 'verificationScore', title: 'Verification Score' },
        { id: 'qualityScore', title: 'Quality Score' },
        { id: 'contactRelevance', title: 'Contact Relevance' },
        
        // Social media
        { id: 'linkedin', title: 'LinkedIn' },
        { id: 'twitter', title: 'Twitter' },
        { id: 'facebook', title: 'Facebook' },
        { id: 'instagram', title: 'Instagram' },
        
        // Metadata
        { id: 'distanceKm', title: 'Distance (km)' },
        { id: 'categorySignals', title: 'Category Signals' }
      ]
    });
    
    const records = leads.map(lead => formatLeadForExport(lead));
    
    const csvString = csvWriter.getHeaderString() + csvWriter.stringifyRecords(records);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="onalog-leads-${Date.now()}.csv"`);
    res.send(csvString);
    
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/export/excel - Export leads as Excel
 */
router.get('/excel', async (req, res) => {
  try {
    const { searchId, leadIds } = req.query;
    
    const query = { isDuplicate: false };
    if (searchId) {
      query.searchId = searchId;
    }
    if (leadIds) {
      const ids = leadIds.split(',');
      query._id = { $in: ids };
    }
    
    const leads = await Lead.find(query)
      .sort({ 'enrichment.signalStrength': -1 })
      .limit(10000);
    
    // Format records with proper column names for Excel
    const formattedLeads = leads.map(lead => formatLeadForExport(lead));
    const records = formattedLeads.map(lead => ({
      // Basic company info
      'Company Name': lead.companyName,
      'Website': lead.website,
      'About': lead.about,
      
      // Contact info - primary
      'Primary Email': lead.primaryEmail,
      'Email Deliverability Status': lead.primaryEmailDeliverability,
      'Email Deliverability Score': lead.primaryEmailScore,
      'All Emails': lead.allEmails,
      'Primary Phone': lead.primaryPhone,
      'All Phones': lead.allPhones,
      'WhatsApp': lead.whatsapp,
      'All WhatsApp Links': lead.allWhatsApp,
      
      // Location
      'Location (Raw)': lead.location,
      'City': lead.locationCity,
      'State': lead.locationState,
      'Country': lead.locationCountry,
      'Location (Formatted)': lead.locationFormatted,
      
      // Decision makers
      'Decision Maker Name': lead.primaryDecisionMakerName,
      'Decision Maker Title': lead.primaryDecisionMakerTitle,
      'Decision Maker Email': lead.primaryDecisionMakerEmail,
      'Decision Maker Source': lead.primaryDecisionMakerSource,
      'Decision Maker Confidence': lead.primaryDecisionMakerConfidence,
      'All Decision Makers': lead.allDecisionMakers,
      'Decision Maker Count': lead.decisionMakerCount,
      
      // LinkedIn contacts
      'LinkedIn Suggested Contacts': lead.linkedinContacts,
      'LinkedIn Contacts Count': lead.linkedinContactsCount,
      'LinkedIn Company URL': lead.linkedinCompanyUrl,
      
      // Enrichment data
      'Industry': lead.industry,
      'Company Size': lead.companySize,
      'Employee Count': lead.employeeCount,
      'Revenue Bracket': lead.revenueBracket,
      'Founded Year': lead.foundedYear,
      'Email Pattern': lead.emailPattern,
      
      // Hiring signals
      'Is Hiring': lead.isHiring,
      'Has Careers Page': lead.hasCareersPage,
      'Has Job Postings': lead.hasJobPostings,
      
      // Scores
      'Signal Strength Score': lead.signalStrength,
      'Verification Score': lead.verificationScore,
      'Quality Score': lead.qualityScore,
      'Contact Relevance': lead.contactRelevance,
      
      // Social media
      'LinkedIn': lead.linkedin,
      'Twitter': lead.twitter,
      'Facebook': lead.facebook,
      'Instagram': lead.instagram,
      
      // Metadata
      'Distance (km)': lead.distanceKm,
      'Category Signals': lead.categorySignals
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(records);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="onalog-leads-${Date.now()}.xlsx"`);
    res.send(buffer);
    
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

