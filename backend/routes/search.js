import express from 'express';
import Search from '../models/Search.js';
import Lead from '../models/Lead.js';
import Company from '../models/Company.js';
import { fetchGoogleResults } from '../services/googleSearch.js';
import { isDirectorySite } from '../services/searchProviders.js';
import { extractContactInfo, formatPhone, detectCountry, expandDirectoryCompanies, discoverExecutives } from '../services/extractor.js';
import { enrichLead } from '../services/enricher.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
import { normalizeUrl } from '../utils/urlNormalizer.js';
import { isSocialMediaUrl } from '../utils/socialMediaDetector.js';
import { verifyEmails } from '../services/emailVerifier.js';
import { isInvalidDomain, isGenericCompanyName as isGenericNameFromConfig } from '../config/domainValidation.js';
import { isLeadRelevant } from '../utils/relevanceFilter.js';
import jwt from 'jsonwebtoken';
import { billingEnabled, reserveCredit, refundCredit } from '../services/billing.js';

const router = express.Router();

/**
 * Search Queue - Per-user queues with priority and round-robin processing
 * - Each user has their own queue
 * - Searches within a user's queue are sorted by priority (higher first)
 * - Round-robin between users for fairness
 */
const searchQueue = {
  // Map<userId, Array<{searchId, priority, addedAt}>>
  userQueues: new Map(),
  // Track which users have been processed (for round-robin)
  userOrder: [],
  currentUserIndex: 0,
  processing: false,
  currentSearchId: null,
  // Track active background fills: Map<searchId, {resume: Function, isPaused: boolean}>
  backgroundFills: new Map(),
  
  async add(searchId, userId = null) {
    // Get search to determine priority
    let priority = 0;
    try {
      const search = await Search.findById(searchId);
      if (search) {
        priority = search.priority || 0;
        userId = userId || search.userId || 'anonymous';
      } else {
        userId = userId || 'anonymous';
      }
    } catch (err) {
      userId = userId || 'anonymous';
    }
    
    // Convert userId to string for Map key
    const userIdStr = userId ? String(userId) : 'anonymous';
    
    // Initialize user queue if needed
    if (!this.userQueues.has(userIdStr)) {
      this.userQueues.set(userIdStr, []);
      // Add to round-robin order if new user
      if (!this.userOrder.includes(userIdStr)) {
        this.userOrder.push(userIdStr);
      }
    }
    
    // Add search to user's queue
    const userQueue = this.userQueues.get(userIdStr);
    const queueItem = {
      searchId,
      priority,
      addedAt: Date.now()
    };
    userQueue.push(queueItem);
    
    // Sort user's queue by priority (higher first), then by addedAt (earlier first)
    userQueue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.addedAt - b.addedAt; // Earlier first for same priority
    });
    
    const totalQueued = Array.from(this.userQueues.values()).reduce((sum, q) => sum + q.length, 0);
    const userQueuePosition = userQueue.length;
    console.log(`[QUEUE] Added search ${searchId} to user ${userIdStr}'s queue (priority: ${priority}). User queue: ${userQueuePosition}, Total queued: ${totalQueued}`);
    
    // Update search status to queued if not the first one
    if (this.processing || totalQueued > 1) {
      try {
        const search = await Search.findById(searchId);
        if (search && search.status === 'pending') {
          search.status = 'queued';
          await search.save();
        }
      } catch (err) {
        // Ignore errors updating status
      }
    }
    
    this.process();
  },
  
  async process() {
    // If already processing, do nothing
    if (this.processing) {
      return;
    }
    
    // Find next search using round-robin across users
    let nextItem = null;
    let nextUserId = null;
    let attempts = 0;
    const maxAttempts = this.userOrder.length || 1;
    
    // Round-robin: try each user once, starting from current index
    while (attempts < maxAttempts && !nextItem) {
      if (this.userOrder.length === 0) {
        break; // No users in queue
      }
      
      const userIdStr = this.userOrder[this.currentUserIndex];
      const userQueue = this.userQueues.get(userIdStr);
      
      if (userQueue && userQueue.length > 0) {
        // Get highest priority item from this user's queue
        nextItem = userQueue.shift();
        nextUserId = userIdStr;
        
        // Clean up empty user queues
        if (userQueue.length === 0) {
          this.userQueues.delete(userIdStr);
          // Remove from round-robin order
          this.userOrder = this.userOrder.filter(id => id !== userIdStr);
        }
        break;
      } else {
        // This user's queue is empty, try next user
        this.currentUserIndex = (this.currentUserIndex + 1) % this.userOrder.length;
        attempts++;
      }
    }
    
    // If no item found, check if there are any queues left
    if (!nextItem) {
      // Check all queues (in case userOrder is out of sync)
      for (const [userIdStr, userQueue] of this.userQueues.entries()) {
        if (userQueue && userQueue.length > 0) {
          nextItem = userQueue.shift();
          nextUserId = userIdStr;
          if (userQueue.length === 0) {
            this.userQueues.delete(userIdStr);
            this.userOrder = this.userOrder.filter(id => id !== userIdStr);
          }
          break;
        }
      }
    }
    
    // If still no item, queue is empty
    if (!nextItem) {
      this.userQueues.clear();
      this.userOrder = [];
      this.currentUserIndex = 0;
      console.log(`[QUEUE] Queue empty. Waiting for new searches...`);
      return;
    }
    
    // Update round-robin index for next iteration
    if (this.userOrder.length > 0) {
      this.currentUserIndex = (this.currentUserIndex + 1) % this.userOrder.length;
    } else {
      this.currentUserIndex = 0;
    }
    
    // Pause any active background fills before starting new search
    this.pauseBackgroundFills();
    
    this.processing = true;
    const searchId = nextItem.searchId;
    this.currentSearchId = searchId;
    
    const totalQueued = Array.from(this.userQueues.values()).reduce((sum, q) => sum + q.length, 0);
    console.log(`[QUEUE] Processing search ${searchId} (user: ${nextUserId}, priority: ${nextItem.priority}). Remaining: ${totalQueued}`);
    
    try {
      await processSearch(searchId);
    } catch (error) {
      console.error(`[QUEUE] Error processing search ${searchId}:`, error.message);
      // Update search status to failed
      try {
        const search = await Search.findById(searchId);
        if (search) {
          search.status = 'failed';
          search.error = error.message;
          await search.save();
        }
      } catch (saveError) {
        console.error(`[QUEUE] Failed to update search status:`, saveError.message);
      }
    } finally {
      this.processing = false;
      this.currentSearchId = null;
      console.log(`[QUEUE] Search ${searchId} completed. Processing next...`);
      
      // Resume any paused background fills
      this.resumeBackgroundFills();
      
      // Process next item in queue
      const remaining = Array.from(this.userQueues.values()).reduce((sum, q) => sum + q.length, 0);
      if (remaining > 0) {
        // Longer delay to let rate limits recover (especially DuckDuckGo)
        // Increased to 60-90 seconds to give more time for rate limits to expire
        const delay = 60000; // 60 seconds (increased from 30)
        console.log(`[QUEUE] Waiting ${delay/1000}s before processing next search to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        this.process();
      } else {
        console.log(`[QUEUE] Queue empty. Waiting for new searches...`);
      }
    }
  },
  
  pauseBackgroundFills() {
    // Pause all active background fills
    for (const [searchId, bgFill] of this.backgroundFills.entries()) {
      if (!bgFill.isPaused) {
        bgFill.isPaused = true;
        console.log(`[QUEUE] ⏸️  Paused background fill for search ${searchId}`);
      }
    }
  },
  
  resumeBackgroundFills() {
    // Resume all paused background fills
    for (const [searchId, bgFill] of this.backgroundFills.entries()) {
      if (bgFill.isPaused && bgFill.resume) {
        bgFill.isPaused = false;
        console.log(`[QUEUE] ▶️  Resuming background fill for search ${searchId}`);
        bgFill.resume();
      }
    }
  },
  
  getStatus() {
    const totalQueued = Array.from(this.userQueues.values()).reduce((sum, q) => sum + q.length, 0);
    const userQueueCounts = {};
    for (const [userId, queue] of this.userQueues.entries()) {
      userQueueCounts[userId] = queue.length;
    }
    
    return {
      queueLength: totalQueued,
      processing: this.processing,
      currentSearch: this.currentSearchId,
      userQueues: userQueueCounts,
      activeUsers: this.userOrder.length
    };
  }
};

/**
 * POST /api/search - Create new search and start processing
 */
router.post('/', async (req, res) => {
  try {
    let { query, country, location, industry, resultCount = 50 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    // Fix: Parse natural language query to extract industry and location if not explicitly provided
    // Only skip parsing if BOTH industry AND location are already provided
    // Country doesn't prevent extracting industry/location from query text
    if (!industry || !location) {
      try {
        const { parseQuery } = await import('../utils/queryParser.js');
        const parsed = await parseQuery(query, country, location, industry);
        
        // Use parsed values if explicit values weren't provided
        if (parsed.industry && !industry) {
          industry = parsed.industry;
        }
        if (parsed.location && !location) {
          location = parsed.location;
        }
        // Fix: DO NOT replace original query with cleaned version
        // The original query should be used for searching, cleaned query is only for internal use
        // Keep the original query intact for better search results
        
        console.log(`[SEARCH] Parsed query: "${req.body.query}" → industry: ${industry || 'none'}, location: ${location || 'none'}`);
      } catch (parseError) {
        console.error('[SEARCH] Query parsing error:', parseError.message);
        // Continue with original query if parsing fails
      }
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
    
    // Determine priority based on user/company
    // - Default: 0 (free users)
    // - Priority 10: Users who have purchased credits (not just signup bonus)
    // - Future: Priority 20+ for subscription users
    let priority = 0;
    if (userId) {
      try {
        const User = (await import('../models/User.js')).default;
        const user = await User.findById(userId).populate('companyId');
        
        if (user?.companyId) {
          const company = user.companyId;
          
          // Check if company has ever purchased credits (not just signup bonus)
          // Look for ledger entries with reason: 'purchase'
          const hasPurchasedCredits = company.ledger && Array.isArray(company.ledger) &&
            company.ledger.some(entry => entry.reason === 'purchase' && entry.delta > 0);
          
          if (hasPurchasedCredits) {
            priority = 10; // Purchased credits = priority 10
          }
          
          // Future: Add subscription-based priority (e.g., priority 20+)
          // if (company.billing?.subscription === 'premium') {
          //   priority = 20;
          // } else if (company.billing?.subscription === 'enterprise') {
          //   priority = 30;
          // }
        }
      } catch (err) {
        // Ignore errors, use default priority
        console.error('[PRIORITY] Error determining priority:', err.message);
      }
    }
    
    // Create search record
    const search = new Search({
      query,
      country,
      location,
      industry,
      resultCount,
      userId,
      priority,
      status: 'pending',
      startedAt: new Date()
    });
    await search.save();
    
    // Add to queue for sequential processing (with userId for per-user queues)
    searchQueue.add(search._id, userId);
    
    const queueStatus = searchQueue.getStatus();
    const userIdStr = userId ? String(userId) : 'anonymous';
    const userQueueLength = queueStatus.userQueues[userIdStr] || 0;
    const isFirstInQueue = !queueStatus.processing && queueStatus.queueLength === 1;
    const userQueuePosition = queueStatus.processing && queueStatus.currentSearch === String(search._id) ? 0 : userQueueLength;
    const totalQueuePosition = queueStatus.processing ? queueStatus.queueLength + 1 : queueStatus.queueLength;
    
    res.json({
      searchId: search._id,
      status: isFirstInQueue ? 'processing' : 'queued',
      message: isFirstInQueue 
        ? 'Search started' 
        : `Search queued (${userQueuePosition} in your queue, ${totalQueuePosition} total)`,
      queuePosition: totalQueuePosition,
      userQueuePosition: userQueuePosition,
      priority: priority
    });
    
  } catch (error) {
    console.error('Search creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/search/:id - Delete a search (owner or company admin)
 */
router.delete('/:id', async (req, res) => {
  try {
    // Require auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(decoded.userId).populate('companyId');
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const search = await Search.findById(req.params.id);
    if (!search) return res.status(404).json({ error: 'Search not found' });
    
    // Access: owner OR company admin in same company
    let allowed = false;
    if (String(search.userId) === String(user._id)) {
      allowed = true;
    } else if (user.role === 'admin') {
      const SearchOwner = (await import('../models/User.js')).default;
      const owner = await SearchOwner.findById(search.userId);
      if (owner && String(owner.companyId) === String(user.companyId?._id || user.companyId)) {
        allowed = true;
      }
    }
    if (!allowed) return res.status(403).json({ error: 'Access denied' });
    
    // Delete leads for this search and the search itself
    await Lead.deleteMany({ searchId: search._id });
    await Search.deleteOne({ _id: search._id });
    
    res.json({ success: true });
  } catch (e) {
    console.error('Delete search error:', e);
    res.status(500).json({ error: e.message });
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
    
    // Determine preview limit based on billing state of the search owner's company
    let previewLimit = null;
    try {
      if (billingEnabled()) {
        const OwnerUser = (await import('../models/User.js')).default;
        const owner = await OwnerUser.findById(search.userId).populate('companyId');
        const ownerCompany = owner?.companyId;
        if (ownerCompany && (ownerCompany.creditBalance || 0) <= 0) {
          previewLimit = parseInt(process.env.PREVIEW_LIMIT || '10', 10);
        }
      }
    } catch (e) {
      // ignore preview evaluation errors
    }
    
    // Phase 2: Sort by quality score (Q5→Q1), then verification score, then signal strength
    // This ensures best results appear first
    // Fix: MongoDB sorts null values FIRST, not last. Use aggregation to handle nulls properly
    const pipeline = [
      { $match: { searchId: search._id, isDuplicate: false } },
      {
        $addFields: {
          // Create computed fields that treat null as -1 for sorting
          // This ensures nulls sort last when using descending order
          sortQualityScore: { $ifNull: ['$qualityScore', -1] },
          sortVerificationScore: { $ifNull: ['$enrichment.verificationScore', -1] },
          sortSignalStrength: { $ifNull: ['$enrichment.signalStrength', -1] }
        }
      },
      {
        $sort: {
          sortQualityScore: -1,  // Q5 first, then Q4, Q3, etc. (nulls sort last)
          sortVerificationScore: -1,  // Higher verification first
          sortSignalStrength: -1  // Higher signal strength first
        }
      },
      {
        $project: {
          sortQualityScore: 0,
          sortVerificationScore: 0,
          sortSignalStrength: 0
        }
      }
    ];
    if (previewLimit) pipeline.push({ $limit: previewLimit });
    const leads = await Lead.aggregate(pipeline);
    
    res.json({
      search: {
        ...search.toObject(),
        previewLimited: !!previewLimit,
        previewLimit: previewLimit || null
      },
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
 * GET /api/search - List searches (filtered by company sharing)
 * Query params: limit, status
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
        // Token invalid; return empty
        return res.json({ searches: [] });
      }
    }
    
    // Build base query
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const status = req.query.status;
    const query = {};
    if (status) query.status = status;

    if (userCompanyId) {
      if (shareSearches) {
        const User = (await import('../models/User.js')).default;
        const companyUsers = await User.find({ companyId: userCompanyId }).select('_id');
        const userIds = companyUsers.map(u => u._id);
        query.userId = { $in: userIds };
      } else {
        query.userId = userId;
      }
    } else {
      // No auth -> return empty for privacy
      return res.json({ searches: [] });
    }
    
    const searches = await Search.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
    
    res.json({ searches });
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
  const startTime = Date.now();
  console.log(`[PROCESS] ========================================`);
  console.log(`[PROCESS] Starting search processing: ${searchId}`);
  console.log(`[PROCESS] ========================================`);
  
  try {
    const search = await Search.findById(searchId);
    if (!search) {
      console.error(`[PROCESS] ❌ Search not found: ${searchId}`);
      return;
    }
    
    console.log(`[PROCESS] Search params:`, {
      query: search.query,
      country: search.country,
      location: search.location,
      resultCount: search.resultCount
    });
    
    // Resolve user and company for potential billing
    let searchUser = null;
    let searchCompanyId = null;
    try {
      const User = (await import('../models/User.js')).default;
      searchUser = await User.findById(search.userId).populate('companyId');
      searchCompanyId = searchUser?.companyId?._id || searchUser?.companyId || null;
    } catch {}
    
    // Step 1: Google Search / Google Places
    search.status = 'searching';
    await search.save();
    console.log(`[PROCESS] Step 1/3: Searching...`);
    
    const searchStartTime = Date.now();
    
    // Start search
    const fetchedResults = await fetchGoogleResults(
      search.query,
      search.country,
      search.location,
      search.resultCount
    );
    const googleResults = Array.isArray(fetchedResults) ? fetchedResults : (fetchedResults.results || []);
    if (!Array.isArray(fetchedResults)) {
      search.providers = fetchedResults.telemetry || {};
      search.reasonShortfall = fetchedResults.reasonShortfall || '';
      await search.save();
    }
    const searchDuration = Date.now() - searchStartTime;
    
    console.log(`[PROCESS] ✅ Search completed in ${searchDuration}ms`);
    console.log(`[PROCESS] Found ${googleResults.length} raw results (requested: ${search.resultCount})`);
    
    if (googleResults.length === 0) {
      console.warn(`[PROCESS] ⚠️  No results found for query: ${search.query}`);
      search.status = 'completed';
      search.totalResults = 0;
      search.extractedCount = 0;
      search.enrichedCount = 0;
      search.completedAt = new Date();
      await search.save();
      return;
    }
    
    // Deduplicate results at search level BEFORE extraction
    // CRITICAL FIX: Handle Google Places results separately (they have "places:" prefix)
    console.log(`[PROCESS] Deduplicating ${googleResults.length} search results...`);
    const seenUrls = new Set();
    const seenBusinessNames = new Set(); // For Google search links
    const seenPlaceIds = new Set(); // CRITICAL: Track Google Place IDs separately
    const uniqueResults = [];
    
    for (const result of googleResults) {
      // CRITICAL FIX: Handle Google Places results first (before URL parsing)
      if (result.link && result.link.startsWith('places:') || result.isGooglePlace) {
        // Extract place ID from link or result
        const placeId = result.placeId || (result.link.startsWith('places:') ? result.link.replace('places:', '').trim() : null);
        
        if (placeId) {
          // Deduplicate by place ID (most reliable for Google Places)
          if (!seenPlaceIds.has(placeId)) {
            seenPlaceIds.add(placeId);
            uniqueResults.push(result);
          } else {
            console.log(`[PROCESS] Skipping duplicate place ID: ${placeId} (${result.title})`);
          }
        } else {
          // Fallback: deduplicate by business name + address if no place ID
          const businessKey = `${result.title.toLowerCase().trim()}_${(result.snippet || result.address || '').toLowerCase().trim()}`;
          if (!seenBusinessNames.has(businessKey)) {
            seenBusinessNames.add(businessKey);
            uniqueResults.push(result);
          } else {
            console.log(`[PROCESS] Skipping duplicate business: ${result.title} (${result.snippet || result.address})`);
          }
        }
        continue; // Skip URL parsing for Places results
      }
      
      try {
        const url = new URL(result.link);
        const isGoogleSearchLink = url.hostname.includes('google.com') && url.pathname.includes('/search');
        
        if (isGoogleSearchLink) {
          // For Google search links, deduplicate by business name + snippet (location)
          const businessKey = `${result.title.toLowerCase().trim()}_${(result.snippet || '').toLowerCase().trim()}`;
          if (!seenBusinessNames.has(businessKey)) {
            seenBusinessNames.add(businessKey);
            uniqueResults.push(result);
          } else {
            console.log(`[PROCESS] Skipping duplicate business: ${result.title} (${result.snippet})`);
          }
        } else {
          // For real websites, deduplicate by hostname
          const normalizedUrl = url.hostname.replace('www.', '').toLowerCase();
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            uniqueResults.push(result);
          } else {
            console.log(`[PROCESS] Skipping duplicate URL: ${result.link}`);
          }
        }
      } catch (e) {
        // If URL parsing fails, include it anyway (might be a business name search)
        uniqueResults.push(result);
      }
    }
    
    console.log(`[PROCESS] After deduplication: ${uniqueResults.length} unique results (removed ${googleResults.length - uniqueResults.length} duplicates)`);
    
    search.totalResults = uniqueResults.length;
    search.status = 'extracting';
    await search.save();
    
    // Pre-process: expand directory/list pages into individual company links
    const expandedResults = [];
    let directoryCount = 0;
    for (const r of uniqueResults) {
      const shouldExpand = (() => {
        try { return isDirectorySite(r.link, r.title); } catch { return false; }
      })();
      if (shouldExpand) {
        directoryCount++;
        try {
          console.log(`[PROCESS] Expanding directory/list page: "${r.title}" → ${r.link}`);
          const maxExpand = Math.max(15, Math.min(50, Math.floor(search.resultCount / 2))); // Expand more aggressively
          const derived = await expandDirectoryCompanies(r.link, maxExpand);
          if (derived && derived.length > 0) {
            console.log(`[PROCESS] ✅ Expanded "${r.title}" into ${derived.length} companies`);
            expandedResults.push(...derived);
            continue;
          } else {
            console.log(`[PROCESS] ⚠️  Directory expansion returned 0 companies for "${r.title}"`);
          }
        } catch (e) {
          console.log(`[PROCESS] Directory expansion failed for "${r.title}": ${e.message}`);
        }
        // Skip the directory entry if no derived items
        continue;
      }
      expandedResults.push(r);
    }
    console.log(`[PROCESS] Directory expansion: Found ${directoryCount} directory pages, expanded to ${expandedResults.length} total results`);
    
    // PROGRESSIVE EXTRACTION: Start extracting immediately with first batch
    // Don't wait for all results - start as soon as we have enough to begin
    const initialTarget = Math.min(30, expandedResults.length);
    const MAX_WORKERS = 4; // cap parallelism
    const TIME_BUDGET_MS = 25000; // ~25s budget for initial reveal
    const deadline = Date.now() + TIME_BUDGET_MS;
    
    // Start extraction immediately with first batch (progressive approach)
    const initialBatch = expandedResults.slice(0, initialTarget);
    const backgroundBatch = expandedResults.slice(initialTarget);
    console.log(`[PROCESS] Step 2/3: Starting PROGRESSIVE extraction - ${initialBatch.length} leads ready now (of ${expandedResults.length} total)...`);
    const leads = [];
    let extractedCount = 0;
    let errorCount = 0;
    
    // Fix: Website-based lock to prevent concurrent processing of same website
    // Map<normalizedWebsite, Promise> - tracks ongoing processing per website
    const websiteLocks = new Map();

    async function processOne(result, i, total) {
      const itemStartTime = Date.now();
      let lockResolver = null; // Fix: Declare lockResolver in function scope
      const normalizedWebsite = normalizeUrl(result.link); // Fix: Declare early for error handling
      
      console.log(`[PROCESS] [${i + 1}/${total}] Processing: ${result.title}`);
      console.log(`[PROCESS] [${i + 1}/${total}] URL: ${result.link}`);
      
      try {
        // Extract contact info (pass search country for phone formatting)
        const extractStartTime = Date.now();
        const extracted = await extractContactInfo(result.link, search.country);
        const extractDuration = Date.now() - extractStartTime;
        
        console.log(`[PROCESS] [${i + 1}/${total}] Extraction took ${extractDuration}ms`);
        
        // Fix: Use extracted company name as primary source, fallback to cleaned search title
        // This prevents person pages (e.g., "Darren Levy - CEO") from being treated as company names
        const extractedCompanyName = extracted.companyName;
        const fallbackCompanyName = result.title.split(' - ')[0] || result.title;
        const isPersonPage = result.title.includes(' - ');
        
        // CRITICAL FIX: Detect if extractedCompanyName is a Google Place ID (starts with "ChIJ")
        // Place IDs look like: ChIJ9TCVpbKNOxARdEJJj7-rgEE
        const extractedIsPlaceId = extractedCompanyName && 
          extractedCompanyName.trim().startsWith('ChIJ') && 
          extractedCompanyName.trim().length > 20 &&
          /^ChIJ[a-zA-Z0-9_-]+$/.test(extractedCompanyName.trim());
        
        // Fix: If extraction returned minimal data (e.g., from failed Google search link resolution),
        // prefer the search result title over "Unknown Business" or similar generic names
        // Also prefer search result title if extracted name looks like it came from domain (e.g., "Tiktok" from tiktok.com)
        // CRITICAL: If extractedCompanyName is a Place ID, ignore it and use fallbackCompanyName
        let finalCompanyName = (extractedIsPlaceId || !extractedCompanyName) ? fallbackCompanyName : extractedCompanyName;
        
        // Check if extracted name looks like it came from a domain (single word, no spaces, matches domain pattern)
        const extractedLooksLikeDomain = extractedCompanyName && 
          !extractedCompanyName.includes(' ') && 
          extractedCompanyName.length < 20 &&
          /^[a-zA-Z0-9]+$/.test(extractedCompanyName.replace(/[^a-zA-Z0-9]/g, ''));
        
        // Try to match extracted name to domain from URL
        let extractedMatchesDomain = false;
        if (extractedCompanyName && result.link) {
          try {
            const urlObj = new URL(result.link);
            const domain = urlObj.hostname.replace('www.', '').split('.')[0].toLowerCase();
            const extractedLower = extractedCompanyName.toLowerCase().replace(/[^a-z0-9]/g, '');
            extractedMatchesDomain = extractedLower === domain || extractedLower.startsWith(domain) || domain.startsWith(extractedLower);
          } catch (e) {
            // URL parsing failed, ignore
          }
        }
        
        if ((!extractedCompanyName || 
             extractedCompanyName.toLowerCase() === 'unknown business' || 
             extractedCompanyName.toLowerCase() === 'unknown company' ||
             (extractedLooksLikeDomain && extractedMatchesDomain)) && 
            !isPersonPage && 
            fallbackCompanyName && 
            fallbackCompanyName.trim().length > 2 &&
            fallbackCompanyName !== extractedCompanyName) {
          // Use search result title as company name if extraction gave us a generic name or domain-based name
          console.log(`[PROCESS] [${i + 1}/${total}] Using search result title "${fallbackCompanyName}" instead of extracted "${extractedCompanyName}"`);
          finalCompanyName = fallbackCompanyName;
        } else if (extractedCompanyName && extractedCompanyName.trim().length > 0) {
          finalCompanyName = extractedCompanyName;
        }
        
        // If no extracted name and it's a person page, try to derive from URL domain
        if (!finalCompanyName && isPersonPage) {
          try {
            const urlObj = new URL(result.link);
            const domain = urlObj.hostname.replace('www.', '');
            const domainName = domain.split('.')[0];
            if (domainName && domainName.length > 2) {
              // Capitalize first letter
              finalCompanyName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
              console.log(`[PROCESS] [${i + 1}/${total}] Derived company name from domain for person page: ${finalCompanyName}`);
            }
          } catch (urlError) {
            // URL parsing failed, will skip below
          }
        }
        
        // If still no company name and it's a person page, skip this lead
        // We don't want to create leads with person names as company names
        if (!finalCompanyName && isPersonPage) {
          console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping person page (no company name found): ${result.title}`);
          return; // Skip this result (no lock created yet)
        }
        
        // Use fallback only if not a person page
        // Fix: Add explicit check to prevent person names from being used as company names
        if (!finalCompanyName && !isPersonPage) {
          finalCompanyName = fallbackCompanyName;
        }
        
        // CRITICAL FIX: Validate company name using centralized config (pattern-based)
        const isGenericName = (name) => {
          return isGenericNameFromConfig(name);
        };
        
        // CRITICAL FIX: Reject Google Place IDs as company names (they start with "ChIJ" and are 20+ chars)
        const finalNameIsPlaceId = finalCompanyName && 
          finalCompanyName.trim().startsWith('ChIJ') && 
          finalCompanyName.trim().length > 20 &&
          /^ChIJ[a-zA-Z0-9_-]+$/.test(finalCompanyName.trim());
        
        if (finalNameIsPlaceId) {
          console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Company name is a Google Place ID "${finalCompanyName}" - using result.title instead`);
          // Use result.title as fallback
          finalCompanyName = result.title.split(' - ')[0] || result.title;
          // If result.title is also invalid, skip the lead
          if (!finalCompanyName || finalCompanyName.trim().length < 2) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: No valid company name found (Place ID and result.title both invalid)`);
            return;
          }
        }
        
        // Fix: Check if this is a Google search link (fallback data)
        const isGoogleSearchLink = result.link && (
          result.link.includes('google.com/search') ||
          result.link.includes('google.com/search?')
        );
        
        // CRITICAL FIX: Reject generic names regardless of source
        if (isGenericName(finalCompanyName)) {
          console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: Generic/placeholder company name "${finalCompanyName}" from ${result.link}`);
          return; // Skip this result (no lock created yet)
        }
        
        // Fix: Relax validation for Google search links (they have limited data)
        // Allow generic names like "Grocery store" if they're at least 2 chars
        if (isGoogleSearchLink) {
          // Relaxed validation for Google search links
          if (!finalCompanyName || finalCompanyName.trim().length < 2) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: Invalid company name "${finalCompanyName}" from Google search link ${result.link}`);
            return; // Skip this result (no lock created yet)
          }
        } else {
          // Strict validation for regular websites
          if (!finalCompanyName || 
              finalCompanyName.trim().length < 2 || 
              finalCompanyName.trim().length > 200 ||
              /^[\d\s\-_\.]+$/.test(finalCompanyName.trim()) || // Only numbers/special chars
              finalCompanyName.trim().toLowerCase() === 'unknown' ||
              finalCompanyName.trim().toLowerCase() === 'n/a' ||
              finalCompanyName.trim().toLowerCase() === 'null') {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: Invalid company name "${finalCompanyName}" from ${result.link}`);
            return; // Skip this result (no lock created yet)
          }
        }
        
        // Fix: Reject irrelevant business types (domain sellers, computer repair, military contractors, etc.)
        // These should not appear in phone store or other specific business searches
        const companyNameLower = finalCompanyName.toLowerCase();
        const titleLower = (result.title || '').toLowerCase();
        const urlLower = (result.link || '').toLowerCase();
        
        // CRITICAL FIX: Reject blog posts, articles, guides immediately (before expensive AI check)
        const isBlogPostOrArticle = 
          /\b(how to|guide|tips|advice|starting a|launching a|getting started|learn|tutorial|article|blog|post|licenses?|permits?|requirements?|legal|steps?|process)\b/i.test(titleLower) &&
          (/\b(restaurant|business|company|store|shop|hospital|clinic|school|university)\b/i.test(titleLower) || 
           /\/(blog|article|post|guide|how-to|tips|advice|learn|tutorial)\//i.test(urlLower));
        
        if (isBlogPostOrArticle) {
          console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: Blog post/article about topic, not actual business: "${finalCompanyName}" from ${result.link}`);
          return; // Skip this result (no lock created yet)
        }
        
        // CRITICAL FIX: Use AI-based relevance filtering instead of hardcoded patterns
        // This dynamically checks if the lead is relevant to the search query
        const hasSpecificQuery = search.industry && search.industry.trim().length > 0;
        
        // Always check relevance for specific queries (restaurants, hospitals, etc.)
        // Also check if query contains business type keywords even without explicit industry
        const queryLower = (search.query || '').toLowerCase();
        const hasBusinessTypeInQuery = /\b(restaurant|hospital|clinic|school|university|store|shop|company|business|agency|firm)\b/i.test(queryLower);
        
        if (hasSpecificQuery || hasBusinessTypeInQuery) {
          try {
            const relevanceCheck = await isLeadRelevant(
              {
                companyName: finalCompanyName,
                website: result.link,
                aboutText: extracted.aboutText || '',
                categorySignals: extracted.categorySignals || []
              },
              search.query,
              search.industry || search.query // Use query as industry if industry not set
            );
            
            if (!relevanceCheck.isRelevant && relevanceCheck.confidence > 0.7) {
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: Irrelevant business (${relevanceCheck.reason}): "${finalCompanyName}" from ${result.link}`);
              return; // Skip this result (no lock created yet)
            }
          } catch (relevanceError) {
            // If AI relevance check fails, continue processing (don't block leads)
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Relevance check failed: ${relevanceError.message}, continuing anyway`);
          }
        }
        
        // AI-based relevance filtering (only for specific queries to avoid false positives)
        if (hasSpecificQuery && process.env.OPENAI_API_KEY) {
          try {
            const { isLeadRelevant } = await import('../utils/relevanceFilter.js');
            const relevance = await isLeadRelevant({
              companyName: finalCompanyName,
              website: result.link,
              aboutText: result.snippet || '',
              categorySignals: []
            }, search.query, search.industry);
            
            if (!relevance.relevant && relevance.confidence > 0.7) {
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: AI determined irrelevant (${relevance.reason}, confidence: ${relevance.confidence}): "${finalCompanyName}"`);
              return; // Skip this result
            }
          } catch (relevanceError) {
            console.log(`[PROCESS] [${i + 1}/${total}] Relevance check error (continuing): ${relevanceError.message}`);
            // Continue processing if relevance check fails
          }
        }
        
        // Fix: Google search links are unique per query - don't lock them or treat as duplicates
        // Google search links (e.g., https://www.google.com/search?q=...) should be processed independently
        // because each search query is different, even though they all normalize to "google.com"
        // (isGoogleSearchLink already declared above)
        
        // Fix: Check for concurrent processing of same website (but skip for Google search links)
        if (normalizedWebsite && !isGoogleSearchLink && websiteLocks.has(normalizedWebsite)) {
          // Another lead with same website is being processed - wait for it (with timeout)
          console.log(`[PROCESS] [${i + 1}/${total}] ⏳ Waiting for concurrent processing of ${normalizedWebsite}...`);
          try {
            // Add timeout to prevent infinite waiting (30 seconds max)
            await Promise.race([
              websiteLocks.get(normalizedWebsite),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Lock wait timeout')), 30000))
            ]);
          } catch (err) {
            if (err.message === 'Lock wait timeout') {
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Lock wait timeout for ${normalizedWebsite}, skipping to prevent deadlock`);
              return; // Skip this item to prevent deadlock
            }
            // Previous processing failed, continue anyway
          }
          // After waiting, check if duplicate was already created
          const existingDuplicate = await Lead.findOne({
            $or: [
              { website: result.link },
              { website: { $regex: new RegExp(`^https?://(www\\.)?${normalizedWebsite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') } }
            ],
            searchId: search._id,
            isDuplicate: false
          });
          if (existingDuplicate) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Duplicate already created while waiting: ${normalizedWebsite}`);
            return; // Skip - duplicate already exists
          }
        }
        
        // Create lock for this website (but skip for Google search links - they're unique per query)
        const lockPromise = new Promise((resolve) => {
          lockResolver = resolve;
        });
        if (normalizedWebsite && !isGoogleSearchLink) {
          websiteLocks.set(normalizedWebsite, lockPromise);
        }
        
        // Create lead record
        const lead = new Lead({
            searchId: search._id,
            rawTitle: result.title,
            rawSnippet: result.snippet,
            rawLink: result.link,
            companyName: finalCompanyName.trim(),
            website: result.link,
            extractionStatus: 'extracting'
          });
        
        // Merge extracted data (extracted company name takes priority if available)
        // Fix: Never use extractedCompanyName on person pages, as it may be a person's name
        // Person pages should only use validated company names (from domain derivation or skip entirely)
        // This prevents person names from being incorrectly used as company names
        // CRITICAL FIX: Also reject Place IDs (they start with "ChIJ" and are 20+ chars)
        const extractedNameIsPlaceId = extractedCompanyName && 
          extractedCompanyName.trim().startsWith('ChIJ') && 
          extractedCompanyName.trim().length > 20 &&
          /^ChIJ[a-zA-Z0-9_-]+$/.test(extractedCompanyName.trim());
        
        if (extractedCompanyName && extractedCompanyName.trim().length > 0 && !extractedNameIsPlaceId) {
          // Only use extractedCompanyName if it's NOT a person page AND NOT a Place ID
          // On person pages, we've already validated finalCompanyName (from domain or skipped the lead)
          // Using extractedCompanyName on person pages risks using a person's name as company name
          // Using Place IDs as company names breaks everything downstream
          if (!isPersonPage) {
            lead.companyName = extractedCompanyName;
          }
          // If it's a person page, keep the validated finalCompanyName (from domain derivation)
          // This ensures we never use person names as company names
        }
        // If extractedCompanyName is a Place ID, finalCompanyName already uses fallbackCompanyName (from result.title)
        // Fix: Filter out social media URLs - never use them as main website
        // Try extracted website first, then original link, but reject social media URLs
        let websiteUrl = null;
        
        // CRITICAL FIX: Skip social media URLs early (before processing)
        if (isSocialMediaUrl(result.link)) {
          console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping social media URL: ${result.link}`);
          return; // Skip immediately - don't process social media URLs as leads
        }
        
        if (extracted.website && !isSocialMediaUrl(extracted.website)) {
          websiteUrl = extracted.website;
          console.log(`[PROCESS] [${i + 1}/${total}] Using extracted website: ${extracted.website}`);
        } else if (result.link && !isSocialMediaUrl(result.link)) {
          websiteUrl = result.link;
        } else {
          // Both are social media URLs - skip this lead
          const socialUrl = extracted.website || result.link;
          if (socialUrl && isSocialMediaUrl(socialUrl)) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping social media URL as website: ${socialUrl}`);
          }
        }
        
        // CRITICAL FIX: For Google Places results, try to fetch website via Place Details API
        // Extract place ID from link if it's in "places:PLACE_ID" format
        let placeId = result.placeId;
        const isPlacesLink = result.link && result.link.startsWith('places:');
        if (!placeId && isPlacesLink) {
          placeId = result.link.replace('places:', '').trim();
        }
        
        // CRITICAL: Always try Place Details for Google Places results (even if we have a website, to get phone/address)
        // Check if we need to fetch Place Details (missing website, phone, or address)
        const needsPlaceDetails = (!websiteUrl || websiteUrl === '' || !result.phone || !result.address) && (result.isGooglePlace || isPlacesLink) && placeId;
        
        if (needsPlaceDetails) {
          try {
            console.log(`[PROCESS] [${i + 1}/${total}] 🔍 Fetching Place Details for: ${placeId}`);
            const { getPlaceDetails } = await import('../services/searchProviders.js');
            const placeDetails = await getPlaceDetails(placeId);
            if (placeDetails) {
              // Get website (only if it's a valid URL, not empty string)
              if ((!websiteUrl || websiteUrl === '' || websiteUrl.trim() === '') && placeDetails.website && placeDetails.website.trim() !== '' && !isSocialMediaUrl(placeDetails.website)) {
                websiteUrl = placeDetails.website.trim();
                console.log(`[PROCESS] [${i + 1}/${total}] ✅ Found website via Place Details: ${websiteUrl}`);
              } else if (placeDetails.website && (placeDetails.website.trim() === '' || isSocialMediaUrl(placeDetails.website))) {
                console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Place Details returned invalid/empty website: "${placeDetails.website}"`);
              }
              // Also get phone if not already set
              if (!result.phone && (placeDetails.formatted_phone_number || placeDetails.international_phone_number)) {
                result.phone = placeDetails.formatted_phone_number || placeDetails.international_phone_number;
                console.log(`[PROCESS] [${i + 1}/${total}] ✅ Found phone via Place Details: ${result.phone}`);
              }
              // Also get address if not already set
              if (!result.address && placeDetails.formatted_address) {
                result.address = placeDetails.formatted_address;
                console.log(`[PROCESS] [${i + 1}/${total}] ✅ Found address via Place Details: ${result.address}`);
              }
            } else {
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Place Details returned no data for: ${placeId}`);
            }
          } catch (placeDetailsError) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Place Details fetch failed: ${placeDetailsError.message}`);
          }
        } else if ((result.isGooglePlace || isPlacesLink) && !placeId) {
          console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Google Place detected but no place ID found (link: ${result.link})`);
        }
        
        // CRITICAL FIX: If still no website (or empty string, or invalid URL), use Google Custom Search API to find it
        // This is especially important for Google Places results which often don't have websites
        // Check AFTER Place Details, but BEFORE we give up on the website
        // Also check if websiteUrl is a valid HTTP/HTTPS URL (not a Place ID or invalid format)
        let hasValidWebsite = false;
        if (websiteUrl && websiteUrl.trim() !== '') {
          try {
            const testUrl = new URL(websiteUrl);
            hasValidWebsite = (testUrl.protocol === 'http:' || testUrl.protocol === 'https:') && 
                             !isSocialMediaUrl(websiteUrl) &&
                             !isInvalidDomain(testUrl.hostname.toLowerCase());
          } catch (e) {
            hasValidWebsite = false; // Invalid URL format
          }
        }
        
        const needsWebsiteSearch = !hasValidWebsite && finalCompanyName && finalCompanyName.trim().length > 2 && !finalCompanyName.startsWith('places:');
        
        if (needsWebsiteSearch) {
          console.log(`[PROCESS] [${i + 1}/${total}] 🔍 Website search needed: websiteUrl="${websiteUrl}", finalCompanyName="${finalCompanyName}", hasValidWebsite=${hasValidWebsite}`);
          try {
            // Try Google Custom Search API first (more reliable for finding official websites)
            if (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY && process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
              const locationPart = search.location ? ` ${search.location}` : '';
              const searchQuery = `"${finalCompanyName}"${locationPart} official website`.trim();
              console.log(`[PROCESS] [${i + 1}/${total}] 🔍 Using Google Custom Search to find website: "${searchQuery}"`);
              
              const { searchGoogle } = await import('../utils/googleSearchAPI.js');
              const searchResults = await Promise.race([
                searchGoogle(searchQuery),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
              ]).catch((err) => {
                console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Google Custom Search error: ${err.message}`);
                return [];
              });
              
              console.log(`[PROCESS] [${i + 1}/${total}] Google Custom Search returned ${searchResults?.length || 0} results`);
              
              if (searchResults && searchResults.length > 0) {
                // Prioritize results that match the company name in the title/snippet
                const companyNameLower = finalCompanyName.toLowerCase();
                const candidate = searchResults.find(r => {
                  if (!r.link || isSocialMediaUrl(r.link)) return false;
                  const titleLower = (r.title || '').toLowerCase();
                  const snippetLower = (r.snippet || '').toLowerCase();
                  return titleLower.includes(companyNameLower) || snippetLower.includes(companyNameLower);
                }) || searchResults.find(r => r.link && !isSocialMediaUrl(r.link));
                
                if (candidate) {
                  try {
                    const urlObj = new URL(candidate.link);
                    const hostname = urlObj.hostname.toLowerCase();
                    if (!isInvalidDomain(hostname)) {
                      websiteUrl = candidate.link;
                      console.log(`[PROCESS] [${i + 1}/${total}] ✅ Found website via Google Custom Search: ${websiteUrl}`);
                    } else {
                      console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Google Custom Search found invalid domain: ${hostname}`);
                    }
                  } catch (e) {
                    console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Invalid URL from Google Custom Search: ${e.message}`);
                  }
                } else {
                  console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Google Custom Search found no valid website candidates`);
                }
              } else {
                console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Google Custom Search returned no results`);
              }
            } else {
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Google Custom Search API not configured (missing API key or engine ID)`);
            }
            
            // Fallback to internal Google search if Custom Search didn't work
            if (!websiteUrl) {
              const searchQuery = `${finalCompanyName} ${search.location || ''} official site`.trim();
              console.log(`[PROCESS] [${i + 1}/${total}] 🔍 Fallback: Attempting to resolve website via internal search: "${searchQuery}"`);
              const { searchGoogle } = await import('../services/googleSearch.js');
              
              const searchResults = await Promise.race([
                searchGoogle(searchQuery, search.country, search.location, 3),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
              ]).catch(() => []);
              
              if (searchResults && searchResults.length > 0) {
                const candidate = searchResults.find(r => r.link && !isSocialMediaUrl(r.link));
                if (candidate) {
                  try {
                    const urlObj = new URL(candidate.link);
                    const hostname = urlObj.hostname.toLowerCase();
                    if (!isInvalidDomain(hostname)) {
                      websiteUrl = candidate.link;
                      console.log(`[PROCESS] [${i + 1}/${total}] ✅ Resolved website via internal search: ${websiteUrl}`);
                    }
                  } catch (e) {
                    // Invalid URL, continue
                  }
                }
              }
            }
          } catch (resolveError) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Website resolution failed: ${resolveError.message}`);
          }
        }
        
        // CRITICAL FIX: Allow leads without websites if we have quality data (name, address, phone)
        // This is especially important for Google Places results which may not have websites
        const hasQualityData = finalCompanyName && 
                              finalCompanyName.trim().length > 2 &&
                              (result.address || result.phone || extracted.address || extracted.phoneNumbers?.length > 0);
        
        if (!websiteUrl) {
          if (hasQualityData) {
            // Allow lead without website if we have good data
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  No website URL, but allowing lead with quality data (name, address/phone)`);
            lead.website = null; // Explicitly set to null
          } else {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: No website and insufficient quality data`);
            return; // Skip this result - no website and no quality data
          }
        } else {
          // CRITICAL FIX: Reject invalid domains using centralized config
          try {
            const urlObj = new URL(websiteUrl);
            const hostname = urlObj.hostname.toLowerCase();
            if (isInvalidDomain(hostname)) {
              // If invalid domain but we have quality data, allow it without website
              if (hasQualityData) {
                console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Invalid website domain "${hostname}", but allowing lead with quality data`);
                lead.website = null;
              } else {
                console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: Invalid website domain "${hostname}"`);
                return; // Skip this result - invalid domain
              }
            } else {
              lead.website = websiteUrl;
              console.log(`[PROCESS] [${i + 1}/${total}] ✅ Saved website to lead: ${websiteUrl}`);
            }
          } catch (urlError) {
            // Invalid URL format - if we have quality data, allow without website
            if (hasQualityData) {
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Invalid website URL format, but allowing lead with quality data`);
              lead.website = null;
            } else {
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Skipping lead: Invalid website URL "${websiteUrl}"`);
              return; // Skip this result - invalid URL
            }
          }
        }
        
        // Guard: first‑party vs directory classifier (check both original link and extracted website)
        // Uses dynamic pattern-based detection, not hardcoded domain lists
        try {
          const { quickClassifyUrl } = await import('../services/extractor.js');
          const { isDirectorySite } = await import('../services/searchProviders.js');
          
          // Check original link using dynamic pattern-based detection
          if (isDirectorySite(result.link, result.title)) {
            console.log(`[PROCESS] [${i + 1}/${total}] Original link is directory: ${result.link}. Skipping.`);
            return;
          }
          
          // Check extracted website using dynamic pattern-based detection
          if (lead.website) {
            if (isDirectorySite(lead.website, lead.companyName)) {
              console.log(`[PROCESS] [${i + 1}/${total}] Extracted website is directory: ${lead.website}. Skipping.`);
              return;
            }
            
            // Also use quickClassifyUrl for additional validation (pattern-based)
            // BUT: Be more lenient - only skip if strongly directory (score <= -3)
            // This prevents false positives for restaurants/venues that might have directory-like patterns
            const cls = await quickClassifyUrl(lead.website);
            if (cls && typeof cls.score === 'number' && cls.score <= -3) {
              console.log(`[PROCESS] [${i + 1}/${total}] Classified as directory/list (score=${cls.score}): ${lead.website}. Skipping.`);
              return;
            } else if (cls && typeof cls.score === 'number' && cls.score < 0) {
              // Log borderline cases but don't skip (score between -1 and -2)
              console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Borderline directory classification (score=${cls.score}), proceeding anyway: ${lead.website}`);
            }
          }
        } catch (clsErr) {
          console.log(`[PROCESS] [${i + 1}/${total}] Classifier error (continuing): ${clsErr.message}`);
        }
        
        // CRITICAL FIX: If we found a website (via Google Custom Search or Place Details), re-extract from it using ScraperAPI
        // This gives us decision makers and emails that we couldn't get from the Places API
        // BUT: Only re-extract if websiteUrl is a real URL, not a Place ID
        const isRealWebsiteUrl = websiteUrl && 
                                 websiteUrl.trim() !== '' &&
                                 !websiteUrl.startsWith('places:') && 
                                 (websiteUrl.startsWith('http://') || websiteUrl.startsWith('https://'));
        
        // Re-extract if:
        // 1. We have a real website URL
        // 2. It's a Google Place result (which typically lacks decision makers/emails) OR we just found it via Google Custom Search
        // 3. We haven't already extracted from this website (or extracted.website is different/empty)
        // CRITICAL: Always re-extract if we found a website and haven't extracted from it yet (especially for Google Places)
        const shouldReExtract = isRealWebsiteUrl && 
                               ((result.isGooglePlace || isPlacesLink) || !extracted.website) && 
                               (!extracted.website || extracted.website !== websiteUrl);
        
        if (shouldReExtract) {
          try {
            console.log(`[PROCESS] [${i + 1}/${total}] 🔄 Re-extracting from found website: ${websiteUrl}`);
            const reExtracted = await extractContactInfo(websiteUrl, search.country);
            
            // Merge re-extracted data (prioritize website data for emails/decision makers, but keep Places data for phone/address)
            if (reExtracted) {
              // Merge decision makers (website extraction is more reliable)
              if (reExtracted.decisionMakers && reExtracted.decisionMakers.length > 0) {
                extracted.decisionMakers = reExtracted.decisionMakers;
                console.log(`[PROCESS] [${i + 1}/${total}] ✅ Found ${reExtracted.decisionMakers.length} decision makers from website`);
              }
              
              // Merge emails (website extraction is more reliable)
              if (reExtracted.emails && reExtracted.emails.length > 0) {
                extracted.emails = reExtracted.emails;
                console.log(`[PROCESS] [${i + 1}/${total}] ✅ Found ${reExtracted.emails.length} emails from website`);
              }
              
              // Merge phone numbers (but prioritize Places API phone if available)
              if (reExtracted.phoneNumbers && reExtracted.phoneNumbers.length > 0 && !result.phone) {
                extracted.phoneNumbers = reExtracted.phoneNumbers;
              }
              
              // Merge address (but prioritize Places API address if available)
              if (reExtracted.address && !result.address) {
                extracted.address = reExtracted.address;
              }
              
              // Merge other data
              if (reExtracted.aboutText) extracted.aboutText = reExtracted.aboutText;
              if (reExtracted.categorySignals) extracted.categorySignals = reExtracted.categorySignals;
              if (reExtracted.socials) extracted.socials = reExtracted.socials;
            }
          } catch (reExtractError) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Re-extraction from website failed: ${reExtractError.message}`);
          }
        }
        
        // If result is from Google Places API, prioritize Places data (name, phone, address)
        // BUT preserve website-extracted decision makers and emails
        if (result.isGooglePlace) {
          // Use Places API phone if available (most reliable)
          if (result.phone) {
            const countryCode = search.country || null;
            const formattedPhone = formatPhone(result.phone, countryCode);
            lead.phoneNumbers = [{
              phone: formattedPhone,
              country: detectCountry(formattedPhone),
              formatted: formattedPhone,
              source: 'google_places_api',
              confidence: 0.95
            }];
            console.log(`[PROCESS] [${i + 1}/${total}] Using phone from Places API: ${formattedPhone}`);
          }
          
          // Use Places API address (more reliable than extracted)
          if (result.address) {
            lead.address = result.address;
            console.log(`[PROCESS] [${i + 1}/${total}] Using address from Places API: ${result.address}`);
          }
          
          // Use Places API name if extracted name is generic
          if (result.title && (!extracted.companyName || 
              extracted.companyName.toLowerCase() === 'unknown business' ||
              extracted.companyName.toLowerCase() === 'unknown company')) {
            lead.companyName = result.title;
            console.log(`[PROCESS] [${i + 1}/${total}] Using name from Places API: ${result.title}`);
          }
        } else {
          // For non-Places results, use extracted data but fallback to result data
          if (result.phone && (!extracted.phoneNumbers || extracted.phoneNumbers.length === 0)) {
            const countryCode = search.country || null;
            const formattedPhone = formatPhone(result.phone, countryCode);
            lead.phoneNumbers = [{
              phone: formattedPhone,
              country: detectCountry(formattedPhone),
              formatted: formattedPhone,
              source: 'search_result',
              confidence: 0.8
            }];
          }
          
          if (result.address && !extracted.address) {
            lead.address = result.address;
          }
        }
        
        // Filter emails - only keep valid business emails
        // CRITICAL FIX: Ensure emails are always objects with 'email' property (not strings)
        let filteredEmails = (extracted.emails || []).filter(email => {
          const emailStr = typeof email === 'string' ? email : (email.email || email);
          // Filter out generic/non-business emails
          return !emailStr.includes('noreply') && 
                 !emailStr.includes('no-reply') &&
                 !emailStr.includes('donotreply') &&
                 !emailStr.includes('example.com');
        }).map(email => {
          // Normalize to object format: { email: string, source?: string, confidence?: number }
          if (typeof email === 'string') {
            return { email, source: 'website', confidence: 0.8 };
          }
          return {
            email: email.email || email,
            source: email.source || 'website',
            confidence: email.confidence || 0.8
          };
        });
        
        // NEW: Verify emails and add deliverability scores (non-blocking)
        if (filteredEmails.length > 0) {
          try {
            // Check if email verification is enabled (default: true, uses free syntax validation)
            const enableEmailVerification = process.env.ENABLE_EMAIL_VERIFICATION !== 'false';
            const useEmailAPI = process.env.USE_EMAIL_VERIFICATION_API === 'true'; // Optional paid API
            
            if (enableEmailVerification) {
              console.log(`[PROCESS] [${i + 1}/${total}] Verifying ${filteredEmails.length} email(s)...`);
              const verifiedEmails = await verifyEmails(filteredEmails, useEmailAPI);
              
              // Update emails with deliverability data
              lead.emails = verifiedEmails.map(emailObj => ({
                email: emailObj.email,
                source: emailObj.source || 'website',
                confidence: emailObj.confidence || 0.8,
                deliverability: emailObj.deliverability || {
                  score: 0,
                  status: 'unknown',
                  checkedAt: new Date(),
                  method: 'unknown'
                }
              }));
              
              // Log deliverability summary
              const validCount = lead.emails.filter(e => e.deliverability?.status === 'valid').length;
              const riskyCount = lead.emails.filter(e => e.deliverability?.status === 'risky').length;
              const invalidCount = lead.emails.filter(e => e.deliverability?.status === 'invalid').length;
              console.log(`[PROCESS] [${i + 1}/${total}] Email deliverability: ${validCount} valid, ${riskyCount} risky, ${invalidCount} invalid`);
            } else {
              // Email verification disabled, use filtered emails as-is
              lead.emails = filteredEmails;
            }
          } catch (emailVerifyError) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Email verification failed: ${emailVerifyError.message}, using filtered emails`);
            // Fallback to filtered emails without deliverability data
            lead.emails = filteredEmails;
          }
        } else {
          lead.emails = filteredEmails;
        }
        
        // CRITICAL FIX: Preserve phone numbers from Places API (don't overwrite with empty extracted data)
        // Only filter/extend if we don't already have phone numbers from Places API
        if (!lead.phoneNumbers || lead.phoneNumbers.length === 0) {
          lead.phoneNumbers = (extracted.phoneNumbers || []).filter(phone => {
            const phoneStr = phone.phone || phone;
            // Additional validation
            if (!phoneStr || phoneStr.length < 10) return false;
            // Reject obviously wrong numbers
            if (phoneStr.match(/^[01]{8,}$/)) return false; // All 0s or 1s
            if (phoneStr.match(/^\d{1,3}$/)) return false; // Too short
            return true;
          });
        }
        lead.whatsappLinks = extracted.whatsappLinks;
        lead.socials = extracted.socials;
        // CRITICAL FIX: Preserve address from Places API (don't overwrite with null extracted data)
        if (!lead.address) {
          lead.address = extracted.address;
        }
        lead.aboutText = extracted.aboutText;
        lead.categorySignals = extracted.categorySignals;
        
        // Process decision makers and generate emails
        // CRITICAL FIX: Always initialize decisionMakers array, even if empty
        if (extracted.decisionMakers && extracted.decisionMakers.length > 0) {
          console.log(`[PROCESS] [${i + 1}/${total}] Found ${extracted.decisionMakers.length} decision makers from website`);
          
          // Generate emails for decision makers if we have email pattern
          lead.decisionMakers = extracted.decisionMakers.map(dm => {
            // Will be enriched with email pattern later
            return {
              name: dm.name || '',
              title: dm.title || '',
              email: dm.email || null, // Keep email if already found
              source: dm.source || 'website',
              confidence: dm.confidence || 0.7
            };
          });
        } else {
          // CRITICAL: Always initialize as empty array so frontend can check length
          lead.decisionMakers = [];
        }
        
        // Executive discovery (business execs) if we still have few/no names
        try {
          // Phase 2: More aggressive decision maker discovery - try even if we have some
          const siteForDiscovery = lead.website || extracted.website || result.link;
          // CRITICAL FIX: Skip executive discovery for Google Places results without websites (can't crawl "places:" URLs)
          const isPlacesUrl = siteForDiscovery && (siteForDiscovery.startsWith('places:') || result.isGooglePlace);
          
          // Try discovery if we have fewer than 5 decision makers (increased from 3)
          // This ensures we get the best possible decision maker data
          // BUT: Skip if it's a Google Places URL without a real website
          if ((!lead.decisionMakers || lead.decisionMakers.length < 5) && siteForDiscovery && !isPlacesUrl) {
            console.log(`[PROCESS] [${i + 1}/${total}] Discovering executives on ${siteForDiscovery}...`);
            try {
              const execs = await discoverExecutives(siteForDiscovery);
              if (execs && execs.length > 0) {
                const existing = new Set((lead.decisionMakers || []).map(dm => (dm.name || '').toLowerCase()));
                const originalCount = (lead.decisionMakers || []).length;
                const merged = [...(lead.decisionMakers || [])];
                for (const e of execs) {
                  const key = (e.name || '').toLowerCase();
                  if (!existing.has(key) && e.name && e.name.length > 2) {
                    merged.push({ name: e.name, title: e.title || 'Executive', email: null, source: e.source || 'discovery', confidence: e.confidence || 0.7 });
                    existing.add(key);
                  }
                  if (merged.length >= 12) break;
                }
                if (merged.length > originalCount) {
                  lead.decisionMakers = merged;
                  console.log(`[PROCESS] [${i + 1}/${total}] ✅ Found ${merged.length} total decision makers (added ${merged.length - originalCount} from discovery)`);
                }
              }
            } catch (discErr) {
              console.log(`[PROCESS] [${i + 1}/${total}] Exec discovery error: ${discErr.message}`);
            }
          }
        } catch (discErr) {
            console.log(`[PROCESS] [${i + 1}/${total}] Exec discovery skipped: ${discErr.message}`);
        }
        
        lead.extractionStatus = 'extracted';
        
        // CRITICAL FIX: Save phone, address, emails, and decision makers BEFORE enrichment
        // This ensures they're persisted even if enrichment fails or overwrites them
        // Log what we're saving for debugging
        console.log(`[PROCESS] [${i + 1}/${total}] 📊 Data to save: Phones: ${lead.phoneNumbers?.length || 0}, Emails: ${lead.emails?.length || 0}, Decision Makers: ${lead.decisionMakers?.length || 0}, Address: ${lead.address ? 'Yes' : 'No'}`);
        
        // Calculate distance from search location
        try {
          const { calculateLocationDistance } = await import('../utils/distanceCalculator.js');
          if (search.location && (lead.address || lead.enrichment?.location?.formatted)) {
            const companyLocation = lead.enrichment?.location?.formatted || lead.address;
            const distance = calculateLocationDistance(search.location, companyLocation, search.country);
            if (distance !== null) {
              lead.distanceKm = distance;
              console.log(`[PROCESS] [${i + 1}/${total}] Distance: ${distance}km from ${search.location}`);
            }
          }
        } catch (distErr) {
          console.log(`[PROCESS] [${i + 1}/${total}] Distance calculation error: ${distErr.message}`);
        }
        
        // Calculate quality score
        try {
          const { calculateQualityScore } = await import('../utils/qualityScoring.js');
          lead.qualityScore = calculateQualityScore(lead);
          console.log(`[PROCESS] [${i + 1}/${total}] Quality score: ${lead.qualityScore}/5`);
        } catch (qualityErr) {
          console.log(`[PROCESS] [${i + 1}/${total}] Quality scoring error: ${qualityErr.message}`);
          // Continue without quality score (backward compatible)
        }
        
        // Check for duplicates
        const duplicateCheck = await detectDuplicates(lead, search._id);
        // Only treat as duplicate if it's a duplicate within THIS search.
        // Cross-search duplicates are allowed so users can run fresh queries and still see results.
        const dupOf = duplicateCheck.duplicateOf;
        
        // Fix: Check if duplicate is from the same search by verifying the duplicate lead's searchId
        let isSameSearchDup = false;
        let actualDuplicateId = null; // Track the actual duplicate ID to use
        if (duplicateCheck.isDuplicate && dupOf) {
          // Fetch the duplicate lead to check its searchId
          const duplicateLead = await Lead.findById(dupOf).select('searchId');
          
          if (duplicateLead) {
            // Duplicate lead exists - verify it's from the same search
            if (String(duplicateLead.searchId) === String(search._id)) {
              isSameSearchDup = true;
              actualDuplicateId = dupOf; // Use the original duplicate ID
            }
          } else {
            // Fix: Duplicate lead was deleted - do a fallback check in the current search
            // This handles the case where the duplicate lead was deleted between detection and verification
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Duplicate lead ${dupOf} not found, performing fallback duplicate check`);
            
            // Fix: Use proper URL normalization utility
            const normalizedWebsite = normalizeUrl(lead.website);
            let fallbackDuplicate = null;
            
            // Check by website (most reliable) - use proper URL normalization
            if (normalizedWebsite) {
              const domainPattern = normalizedWebsite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              fallbackDuplicate = await Lead.findOne({
                $or: [
                  { website: lead.website },
                  { website: { $regex: new RegExp(`^https?://(www\\.)?${domainPattern}`, 'i') } }
                ],
                searchId: search._id,
                isDuplicate: false,
                _id: { $ne: lead._id }
              });
            }
            
            // If no website match, check by company name
            if (!fallbackDuplicate && lead.companyName && lead.companyName.length > 3) {
              fallbackDuplicate = await Lead.findOne({
                companyName: { $regex: new RegExp(lead.companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
                searchId: search._id,
                isDuplicate: false,
                _id: { $ne: lead._id }
              });
            }
            
            if (fallbackDuplicate) {
              // Found a duplicate in the current search - mark as duplicate
              // Fix: Use the fallback duplicate's ID, not the deleted original
              isSameSearchDup = true;
              actualDuplicateId = fallbackDuplicate._id; // Use the fallback duplicate ID
              console.log(`[PROCESS] [${i + 1}/${total}] ✅ Fallback duplicate check found match: ${fallbackDuplicate._id}`);
            } else {
              // No duplicate found in current search - likely was from another search or was deleted
              console.log(`[PROCESS] [${i + 1}/${total}] ℹ️  No duplicate found in current search (original duplicate lead was deleted or from another search)`);
            }
          }
        }
        
        lead.isDuplicate = isSameSearchDup;
        lead.duplicateOf = isSameSearchDup ? actualDuplicateId : null;
        
        // Fix: Use atomic findOneAndUpdate to prevent race conditions
        // Try to save, but if duplicate was created concurrently, mark as duplicate
        try {
          await lead.save();
        } catch (saveError) {
          // If save fails due to duplicate key or concurrent modification, check again
          if (saveError.code === 11000 || saveError.message.includes('duplicate')) {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Concurrent duplicate detected during save, re-checking...`);
            const concurrentCheck = await detectDuplicates(lead, search._id);
            if (concurrentCheck.isDuplicate) {
              const concurrentDup = await Lead.findById(concurrentCheck.duplicateOf).select('searchId');
              if (concurrentDup && String(concurrentDup.searchId) === String(search._id)) {
                lead.isDuplicate = true;
                lead.duplicateOf = concurrentCheck.duplicateOf;
                await lead.save();
                console.log(`[PROCESS] [${i + 1}/${total}] ✅ Marked as duplicate after concurrent save conflict`);
              }
            }
          } else {
            throw saveError; // Re-throw if it's a different error
          }
        }
        
        if (!lead.isDuplicate) {
          leads.push(lead);
          extractedCount++;
          
          // STREAMING UPDATE: Update search status immediately after each lead is extracted
          // This allows frontend to see progress in real-time
          search.extractedCount = extractedCount;
          await search.save().catch(err => {
            console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Failed to update search status: ${err.message}`);
          });
          
          // Step 3: Enrich lead (with billing gate)
          let reserved = false;
          if (billingEnabled() && searchCompanyId) {
            const r = await reserveCredit(searchCompanyId, search.userId, search._id, lead._id);
            reserved = r.ok;
          } else {
            reserved = true; // billing disabled = free
          }
          if (!reserved) {
            console.log(`[PROCESS] [${i + 1}/${total}] No credits; skipping enrichment.`);
            lead.enrichmentStatus = 'skipped';
            await lead.save();
          } else {
            console.log(`[PROCESS] [${i + 1}/${total}] Enriching lead...`);
            lead.enrichmentStatus = 'enriching';
            await lead.save();
            
            try {
              const enrichStartTime = Date.now();
              console.log(`[PROCESS] [${i + 1}/${total}] 🔄 Starting enrichment for "${lead.companyName}" (website: ${lead.website || 'none'}, decisionMakers: ${lead.decisionMakers?.length || 0})`);
              
              const enrichment = await enrichLead({
                companyName: lead.companyName,
                website: lead.website,
                aboutText: lead.aboutText,
                categorySignals: lead.categorySignals,
                emails: lead.emails,
                phoneNumbers: lead.phoneNumbers,
                socials: lead.socials,
                decisionMakers: lead.decisionMakers || []
              });
              const enrichDuration = Date.now() - enrichStartTime;
              
              console.log(`[PROCESS] [${i + 1}/${total}] ✅ Enrichment completed in ${enrichDuration}ms. Decision makers from enrichment: ${enrichment?.decisionMakers?.length || 0}`);
              
              // CRITICAL FIX: Preserve phone, address, emails, and decision makers BEFORE setting enrichment
              // These are set from Places API and website extraction, and should not be lost
              const preservedPhoneNumbers = lead.phoneNumbers || [];
              const preservedAddress = lead.address;
              const preservedEmails = lead.emails || [];
              const preservedDecisionMakers = lead.decisionMakers || [];
              
              lead.enrichment = enrichment;
              
              // CRITICAL FIX: Restore preserved data after enrichment (enrichment might have overwritten it)
              if (preservedPhoneNumbers.length > 0) {
                lead.phoneNumbers = preservedPhoneNumbers;
              }
              if (preservedAddress) {
                lead.address = preservedAddress;
              }
              if (preservedEmails.length > 0) {
                // Merge preserved emails with any new ones from enrichment (avoid duplicates)
                const existingEmailSet = new Set(preservedEmails.map(e => {
                  const emailStr = typeof e === 'string' ? e : e.email;
                  return emailStr ? emailStr.toLowerCase() : null;
                }).filter(Boolean));
                
                // Add any new emails from enrichment that aren't duplicates
                const enrichmentEmails = enrichment.linkedinContacts?.contacts?.filter(c => c.email) || [];
                for (const contact of enrichmentEmails) {
                  if (contact.email && !existingEmailSet.has(contact.email.toLowerCase())) {
                    preservedEmails.push({
                      email: contact.email,
                      source: 'linkedin',
                      confidence: 0.7
                    });
                    existingEmailSet.add(contact.email.toLowerCase());
                  }
                }
                lead.emails = preservedEmails;
              }
              
              // IMPROVED DECISION MAKER EXTRACTION: Use AI to validate and filter decision makers
              // CRITICAL FIX: Merge enrichment decision makers with existing ones (from extraction)
              // Preserve decision makers found during extraction, add enriched ones
              const enrichedDecisionMakers = enrichment.decisionMakers || [];
              
              if (enrichedDecisionMakers.length > 0 || preservedDecisionMakers.length > 0) {
                // Merge: combine existing (from extraction) with enriched (from LinkedIn/AI)
                const existingNames = new Set(preservedDecisionMakers.map(dm => (dm.name || '').toLowerCase()));
                const merged = [...preservedDecisionMakers];
                
                // CRITICAL: Filter out generic placeholder names before adding
                const genericNames = [
                  'jane doe', 'john smith', 'emily johnson', 'bob johnson', 'sarah williams',
                  'michael brown', 'david jones', 'mary wilson', 'robert taylor', 'jennifer davis',
                  'james johnson', 'lisa anderson', 'william martinez', 'patricia thomas'
                ];
                
                // Add enriched decision makers that aren't duplicates and aren't generic
                for (const dm of enrichedDecisionMakers) {
                  const nameKey = (dm.name || '').toLowerCase().trim();
                  
                  // Skip if generic name
                  if (genericNames.some(generic => nameKey === generic)) {
                    console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Filtered out generic decision maker: ${dm.name}`);
                    continue;
                  }
                  
                  // Skip if name is just a title (e.g., "CEO/Founder")
                  if (nameKey.includes('/') || nameKey === (dm.title || '').toLowerCase()) {
                    console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Filtered out title-as-name decision maker: ${dm.name}`);
                    continue;
                  }
                  
                  if (!existingNames.has(nameKey) && dm.name) {
                    merged.push(dm);
                    existingNames.add(nameKey);
                  }
                }
                
                // Validate merged decision makers with AI to filter out noise
                if (merged.length > 0) {
                  try {
                    const { validateDecisionMakers } = await import('../utils/decisionMakerValidator.js');
                    const validated = await validateDecisionMakers(
                      merged,
                      lead.companyName,
                      lead.website
                    );
                    lead.decisionMakers = validated;
                    console.log(`[PROCESS] [${i + 1}/${total}] ✅ Validated ${validated.length} decision makers (from ${merged.length} merged: ${preservedDecisionMakers.length} extracted + ${enrichedDecisionMakers.length} enriched)`);
                  } catch (validateErr) {
                    console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Decision maker validation failed, using merged: ${validateErr.message}`);
                    lead.decisionMakers = merged; // Fallback to merged (without validation)
                  }
                } else {
                  lead.decisionMakers = [];
                }
              } else {
                // No decision makers at all
                lead.decisionMakers = [];
              }
              
              // CRITICAL: Generate emails for decision makers if we have an email pattern
              // Even if we don't have a website, try to infer domain from company name
              if (lead.decisionMakers && lead.decisionMakers.length > 0 && enrichment.emailPattern) {
                try {
                  const { generateEmailFromName } = await import('../services/enricher.js');
                  
                  // Try to get domain from website, or infer from company name
                  let domain = null;
                  if (lead.website) {
                    try {
                      const urlObj = new URL(lead.website);
                      domain = urlObj.hostname.replace('www.', '');
                    } catch (e) {
                      // Invalid URL, try to infer
                    }
                  }
                  
                  // If no domain, try to infer from company name (basic heuristic)
                  if (!domain && lead.companyName) {
                    // This is a fallback - ideally we'd have a website
                    // For now, skip email generation if no domain
                  }
                  
                  // Generate emails for decision makers without emails
                  if (domain) {
                    for (const dm of lead.decisionMakers) {
                      if (!dm.email && dm.name) {
                        const generatedEmail = generateEmailFromName(dm.name, enrichment.emailPattern, `https://${domain}`);
                        if (generatedEmail) {
                          dm.email = generatedEmail;
                          console.log(`[PROCESS] [${i + 1}/${total}] ✅ Generated email for ${dm.name}: ${generatedEmail}`);
                        }
                      }
                    }
                  }
                } catch (emailGenError) {
                  console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Email generation failed: ${emailGenError.message}`);
                }
              }
              
              // Log final data state for debugging
              console.log(`[PROCESS] [${i + 1}/${total}] 📊 Final data: Phones: ${lead.phoneNumbers?.length || 0}, Emails: ${lead.emails?.length || 0}, Decision Makers: ${lead.decisionMakers?.length || 0} (with emails: ${lead.decisionMakers?.filter(dm => dm.email).length || 0}), Address: ${lead.address ? 'Yes' : 'No'}`);
              
              // STREAMING UPDATE: Update enriched count immediately
              const currentEnriched = await Lead.countDocuments({ 
                searchId: search._id, 
                enrichmentStatus: 'enriched',
                isDuplicate: false 
              });
              search.enrichedCount = currentEnriched;
              await search.save().catch(err => {
                console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Failed to update enriched count: ${err.message}`);
              });
              
              // Calculate verification score
              try {
                const { calculateVerificationScore } = await import('../utils/verificationScoring.js');
                const verification = calculateVerificationScore(lead);
                lead.enrichment.verificationScore = verification.score;
                lead.enrichment.verificationSources = verification.sources;
                console.log(`[PROCESS] [${i + 1}/${total}] Verification score: ${verification.score}/5 (sources: ${verification.sources.join(', ')})`);
              } catch (verifyErr) {
                console.log(`[PROCESS] [${i + 1}/${total}] Verification scoring error: ${verifyErr.message}`);
                // Continue without verification score (backward compatible)
              }
              
              const hasUsable = Array.isArray(enrichment.decisionMakers) && enrichment.decisionMakers.some(d => d.email);
              if (!hasUsable && billingEnabled() && searchCompanyId) {
                // refund if unusable
                await refundCredit(searchCompanyId, search.userId, search._id, lead._id, 'refund_invalid');
              }
              // Recalculate distance after enrichment (more accurate location data)
              try {
                const { calculateLocationDistance } = await import('../utils/distanceCalculator.js');
                if (search.location && enrichment.location?.formatted) {
                  const distance = calculateLocationDistance(search.location, enrichment.location.formatted, search.country);
                  if (distance !== null) {
                    lead.distanceKm = distance;
                    console.log(`[PROCESS] [${i + 1}/${total}] Updated distance: ${distance}km from ${search.location}`);
                  }
                }
              } catch (distErr) {
                console.log(`[PROCESS] [${i + 1}/${total}] Distance recalculation error: ${distErr.message}`);
              }
              
              lead.enrichmentStatus = 'enriched';
              
              // CRITICAL FIX: Final save with all data (phone, address, emails, decision makers)
              // This ensures everything is persisted to the database
              await lead.save();
              
              // Verify what was saved (for debugging)
              const savedLead = await Lead.findById(lead._id).select('phoneNumbers emails decisionMakers address companyName');
              console.log(`[PROCESS] [${i + 1}/${total}] ✅ Enrichment complete (${enrichDuration}ms)`);
              console.log(`[PROCESS] [${i + 1}/${total}] 💾 Saved to DB: Phones: ${savedLead?.phoneNumbers?.length || 0}, Emails: ${savedLead?.emails?.length || 0}, Decision Makers: ${savedLead?.decisionMakers?.length || 0}, Address: ${savedLead?.address ? 'Yes' : 'No'}`);
            } catch (enrichError) {
              console.error(`[PROCESS] [${i + 1}/${total}] ❌ Enrichment error for "${lead.companyName || 'Unknown'}":`, enrichError.message);
              console.error(`[PROCESS] [${i + 1}/${total}] ❌ Enrichment error stack:`, enrichError.stack);
              console.error(`[PROCESS] [${i + 1}/${total}] ❌ Lead data at failure:`, {
                companyName: lead.companyName,
                website: lead.website,
                hasPhone: !!lead.phoneNumbers?.length,
                hasEmail: !!lead.emails?.length,
                hasDecisionMakers: !!lead.decisionMakers?.length,
                extractionStatus: lead.extractionStatus,
                enrichmentStatus: lead.enrichmentStatus
              });
              if (billingEnabled() && searchCompanyId) {
                await refundCredit(searchCompanyId, search.userId, search._id, lead._id, 'refund_error');
              }
              lead.enrichmentStatus = 'failed';
              lead.enrichmentError = enrichError.message.substring(0, 200); // Store error message
              await lead.save();
            }
          }
        } else {
          const duplicateReason = actualDuplicateId ? `duplicate of lead ${actualDuplicateId}` : 'duplicate (same search)';
          console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Duplicate detected (${duplicateReason}), skipping: ${lead.companyName || result.title}`);
        }
        
        // Fix: Release lock in all code paths (after processing is complete)
        if (normalizedWebsite && lockResolver) {
          lockResolver();
          websiteLocks.delete(normalizedWebsite);
        }
        
        const itemDuration = Date.now() - itemStartTime;
      console.log(`[PROCESS] [${i + 1}/${total}] ✅ Complete in ${itemDuration}ms: ${lead.companyName}`);
      console.log(`[PROCESS] [${i + 1}/${total}]   - Emails: ${lead.emails.length}, Phones: ${lead.phoneNumbers.length}, Website: ${lead.website ? 'Yes' : 'No'}`);
        
        // STREAMING UPDATE: Progress is already updated immediately after each lead (see above)
        // This batch update is just for final sync
        if (i % 10 === 0 || i === total - 1) {
          // Re-fetch actual counts from DB for accuracy
          const actualExtracted = await Lead.countDocuments({ 
            searchId: search._id, 
            extractionStatus: { $in: ['extracted', 'enriched'] },
            isDuplicate: false 
          });
          const actualEnriched = await Lead.countDocuments({ 
            searchId: search._id, 
            enrichmentStatus: 'enriched',
            isDuplicate: false 
          });
          search.extractedCount = actualExtracted;
          search.enrichedCount = actualEnriched;
          await search.save();
        }
        
    } catch (error) {
        errorCount++;
      console.error(`[PROCESS] [${i + 1}/${total}] ❌ Error processing ${result.link}:`, error.message);
      console.error(`[PROCESS] [${i + 1}/${total}] Error stack:`, error.stack);
      
      // Fix: Release lock even on error to prevent deadlocks
      if (normalizedWebsite && lockResolver) {
        lockResolver();
        websiteLocks.delete(normalizedWebsite);
      } else if (normalizedWebsite && websiteLocks.has(normalizedWebsite)) {
        // Lock exists but resolver not set (early error) - just remove it
        websiteLocks.delete(normalizedWebsite);
      }
      }
    }

    // Run initial batch with a small worker pool and a time budget
    let scheduled = 0;
    let completed = 0;
    const totalInit = initialBatch.length;
    async function worker(wid) {
      while (scheduled < totalInit && Date.now() < deadline) {
        const idx = scheduled++;
        await processOne(initialBatch[idx], idx, totalInit);
        completed++;
      }
    }
    const workers = [];
    const pool = Math.min(MAX_WORKERS, totalInit);
    for (let w = 0; w < pool; w++) workers.push(worker(w));
    await Promise.all(workers);
    // Update counts after initial batch
    const initialEnrichedCount = leads.filter(l => l.enrichmentStatus === 'enriched').length;
    search.extractedCount = extractedCount;
    search.enrichedCount = initialEnrichedCount;
    await search.save();
    
    // Check if we need background fill
    const totalLeadsFound = expandedResults.length;
    const needsBackgroundFill = totalLeadsFound >= 20;
    
    if (!needsBackgroundFill) {
      // If total leads < 20, mark as completed immediately (no background fill needed)
      search.status = 'completed';
      search.completedAt = new Date();
      await search.save();
      console.log(`[PROCESS] ✅ Search complete (${totalLeadsFound} leads, no background fill needed)`);
    } else {
      // Wait for 20-30 enriched threshold before allowing next search
      const THRESHOLD_MIN = 20;
      const THRESHOLD_MAX = 30;
      const THRESHOLD_TIMEOUT = 60000; // 60 seconds
      
      let enrichedCount = initialEnrichedCount;
      const thresholdStartTime = Date.now();
      
      // Wait for threshold (with timeout)
      while (enrichedCount < THRESHOLD_MIN && (Date.now() - thresholdStartTime) < THRESHOLD_TIMEOUT) {
        // Re-fetch to get updated count
        const updatedSearch = await Search.findById(search._id);
        if (updatedSearch) {
          enrichedCount = updatedSearch.enrichedCount || 0;
        }
        
        if (enrichedCount < THRESHOLD_MIN) {
          // Wait a bit before checking again (increased from 2s to 5s to reduce log spam)
          await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
          console.log(`[PROCESS] ⏳ Waiting for threshold: ${enrichedCount}/${THRESHOLD_MIN} enriched...`);
        }
      }
      
      const finalEnrichedCount = enrichedCount;
      if (finalEnrichedCount >= THRESHOLD_MIN) {
        console.log(`[PROCESS] ✅ Threshold reached: ${finalEnrichedCount} enriched`);
      } else {
        console.log(`[PROCESS] ⏱️  Threshold timeout: ${finalEnrichedCount} enriched (proceeding anyway)`);
      }
      
      // Mark as processing_backfill (threshold met or timeout)
      search.status = 'processing_backfill';
      search.enrichedCount = finalEnrichedCount;
      search.completedAt = new Date(); // Mark when initial batch completed
      await search.save();
      
      // Prepare background fill list, respecting resultCount limit
      const leftoverFromInitial = initialBatch.slice(completed);
      const maxTotal = search.resultCount;
      const alreadyProcessed = extractedCount;
      const remainingAllowed = Math.max(0, maxTotal - alreadyProcessed);
      
      // Cap background batch to respect resultCount
      const cappedBackgroundBatch = backgroundBatch.slice(0, Math.max(0, remainingAllowed - leftoverFromInitial.length));
      const bgList = [...leftoverFromInitial, ...cappedBackgroundBatch];
      
      if (bgList.length > 0) {
        console.log(`[PROCESS] 🔄 Background fill: ${bgList.length} results (capped from ${backgroundBatch.length + leftoverFromInitial.length} to respect limit of ${maxTotal})...`);
        
        // Create pause/resume mechanism
        const pauseResume = {
          isPaused: false,
          resume: null
        };
        
        // Register with queue
        searchQueue.backgroundFills.set(search._id.toString(), pauseResume);
        
        setImmediate(async () => {
          let bgErrorCount = 0;
          for (let j = 0; j < bgList.length; j++) {
            try {
              // Check if we've hit the resultCount limit
              const currentCount = await Lead.countDocuments({ 
                searchId: search._id, 
                isDuplicate: false,
                extractionStatus: 'extracted'
              });
              if (currentCount >= maxTotal) {
                console.log(`[PROCESS] 🔄 Background fill stopped: reached limit of ${maxTotal} leads`);
                break;
              }
              
              // Check if paused (with timeout to prevent infinite wait)
              const bgFill = searchQueue.backgroundFills.get(search._id.toString());
              if (bgFill && bgFill.isPaused) {
                console.log(`[PROCESS] ⏸️  Background fill paused for search ${search._id}`);
                // Wait for resume with timeout (max 5 minutes)
                const resumeTimeout = setTimeout(() => {
                  console.log(`[PROCESS] ⚠️  Background fill resume timeout, continuing anyway`);
                  if (bgFill) {
                    bgFill.isPaused = false;
                    if (bgFill.resume) bgFill.resume();
                  }
                }, 300000); // 5 minutes
                
                await new Promise((resolve) => {
                  if (bgFill) {
                    bgFill.resume = () => {
                      clearTimeout(resumeTimeout);
                      resolve();
                    };
                  } else {
                    clearTimeout(resumeTimeout);
                    resolve();
                  }
                });
                console.log(`[PROCESS] ▶️  Background fill resumed for search ${search._id}`);
              }
              
              // Fix: Wrap processOne in try-catch to prevent silent failures
              await processOne(bgList[j], initialBatch.length + j, expandedResults.length);
              
              // CRITICAL FIX: Update progress after EVERY item for real-time updates
              const s = await Search.findById(search._id);
              if (s) {
                const currentExtracted = await Lead.countDocuments({ 
                  searchId: search._id, 
                  isDuplicate: false,
                  extractionStatus: { $in: ['extracted', 'enriched'] }
                });
                const currentEnriched = await Lead.countDocuments({ 
                  searchId: search._id, 
                  isDuplicate: false,
                  enrichmentStatus: 'enriched'
                });
                s.extractedCount = currentExtracted;
                s.enrichedCount = currentEnriched;
                s.status = 'processing_backfill'; // Ensure status is set
                // CRITICAL FIX: Save after every lead to ensure real-time updates
                await s.save().catch(err => {
                  console.log(`[PROCESS] ⚠️  Failed to update backfill progress: ${err.message}`);
                });
                
                // Log every 5 items to avoid spam, but save every item
                if ((j + 1) % 5 === 0 || j === bgList.length - 1) {
                  console.log(`[PROCESS] 🔄 Background fill progress: ${currentExtracted} extracted, ${currentEnriched} enriched (${j + 1}/${bgList.length} processed)`);
                }
              }
            } catch (error) {
              bgErrorCount++;
              console.error(`[PROCESS] [BG ${j + 1}/${bgList.length}] ❌ Error processing ${bgList[j]?.link || 'unknown'}:`, error.message);
              console.error(`[PROCESS] [BG ${j + 1}/${bgList.length}] Error stack:`, error.stack);
              // Continue processing next item instead of stopping
            }
          }
          
          // Clean up
          searchQueue.backgroundFills.delete(search._id.toString());
          
          // Re-fetch actual counts from database
          const s = await Search.findById(search._id);
          if (s) {
            const actualExtracted = await Lead.countDocuments({ 
              searchId: search._id, 
              isDuplicate: false,
              extractionStatus: 'extracted'
            });
            const actualEnriched = await Lead.countDocuments({ 
              searchId: search._id, 
              isDuplicate: false,
              enrichmentStatus: 'enriched'
            });
            s.extractedCount = actualExtracted;
            s.enrichedCount = actualEnriched;
            s.status = 'completed';
            s.completedAt = new Date();
            await s.save();
            console.log(`[PROCESS] 🔄 Background fill complete. Final counts: ${actualExtracted} extracted, ${actualEnriched} enriched${bgErrorCount > 0 ? ` (${bgErrorCount} errors)` : ''}`);
          }
        });
      } else {
        // No background fill needed (already at limit or no remaining items)
        search.status = 'completed';
        search.completedAt = new Date();
        await search.save();
        console.log(`[PROCESS] ✅ Search complete (no background fill needed, already at limit)`);
      }
    }
    
    const totalDuration = Date.now() - startTime;
    
    // Get enrichment statistics
    const enrichmentStats = await Lead.aggregate([
      { $match: { searchId: search._id, isDuplicate: false } },
      { $group: {
          _id: '$enrichmentStatus',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const enrichedCount = enrichmentStats.find(s => s._id === 'enriched')?.count || 0;
    const failedCount = enrichmentStats.find(s => s._id === 'failed')?.count || 0;
    const skippedCount = enrichmentStats.find(s => s._id === 'skipped')?.count || 0;
    const enrichingCount = enrichmentStats.find(s => s._id === 'enriching')?.count || 0;
    
    console.log(`[PROCESS] ========================================`);
    console.log(`[PROCESS] ✅ Search processing complete!`);
    console.log(`[PROCESS] Total time: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log(`[PROCESS] Results: ${uniqueResults.length} found (${googleResults.length} before dedup), ${extractedCount} extracted, ${enrichedCount} enriched`);
    console.log(`[PROCESS] Enrichment stats: ${enrichedCount} enriched, ${failedCount} failed, ${skippedCount} skipped, ${enrichingCount} still enriching`);
    console.log(`[PROCESS] Duplicates removed: ${googleResults.length - uniqueResults.length}`);
    console.log(`[PROCESS] Errors: ${errorCount}`);
    console.log(`[PROCESS] ========================================`);
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[PROCESS] ========================================`);
    console.error(`[PROCESS] ❌ Search processing error after ${totalDuration}ms:`);
    console.error(`[PROCESS] Error:`, error.message);
    console.error(`[PROCESS] Stack:`, error.stack);
    console.error(`[PROCESS] ========================================`);
    
    const search = await Search.findById(searchId);
    if (search) {
      // Save partial results even on failure - better than showing nothing
      search.status = 'failed';
      search.error = error.message;
      // Update counts with whatever was extracted before the error
      if (typeof extractedCount !== 'undefined') {
        search.extractedCount = extractedCount;
      }
      if (typeof leads !== 'undefined' && Array.isArray(leads)) {
        search.enrichedCount = leads.filter(l => l.enrichmentStatus === 'enriched').length;
      }
      search.completedAt = new Date();
      await search.save();
      console.log(`[PROCESS] 💾 Saved partial results: ${search.extractedCount || 0} extracted, ${search.enrichedCount || 0} enriched`);
    }
  }
}

export default router;
