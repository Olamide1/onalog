import express from 'express';
import { authenticate } from '../middleware/auth.js';
import Company from '../models/Company.js';
import { billingEnabled, getCreditPacks, getCompanyUsage, mockAddCredits, defaultCurrency } from '../services/billing.js';

const router = express.Router();

// List packs and current balance
router.get('/usage', authenticate, async (req, res) => {
  try {
    if (!billingEnabled()) return res.json({ balance: null, ledger: [], currency: null, packs: [], enabled: false });
    const usage = await getCompanyUsage(req.user.companyId);
    res.json({ ...usage, packs: getCreditPacks(), enabled: true });
  } catch (e) {
    console.error('Billing usage error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get/set billing profile (company)
router.get('/profile', authenticate, async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const profile = {
      currency: company.billing?.currency || defaultCurrency(),
      provider: company.billing?.provider || 'mock'
    };
    res.json({ enabled: billingEnabled(), profile, providerEnv: process.env.BILLING_PROVIDER || 'mock' });
  } catch (e) {
    console.error('Billing profile error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    // Only admin can change
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can update billing profile' });
    const { currency, provider } = req.body || {};
    if (!company.billing) company.billing = {};
    if (currency && ['usd','ngn'].includes(String(currency).toLowerCase())) {
      company.billing.currency = String(currency).toLowerCase();
    }
    if (provider && ['mock','stripe','paystack'].includes(String(provider).toLowerCase())) {
      company.billing.provider = String(provider).toLowerCase();
    }
    await company.save();
    res.json({ success: true, profile: { currency: company.billing.currency, provider: company.billing.provider } });
  } catch (e) {
    console.error('Billing profile update error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Start a purchase (mock provider adds credits immediately)
router.post('/purchase-intent', authenticate, async (req, res) => {
  try {
    if (!billingEnabled()) return res.status(400).json({ error: 'Billing disabled' });
    const { packId } = req.body || {};
    const company = await Company.findById(req.user.companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if ((company.billing?.provider || 'mock') !== 'mock') {
      // In real providers, we would create a checkout session and return its URL
      return res.status(400).json({ error: 'Non-mock provider not configured yet' });
    }
    const resp = await mockAddCredits(company._id, packId, req.user._id);
    res.json({ success: true, creditBalance: resp.creditBalance });
  } catch (e) {
    console.error('Purchase intent error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;


