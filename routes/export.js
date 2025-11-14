import express from 'express';
import Lead from '../models/Lead.js';
import createCsvWriter from 'csv-writer';
import XLSX from 'xlsx';
import { Readable } from 'stream';

const router = express.Router();

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
        { id: 'companyName', title: 'Company Name' },
        { id: 'website', title: 'Website' },
        { id: 'primaryEmail', title: 'Email' },
        { id: 'primaryPhone', title: 'Phone' },
        { id: 'whatsapp', title: 'WhatsApp' },
        { id: 'location', title: 'Location' },
        { id: 'industry', title: 'Industry' },
        { id: 'companySize', title: 'Company Size' },
        { id: 'revenueBracket', title: 'Revenue Bracket' },
        { id: 'signalStrength', title: 'Score' },
        { id: 'linkedin', title: 'LinkedIn' },
        { id: 'twitter', title: 'Twitter' },
        { id: 'about', title: 'About' }
      ]
    });
    
    const records = leads.map(lead => ({
      companyName: lead.companyName || '',
      website: lead.website || '',
      primaryEmail: lead.emails?.[0]?.email || '',
      primaryPhone: lead.phoneNumbers?.[0]?.formatted || lead.phoneNumbers?.[0]?.phone || '',
      whatsapp: lead.whatsappLinks?.[0] || '',
      location: lead.address || '',
      industry: lead.enrichment?.industry || '',
      companySize: lead.enrichment?.companySize || '',
      revenueBracket: lead.enrichment?.revenueBracket || '',
      signalStrength: lead.enrichment?.signalStrength || 0,
      linkedin: lead.socials?.linkedin || '',
      twitter: lead.socials?.twitter || '',
      about: lead.enrichment?.businessSummary || lead.aboutText || ''
    }));
    
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
    
    const records = leads.map(lead => ({
      'Company Name': lead.companyName || '',
      'Website': lead.website || '',
      'Email': lead.emails?.[0]?.email || '',
      'Phone': lead.phoneNumbers?.[0]?.formatted || lead.phoneNumbers?.[0]?.phone || '',
      'WhatsApp': lead.whatsappLinks?.[0] || '',
      'Location': lead.address || '',
      'Industry': lead.enrichment?.industry || '',
      'Company Size': lead.enrichment?.companySize || '',
      'Revenue Bracket': lead.enrichment?.revenueBracket || '',
      'Score': lead.enrichment?.signalStrength || 0,
      'LinkedIn': lead.socials?.linkedin || '',
      'Twitter': lead.socials?.twitter || '',
      'Facebook': lead.socials?.facebook || '',
      'About': lead.enrichment?.businessSummary || lead.aboutText || ''
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

