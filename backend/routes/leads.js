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
    
    // Fix: MongoDB sorts null values FIRST, not last
    // To sort nulls last when sorting descending, we need to use aggregation or handle nulls explicitly
    // For now, we'll use a workaround: sort by a computed field that treats null as -1
    // This ensures null quality scores appear at the bottom when sorting descending
    
    let leads;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fix: Check if we need null handling for qualityScore sorting
    // We need null handling when:
    // 1. Explicitly sorting by qualityScore
    // 2. Using default sort (sortBy === 'signalStrength' means Phase 2 ranking: quality → verification → signal)
    // 3. Any other case where qualityScore is part of the sort
    // The default value is 'signalStrength', but that still uses Phase 2 ranking with qualityScore as primary sort
    const needsNullHandling = sortBy === 'qualityScore' || sortBy === 'signalStrength' || !sortBy;
    
    if (needsNullHandling) {
      // Use aggregation pipeline to handle null values in sorting
      // Fix: Use different placeholder values for ascending vs descending sorts
      // For descending: use -1 (nulls sort last)
      // For ascending: use 1000 (nulls sort last, after valid scores 0-5)
      // Fix: Check sortOrder for both qualityScore and signalStrength sorts
      const isAscending = (sortBy === 'qualityScore' || sortBy === 'signalStrength') && sortOrder === 'asc';
      const nullPlaceholder = isAscending ? 1000 : -1;
      
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            // Create computed fields that treat null as placeholder value for sorting
            // This ensures nulls sort last regardless of sort direction
            sortQualityScore: { $ifNull: ['$qualityScore', nullPlaceholder] },
            sortVerificationScore: { $ifNull: ['$enrichment.verificationScore', nullPlaceholder] },
            sortSignalStrength: { $ifNull: ['$enrichment.signalStrength', nullPlaceholder] }
          }
        }
      ];
      
      // Add sorting
      const sortStage = {};
      if (sortBy === 'qualityScore') {
        // Explicit quality score sort
        const order = sortOrder === 'asc' ? 1 : -1;
        sortStage.sortQualityScore = order;
        sortStage.sortVerificationScore = -1;
        sortStage.sortSignalStrength = -1;
      } else if (sortBy === 'signalStrength') {
        // Fix: When sorting by signalStrength, respect sortOrder for primary sort
        // If ascending: sort by signal strength ascending, with quality and verification as secondary sorts (descending)
        // If descending (default): Use Phase 2 ranking (quality → verification → signal) descending
        if (sortOrder === 'asc') {
          // Ascending: Sort by signal strength ascending, but keep quality/verification descending as secondary sorts
          // This ensures lower signal strength appears first, but higher quality leads are still prioritized
          sortStage.sortSignalStrength = 1;
          sortStage.sortQualityScore = -1;  // Secondary: still prioritize higher quality
          sortStage.sortVerificationScore = -1;  // Tertiary: still prioritize higher verification
        } else {
          // Descending: Phase 2 ranking (quality → verification → signal)
          sortStage.sortQualityScore = -1;
          sortStage.sortVerificationScore = -1;
          sortStage.sortSignalStrength = -1;
        }
      } else {
        // Default: Phase 2 ranking (quality → verification → signal) descending
        // This applies when sortBy is undefined or other values
        sortStage.sortQualityScore = -1;
        sortStage.sortVerificationScore = -1;
        sortStage.sortSignalStrength = -1;
      }
      pipeline.push({ $sort: sortStage });
      
      // Add pagination
      if (skip > 0) pipeline.push({ $skip: skip });
      pipeline.push({ $limit: parseInt(limit) });
      
      // Remove computed fields from output
      pipeline.push({
        $project: {
          sortQualityScore: 0,
          sortVerificationScore: 0,
          sortSignalStrength: 0
        }
      });
      
      leads = await Lead.aggregate(pipeline);
    } else {
      // For other sort fields, use regular find with sort
      const sort = {};
      if (sortBy === 'signalStrength') {
        sort['enrichment.signalStrength'] = sortOrder === 'asc' ? 1 : -1;
        // Still prioritize quality when sorting by signal strength
        // But use regular sort (nulls will appear first, which is acceptable for secondary sort)
        sort.qualityScore = -1;
        sort['enrichment.verificationScore'] = -1;
      } else if (sortBy === 'companyName') {
        sort.companyName = sortOrder === 'asc' ? 1 : -1;
      } else if (sortBy === 'createdAt') {
        sort.createdAt = sortOrder === 'asc' ? 1 : -1;
      }
      
      leads = await Lead.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
    }
    
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

