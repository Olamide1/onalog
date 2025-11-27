import express from 'express';
import User from '../models/User.js';
import Company from '../models/Company.js';
import Search from '../models/Search.js';
import Lead from '../models/Lead.js';
import { requireAdmin } from '../middleware/admin.js';
import { requireAdminUsername } from '../middleware/adminUsername.js';
import { getCreditPacks, billingEnabled, defaultCurrency } from '../services/billing.js';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * GET /api/admin/metrics
 * Get comprehensive platform metrics
 * Requires admin username (username-only authentication)
 */
router.get('/metrics', requireAdminUsername, async (req, res) => {
  try {
    const { period = 'all', startDate, endDate } = req.query;
    
    // Build date filter
    let dateFilter = {};
    if (period === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateFilter = { createdAt: { $gte: today } };
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { createdAt: { $gte: weekAgo } };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = { createdAt: { $gte: monthAgo } };
    } else if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }

    // User Metrics
    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments(dateFilter);
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const memberUsers = await User.countDocuments({ role: 'member' });
    
    // Company Metrics
    const totalCompanies = await Company.countDocuments();
    const newCompanies = await Company.countDocuments(dateFilter);
    
    // Search Metrics
    const totalSearches = await Search.countDocuments({});
    const searchesInPeriod = await Search.countDocuments(dateFilter);
    const completedSearches = await Search.countDocuments({ ...dateFilter, status: 'completed' });
    const failedSearches = await Search.countDocuments({ ...dateFilter, status: 'failed' });
    const pendingSearches = await Search.countDocuments({ ...dateFilter, status: { $in: ['pending', 'queued', 'searching', 'extracting', 'enriching', 'processing_backfill'] } });
    
    // Search success rate
    const searchSuccessRate = searchesInPeriod > 0 
      ? ((completedSearches / searchesInPeriod) * 100).toFixed(2)
      : 0;
    
    // Average results per search
    const avgResults = await Search.aggregate([
      { $match: { ...dateFilter, status: 'completed', totalResults: { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$totalResults' } } }
    ]);
    const avgResultsPerSearch = avgResults[0]?.avg ? Math.round(avgResults[0].avg) : 0;
    
    // Lead Metrics (exclude duplicates for accurate counts)
    const totalLeads = await Lead.countDocuments({ isDuplicate: { $ne: true } });
    const leadsInPeriod = await Lead.countDocuments({ ...dateFilter, isDuplicate: { $ne: true } });
    const extractedLeads = await Lead.countDocuments({ ...dateFilter, isDuplicate: { $ne: true }, extractionStatus: 'extracted' });
    const enrichedLeads = await Lead.countDocuments({ ...dateFilter, isDuplicate: { $ne: true }, enrichmentStatus: 'enriched' });
    const duplicateLeads = await Lead.countDocuments({ ...dateFilter, isDuplicate: true });
    
    // Extraction rate
    const extractionRate = leadsInPeriod > 0
      ? ((extractedLeads / leadsInPeriod) * 100).toFixed(2)
      : 0;
    
    // Enrichment rate
    const enrichmentRate = extractedLeads > 0
      ? ((enrichedLeads / extractedLeads) * 100).toFixed(2)
      : 0;
    
    // Duplicate rate
    const duplicateRate = leadsInPeriod > 0
      ? ((duplicateLeads / leadsInPeriod) * 100).toFixed(2)
      : 0;
    
    // Leads with contact info (exclude duplicates)
    const leadsWithEmails = await Lead.countDocuments({
      ...dateFilter,
      isDuplicate: { $ne: true },
      'emails.0': { $exists: true }
    });
    const leadsWithPhones = await Lead.countDocuments({
      ...dateFilter,
      isDuplicate: { $ne: true },
      'phoneNumbers.0': { $exists: true }
    });
    const leadsWithContacts = await Lead.countDocuments({
      ...dateFilter,
      isDuplicate: { $ne: true },
      $or: [
        { 'emails.0': { $exists: true } },
        { 'phoneNumbers.0': { $exists: true } }
      ]
    });
    
    // Credit/Revenue Metrics
    const creditPacks = getCreditPacks();
    const allCompanies = await Company.find({}).lean();
    
    let totalCreditsPurchased = 0;
    let totalCreditsConsumed = 0;
    let totalCreditsRefunded = 0;
    let totalRevenueUSD = 0;
    let totalRevenueNGN = 0;
    let activeCredits = 0;
    
    allCompanies.forEach(company => {
      const ledger = company.ledger || [];
      const currency = company.billing?.currency || defaultCurrency();
      
      ledger.forEach(entry => {
        if (entry.reason === 'purchase') {
          totalCreditsPurchased += entry.delta;
          const pack = creditPacks.find(p => p.id === entry.packId);
          if (pack) {
            if (currency === 'usd') {
              totalRevenueUSD += pack.price.usd;
            } else {
              totalRevenueNGN += pack.price.ngn;
            }
          }
        } else if (entry.reason === 'reserve' || entry.reason === 'consume') {
          totalCreditsConsumed += Math.abs(entry.delta);
        } else if (entry.reason === 'refund_invalid' || entry.reason === 'refund') {
          totalCreditsRefunded += entry.delta;
        }
      });
      
      activeCredits += company.creditBalance || 0;
    });
    
    // Growth Trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyStats = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayFilter = {
        createdAt: {
          $gte: date,
          $lt: nextDate
        }
      };
      
      const [users, searches, leads, companies] = await Promise.all([
        User.countDocuments(dayFilter),
        Search.countDocuments(dayFilter),
        Lead.countDocuments({ ...dayFilter, isDuplicate: { $ne: true } }),
        Company.countDocuments(dayFilter)
      ]);
      
      dailyStats.push({
        date: date.toISOString().split('T')[0],
        users,
        searches,
        leads,
        companies
      });
    }
    
    // Top Users by Activity
    const topUsers = await User.aggregate([
      {
        $lookup: {
          from: 'searches',
          localField: '_id',
          foreignField: 'userId',
          as: 'searches'
        }
      },
      {
        $lookup: {
          from: 'leads',
          localField: '_id',
          foreignField: 'userId',
          as: 'leads'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          role: 1,
          companyId: 1,
          totalSearches: { $size: '$searches' },
          totalLeads: { $size: '$leads' },
          createdAt: 1
        }
      },
      { $sort: { totalSearches: -1 } },
      { $limit: 10 }
    ]);
    
    // Search Status Breakdown
    const searchStatusBreakdown = await Search.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Industry Distribution (from enriched leads, not searches)
    const industryDistribution = await Lead.aggregate([
      { $match: { ...dateFilter, 'enrichment.industry': { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$enrichment.industry',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Company Size Distribution (from enriched leads, exclude duplicates)
    const companySizeDistribution = await Lead.aggregate([
      { $match: { ...dateFilter, isDuplicate: { $ne: true }, 'enrichment.companySize': { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$enrichment.companySize',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Performance Metrics - Key Decision Indicators
    const avgLeadsPerSearch = searchesInPeriod > 0 && leadsInPeriod > 0
      ? (leadsInPeriod / searchesInPeriod).toFixed(1)
      : 0;
    
    const avgEnrichedPerSearch = searchesInPeriod > 0 && enrichedLeads > 0
      ? (enrichedLeads / searchesInPeriod).toFixed(1)
      : 0;
    
    const contactQualityRate = leadsInPeriod > 0
      ? ((leadsWithContacts / leadsInPeriod) * 100).toFixed(2)
      : 0;
    
    const userEngagementRate = totalUsers > 0
      ? ((searchesInPeriod / totalUsers) * 100).toFixed(2)
      : 0;
    
    const avgSearchesPerUser = totalUsers > 0
      ? (totalSearches / totalUsers).toFixed(1)
      : 0;
    
    const avgLeadsPerUser = totalUsers > 0
      ? (totalLeads / totalUsers).toFixed(1)
      : 0;
    
    // Revenue per user
    const revenuePerUser = totalUsers > 0
      ? (totalRevenueUSD / totalUsers).toFixed(2)
      : 0;
    
    // Credit efficiency (leads per credit consumed)
    const leadsPerCredit = totalCreditsConsumed > 0
      ? (leadsInPeriod / totalCreditsConsumed).toFixed(2)
      : 0;
    
    // Search completion time (average)
    const avgCompletionTime = await Search.aggregate([
      { $match: { ...dateFilter, status: 'completed', startedAt: { $exists: true }, completedAt: { $exists: true } } },
      {
        $project: {
          duration: { $subtract: ['$completedAt', '$startedAt'] }
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$duration' }
        }
      }
    ]);
    const avgCompletionTimeMs = avgCompletionTime[0]?.avgDuration || 0;
    const avgCompletionTimeMinutes = avgCompletionTimeMs > 0 ? Math.round(avgCompletionTimeMs / 60000) : 0;
    
    // Response
    res.json({
      period,
      dateRange: dateFilter,
      timestamp: new Date().toISOString(),
      
      // User Metrics
      users: {
        total: totalUsers,
        new: newUsers,
        admins: adminUsers,
        members: memberUsers,
        growth: newUsers
      },
      
      // Company Metrics
      companies: {
        total: totalCompanies,
        new: newCompanies,
        growth: newCompanies
      },
      
      // Search Metrics
      searches: {
        total: totalSearches,
        inPeriod: searchesInPeriod,
        completed: completedSearches,
        failed: failedSearches,
        pending: pendingSearches,
        successRate: parseFloat(searchSuccessRate),
        avgResultsPerSearch: avgResultsPerSearch,
        statusBreakdown: searchStatusBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      
      // Lead Metrics
      leads: {
        total: totalLeads,
        inPeriod: leadsInPeriod,
        extracted: extractedLeads,
        enriched: enrichedLeads,
        duplicates: duplicateLeads,
        withEmails: leadsWithEmails,
        withPhones: leadsWithPhones,
        withContacts: leadsWithContacts,
        extractionRate: parseFloat(extractionRate),
        enrichmentRate: parseFloat(enrichmentRate),
        duplicateRate: parseFloat(duplicateRate)
      },
      
      // Credit/Revenue Metrics
      credits: {
        totalPurchased: totalCreditsPurchased,
        totalConsumed: totalCreditsConsumed,
        totalRefunded: totalCreditsRefunded,
        activeBalance: activeCredits,
        consumptionRate: totalCreditsPurchased > 0
          ? ((totalCreditsConsumed / totalCreditsPurchased) * 100).toFixed(2)
          : 0
      },
      
      revenue: {
        usd: totalRevenueUSD,
        ngn: totalRevenueNGN,
        currency: defaultCurrency(),
        billingEnabled: billingEnabled()
      },
      
      // Growth Trends
      trends: {
        daily: dailyStats
      },
      
      // Top Users
      topUsers: topUsers.map(user => ({
        name: user.name,
        email: user.email,
        role: user.role,
        totalSearches: user.totalSearches,
        totalLeads: user.totalLeads,
        joinedAt: user.createdAt
      })),
      
      // Distributions
      distributions: {
        industries: industryDistribution.map(item => ({
          industry: item._id,
          count: item.count
        })),
        companySizes: companySizeDistribution.map(item => ({
          size: item._id,
          count: item.count
        }))
      },
      
      // Performance Metrics - Key Decision Indicators
      performance: {
        // Conversion Funnel
        avgLeadsPerSearch: parseFloat(avgLeadsPerSearch),
        avgEnrichedPerSearch: parseFloat(avgEnrichedPerSearch),
        contactQualityRate: parseFloat(contactQualityRate),
        
        // User Engagement
        userEngagementRate: parseFloat(userEngagementRate),
        avgSearchesPerUser: parseFloat(avgSearchesPerUser),
        avgLeadsPerUser: parseFloat(avgLeadsPerUser),
        
        // Business Metrics
        revenuePerUser: parseFloat(revenuePerUser),
        leadsPerCredit: parseFloat(leadsPerCredit),
        avgCompletionTimeMinutes: avgCompletionTimeMinutes,
        
        // Health Indicators
        searchHealth: searchSuccessRate >= 80 ? 'healthy' : searchSuccessRate >= 60 ? 'warning' : 'critical',
        extractionHealth: parseFloat(extractionRate) >= 70 ? 'healthy' : parseFloat(extractionRate) >= 50 ? 'warning' : 'critical',
        enrichmentHealth: parseFloat(enrichmentRate) >= 60 ? 'healthy' : parseFloat(enrichmentRate) >= 40 ? 'warning' : 'critical'
      }
    });
  } catch (error) {
    console.error('Admin metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics', details: error.message });
  }
});

/**
 * GET /api/admin/users
 * Get user list with pagination
 * Requires admin authentication
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const [users, total] = await Promise.all([
      User.find({})
        .select('-password')
        .populate('companyId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments()
    ]);
    
    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

/**
 * GET /api/admin/companies
 * Get company list with pagination
 * Requires admin authentication
 */
router.get('/companies', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const [companies, total] = await Promise.all([
      Company.find({})
        .populate('adminId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Company.countDocuments()
    ]);
    
    // Add member count and usage stats
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const memberCount = await User.countDocuments({ companyId: company._id });
        const searchCount = await Search.countDocuments({ userId: { $in: await User.find({ companyId: company._id }).distinct('_id') } });
        const leadCount = await Lead.countDocuments({ userId: { $in: await User.find({ companyId: company._id }).distinct('_id') } });
        
        return {
          ...company,
          memberCount,
          searchCount,
          leadCount,
          creditBalance: company.creditBalance || 0
        };
      })
    );
    
    res.json({
      companies: companiesWithStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch companies', details: error.message });
  }
});

/**
 * GET /api/admin/config
 * Get platform configuration (from .env)
 * Requires admin username (username-only authentication)
 */
router.get('/config', requireAdminUsername, async (req, res) => {
  try {
    res.json({
      billing: {
        enabled: billingEnabled(),
        currency: defaultCurrency(),
        creditPacks: getCreditPacks(),
        ngnPerUsd: Number(process.env.NGN_PER_USD || 1600)
      },
      features: {
        puppeteer: !!process.env.PUPPETEER_EXECUTABLE_PATH,
        openai: !!process.env.OPENAI_API_KEY,
        mongodb: !!process.env.MONGODB_URI
      },
      environment: process.env.NODE_ENV || 'development',
      // Don't expose sensitive keys, just indicate if they're set
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasMongoUri: !!process.env.MONGODB_URI
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch config', details: error.message });
  }
});

export default router;

