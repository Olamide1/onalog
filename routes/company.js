import express from 'express';
import Company from '../models/Company.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/company - Get current user's company
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId)
      .populate('adminId', 'name email');
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json(company);
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/company/members - Get company members
 */
router.get('/members', authenticate, async (req, res) => {
  try {
    const members = await User.find({ companyId: req.user.companyId })
      .select('name email role createdAt')
      .sort({ createdAt: 1 });
    
    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/company/settings - Update company settings (admin only)
 */
router.put('/settings', authenticate, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update company settings' });
    }
    
    const { shareSearches, shareLeads, shareTemplates } = req.body;
    
    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Update settings
    if (shareSearches !== undefined) {
      company.settings.shareSearches = shareSearches;
    }
    if (shareLeads !== undefined) {
      company.settings.shareLeads = shareLeads;
    }
    if (shareTemplates !== undefined) {
      company.settings.shareTemplates = shareTemplates;
    }
    
    await company.save();
    
    res.json(company);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/company/stats - Get dashboard statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const company = await Company.findById(user.companyId);
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const Search = (await import('../models/Search.js')).default;
    const Lead = (await import('../models/Lead.js')).default;
    
    // Get user IDs based on sharing settings
    let userIds = [user._id];
    if (company.settings.shareSearches || company.settings.shareLeads) {
      const companyUsers = await User.find({ companyId: user.companyId }).select('_id');
      userIds = companyUsers.map(u => u._id);
    }
    
    // Search stats
    const searchQuery = company.settings.shareSearches 
      ? { userId: { $in: userIds } }
      : { userId: user._id };
    
    const totalSearches = await Search.countDocuments(searchQuery);
    const completedSearches = await Search.countDocuments({ ...searchQuery, status: 'completed' });
    const recentSearches = await Search.find(searchQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .select('query country location status createdAt totalResults extractedCount enrichedCount');
    
    // Lead stats
    const leadSearchIds = await Search.find(searchQuery).select('_id');
    const searchIds = leadSearchIds.map(s => s._id);
    
    const leadQuery = company.settings.shareLeads
      ? { searchId: { $in: searchIds }, isDuplicate: false }
      : { searchId: { $in: searchIds }, isDuplicate: false };
    
    const totalLeads = await Lead.countDocuments(leadQuery);
    const enrichedLeads = await Lead.countDocuments({ ...leadQuery, enrichmentStatus: 'enriched' });
    const highSignalLeads = await Lead.countDocuments({ 
      ...leadQuery, 
      'enrichment.signalStrength': { $gte: 70 } 
    });
    
    // Template stats
    const templateQuery = company.settings.shareTemplates
      ? { isTemplate: true, userId: { $in: userIds } }
      : { isTemplate: true, userId: user._id };
    
    const totalTemplates = await Search.countDocuments(templateQuery);
    
    res.json({
      searches: {
        total: totalSearches,
        completed: completedSearches,
        recent: recentSearches
      },
      leads: {
        total: totalLeads,
        enriched: enrichedLeads,
        highSignal: highSignalLeads
      },
      templates: {
        total: totalTemplates
      },
      company: {
        name: company.name,
        memberCount: company.memberCount
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

