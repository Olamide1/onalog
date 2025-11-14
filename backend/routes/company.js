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

export default router;

