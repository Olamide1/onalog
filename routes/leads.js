import express from 'express';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { generateOutreachLines } from '../services/enricher.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

/**
 * GET /api/leads - List leads with filters and pagination (filtered by company)
 */
router.get('/', async (req, res) => {
  try {
    // Get user info if token provided
    let userCompanyId = null;
    let userId = null;
    let shareLeads = false;
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.verify(token, secret);
        const user = await User.findById(decoded.userId).populate('companyId');
        if (user && user.companyId) {
          userId = user._id;
          userCompanyId = user.companyId._id || user.companyId;
          shareLeads = user.companyId.settings?.shareLeads ?? false;
        }
      } catch (err) {
        // Token invalid, return empty
        return res.json({ leads: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } });
      }
    }
    
    const {
      searchId,
      sortBy = 'signalStrength',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
      minScore = 0,
      country,
      industry
    } = req.query;
    
    const query = { isDuplicate: false };
    
    if (searchId) {
      query.searchId = searchId;
    }
    
    // Filter by company sharing settings
    if (userCompanyId) {
      if (shareLeads) {
        // Get all searches from company users
        const companyUsers = await User.find({ companyId: userCompanyId }).select('_id');
        const userIds = companyUsers.map(u => u._id);
        const Search = (await import('../models/Search.js')).default;
        const companySearches = await Search.find({ userId: { $in: userIds } }).select('_id');
        const searchIds = companySearches.map(s => s._id);
        query.searchId = searchId ? { $in: [searchId, ...searchIds] } : { $in: searchIds };
      } else {
        // Only own leads
        const Search = (await import('../models/Search.js')).default;
        const userSearches = await Search.find({ userId }).select('_id');
        const searchIds = userSearches.map(s => s._id);
        query.searchId = searchId ? { $in: [searchId, ...searchIds] } : { $in: searchIds };
      }
    }
    
    if (minScore) {
      query['enrichment.signalStrength'] = { $gte: parseInt(minScore) };
    }
    
    if (country) {
      query['phoneNumbers.country'] = country;
    }
    
    if (industry) {
      query['enrichment.industry'] = { $regex: new RegExp(industry, 'i') };
    }
    
    const sort = {};
    if (sortBy === 'signalStrength') {
      sort['enrichment.signalStrength'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'companyName') {
      sort.companyName = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'createdAt') {
      sort.createdAt = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort['enrichment.signalStrength'] = -1;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const leads = await Lead.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Lead.countDocuments(query);
    
    res.json({
      leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Leads list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/leads/:id - Get single lead details
 */
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('searchId', 'query country');
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json(lead);
  } catch (error) {
    console.error('Lead fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/leads/:id/outreach - Generate outreach lines
 */
router.post('/:id/outreach', async (req, res) => {
  try {
    const { searchQuery, icpDescription } = req.body;
    const lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const outreach = await generateOutreachLines(
      {
        companyName: lead.companyName,
        enrichment: lead.enrichment
      },
      searchQuery || lead.searchId?.query || '',
      icpDescription
    );
    
    res.json(outreach);
  } catch (error) {
    console.error('Outreach generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/leads/bulk-select - Get multiple leads
 */
router.post('/bulk-select', async (req, res) => {
  try {
    const { leadIds } = req.body;
    
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds array is required' });
    }
    
    const leads = await Lead.find({
      _id: { $in: leadIds },
      isDuplicate: false
    });
    
    res.json(leads);
  } catch (error) {
    console.error('Bulk select error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

