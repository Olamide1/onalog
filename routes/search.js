import express from 'express';
import Search from '../models/Search.js';
import Lead from '../models/Lead.js';
import Company from '../models/Company.js';
import { fetchGoogleResults } from '../services/googleSearch.js';
import { extractContactInfo } from '../services/extractor.js';
import { enrichLead } from '../services/enricher.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

/**
 * POST /api/search - Create new search and start processing
 */
router.post('/', async (req, res) => {
  try {
    const { query, country, location, resultCount = 50 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    // Get user ID from token if available (optional for now)
    let userId = null;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.verify(token, secret);
        userId = decoded.userId;
      } catch (err) {
        // Token invalid, continue without user
      }
    }
    
    // Create search record
    const search = new Search({
      query,
      country,
      location,
      resultCount,
      userId,
      status: 'pending',
      startedAt: new Date()
    });
    await search.save();
    
    // Start async processing
    processSearch(search._id).catch(err => {
      console.error('Search processing error:', err);
    });
    
    res.json({
      searchId: search._id,
      status: 'processing',
      message: 'Search started'
    });
    
  } catch (error) {
    console.error('Search creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/:id - Get search status and results
 */
router.get('/:id', async (req, res) => {
  try {
    // Get user info if token provided
    let userCompanyId = null;
    let userId = null;
    let shareSearches = false;
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.verify(token, secret);
        const User = (await import('../models/User.js')).default;
        const user = await User.findById(decoded.userId).populate('companyId');
        if (user && user.companyId) {
          userId = user._id;
          userCompanyId = user.companyId._id || user.companyId;
          shareSearches = user.companyId.settings?.shareSearches ?? false;
        }
      } catch (err) {
        // Token invalid, continue without user
      }
    }
    
    const search = await Search.findById(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }
    
    // Check access: if user is authenticated, verify company access
    if (userCompanyId && search.userId) {
      const User = (await import('../models/User.js')).default;
      const searchUser = await User.findById(search.userId);
      
      if (shareSearches) {
        // Sharing enabled - check if search belongs to company
        if (searchUser && searchUser.companyId.toString() !== userCompanyId.toString()) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else {
        // Sharing disabled - only own searches
        if (search.userId.toString() !== userId.toString()) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }
    
    const leads = await Lead.find({ searchId: search._id, isDuplicate: false })
      .sort({ 'enrichment.signalStrength': -1 })
      .limit(1000);
    
    res.json({
      search,
      leads,
      stats: {
        total: leads.length,
        extracted: leads.filter(l => l.extractionStatus === 'extracted').length,
        enriched: leads.filter(l => l.enrichmentStatus === 'enriched').length
      }
    });
    
  } catch (error) {
    console.error('Search fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search - List all searches (filtered by company)
 */
router.get('/', async (req, res) => {
  try {
    // Get user info if token provided
    let userCompanyId = null;
    let userId = null;
    let shareSearches = false;
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const jwt = await import('jsonwebtoken');
        const User = (await import('../models/User.js')).default;
        const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.default.verify(token, secret);
        const user = await User.findById(decoded.userId).populate('companyId');
        if (user && user.companyId) {
          userId = user._id;
          userCompanyId = user.companyId._id || user.companyId;
          shareSearches = user.companyId.settings?.shareSearches ?? false;
        }
      } catch (err) {
        // Token invalid, return empty
        return res.json([]);
      }
    }
    
    // Build query based on sharing settings
    let query = {};
    if (userCompanyId) {
      if (shareSearches) {
        // Get all users in company
        const User = (await import('../models/User.js')).default;
        const companyUsers = await User.find({ companyId: userCompanyId }).select('_id');
        const userIds = companyUsers.map(u => u._id);
        query.userId = { $in: userIds };
      } else {
        // Only own searches
        query.userId = userId;
      }
    }
    
    const searches = await Search.find(query)
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json(searches);
  } catch (error) {
    console.error('Searches list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/search/:id/save - Save search as template
 */
router.post('/:id/save', async (req, res) => {
  try {
    const { templateName } = req.body;
    const search = await Search.findById(req.params.id);
    
    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }
    
    search.isTemplate = true;
    const locationPart = search.location ? ` - ${search.location}` : '';
    search.templateName = templateName || `${search.query}${locationPart}`;
    await search.save();
    
    res.json(search);
  } catch (error) {
    console.error('Save search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/templates/list - List saved templates (filtered by company)
 */
router.get('/templates/list', async (req, res) => {
  try {
    // Get user info if token provided
    let userCompanyId = null;
    let userId = null;
    let shareTemplates = false;
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.verify(token, secret);
        const User = (await import('../models/User.js')).default;
        const user = await User.findById(decoded.userId).populate('companyId');
        if (user && user.companyId) {
          userId = user._id;
          userCompanyId = user.companyId._id || user.companyId;
          shareTemplates = user.companyId.settings?.shareTemplates ?? false;
        }
      } catch (err) {
        // Token invalid, return empty
        return res.json([]);
      }
    }
    
    // Build query based on sharing settings
    let query = { isTemplate: true };
    if (userCompanyId) {
      if (shareTemplates) {
        // Get all users in company
        const User = (await import('../models/User.js')).default;
        const companyUsers = await User.find({ companyId: userCompanyId }).select('_id');
        const userIds = companyUsers.map(u => u._id);
        query.userId = { $in: userIds };
      } else {
        // Only own templates
        query.userId = userId;
      }
    }
    
    const templates = await Search.find(query)
      .sort({ createdAt: -1 });
    
    res.json(templates);
  } catch (error) {
    console.error('Templates list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Async search processing function
 */
async function processSearch(searchId) {
  try {
    const search = await Search.findById(searchId);
    if (!search) return;
    
    // Step 1: Google Search
    search.status = 'searching';
    await search.save();
    
    console.log(`🔍 Starting search: ${search.query}`);
    const googleResults = await fetchGoogleResults(
      search.query,
      search.country,
      search.location,
      search.resultCount
    );
    
    search.totalResults = googleResults.length;
    search.status = 'extracting';
    await search.save();
    
    // Step 2: Extract contact info
    const leads = [];
    for (let i = 0; i < googleResults.length; i++) {
      const result = googleResults[i];
      
      try {
        // Create lead record
        const lead = new Lead({
          searchId: search._id,
          rawTitle: result.title,
          rawSnippet: result.snippet,
          rawLink: result.link,
          companyName: result.title.split(' - ')[0] || result.title,
          website: result.link,
          extractionStatus: 'extracting'
        });
        
        // Extract contact info
        const extracted = await extractContactInfo(result.link);
        
        // Merge extracted data
        lead.companyName = extracted.companyName || lead.companyName;
        lead.emails = extracted.emails;
        lead.phoneNumbers = extracted.phoneNumbers;
        lead.whatsappLinks = extracted.whatsappLinks;
        lead.socials = extracted.socials;
        lead.address = extracted.address;
        lead.aboutText = extracted.aboutText;
        lead.categorySignals = extracted.categorySignals;
        lead.extractionStatus = 'extracted';
        
        // Check for duplicates
        const duplicateCheck = await detectDuplicates(lead, search._id);
        lead.isDuplicate = duplicateCheck.isDuplicate;
        lead.duplicateOf = duplicateCheck.duplicateOf;
        
        await lead.save();
        
        if (!lead.isDuplicate) {
          leads.push(lead);
        }
        
        // Step 3: Enrich lead
        if (!lead.isDuplicate) {
          lead.enrichmentStatus = 'enriching';
          await lead.save();
          
          const enrichment = await enrichLead({
            companyName: lead.companyName,
            website: lead.website,
            aboutText: lead.aboutText,
            categorySignals: lead.categorySignals,
            emails: lead.emails,
            phoneNumbers: lead.phoneNumbers,
            socials: lead.socials
          });
          
          lead.enrichment = enrichment;
          lead.enrichmentStatus = 'enriched';
          await lead.save();
        }
        
        console.log(`✅ Processed ${i + 1}/${googleResults.length}: ${lead.companyName}`);
        
      } catch (error) {
        console.error(`❌ Error processing ${result.link}:`, error.message);
      }
    }
    
    // Update search status
    search.status = 'enriching';
    search.extractedCount = leads.length;
    search.enrichedCount = leads.filter(l => l.enrichmentStatus === 'enriched').length;
    search.status = 'completed';
    search.completedAt = new Date();
    await search.save();
    
    console.log(`✅ Search completed: ${search.query} - ${leads.length} leads`);
    
  } catch (error) {
    console.error('❌ Search processing error:', error);
    const search = await Search.findById(searchId);
    if (search) {
      search.status = 'failed';
      await search.save();
    }
  }
}

export default router;

