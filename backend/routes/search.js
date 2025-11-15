import express from 'express';
import Search from '../models/Search.js';
import Lead from '../models/Lead.js';
import Company from '../models/Company.js';
import { fetchGoogleResults } from '../services/googleSearch.js';
import { isDirectorySite } from '../services/searchProviders.js';
import { extractContactInfo, formatPhone, detectCountry, expandDirectoryCompanies, discoverExecutives } from '../services/extractor.js';
import { enrichLead } from '../services/enricher.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
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
      
      // Process next item in queue
      const remaining = Array.from(this.userQueues.values()).reduce((sum, q) => sum + q.length, 0);
      if (remaining > 0) {
        // Longer delay to let rate limits recover (especially DuckDuckGo)
        // DuckDuckGo rate limits can last 1-5 minutes, so we wait 30 seconds minimum
        // This gives rate limits time to expire between searches
        const delay = 30000; // 30 seconds
        console.log(`[QUEUE] Waiting ${delay/1000}s before processing next search to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        this.process();
      } else {
        console.log(`[QUEUE] Queue empty. Waiting for new searches...`);
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
    
    const leadsQuery = Lead.find({ searchId: search._id, isDuplicate: false })
      .sort({ 'enrichment.signalStrength': -1 });
    if (previewLimit) leadsQuery.limit(previewLimit);
    const leads = await leadsQuery;
    
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
    // IMPORTANT: For Google search links (OSM results without websites), dedupe by business name + location
    // For real websites, dedupe by hostname
    console.log(`[PROCESS] Deduplicating ${googleResults.length} search results...`);
    const seenUrls = new Set();
    const seenBusinessNames = new Set(); // For Google search links
    const uniqueResults = [];
    
    for (const result of googleResults) {
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
    for (const r of uniqueResults) {
      const shouldExpand = (() => {
        try { return isDirectorySite(r.link); } catch { return false; }
      })();
      if (shouldExpand) {
        try {
          console.log(`[PROCESS] Expanding directory/list page: ${r.link}`);
          const derived = await expandDirectoryCompanies(r.link, Math.max(10, Math.min(40, search.resultCount)));
          if (derived && derived.length > 0) {
            expandedResults.push(...derived);
            continue;
          }
        } catch (e) {
          console.log(`[PROCESS] Directory expansion failed: ${e.message}`);
        }
        // Skip the directory entry if no derived items
        continue;
      }
      expandedResults.push(r);
    }
    
    // Step 2: Extract contact info (early-return at 20, background fill)
    const initialTarget = Math.min(30, expandedResults.length);
    const MAX_WORKERS = 4; // cap parallelism
    const TIME_BUDGET_MS = 25000; // ~25s budget for initial reveal
    const deadline = Date.now() + TIME_BUDGET_MS;
    const initialBatch = expandedResults.slice(0, initialTarget);
    const backgroundBatch = expandedResults.slice(initialTarget);
    console.log(`[PROCESS] Step 2/3: Extracting up to ${initialBatch.length} initially (budget ${TIME_BUDGET_MS}ms, of ${expandedResults.length})...`);
    const leads = [];
    let extractedCount = 0;
    let errorCount = 0;

    async function processOne(result, i, total) {
      const itemStartTime = Date.now();
      
      console.log(`[PROCESS] [${i + 1}/${total}] Processing: ${result.title}`);
      console.log(`[PROCESS] [${i + 1}/${total}] URL: ${result.link}`);
      
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
        
        // Extract contact info (pass search country for phone formatting)
        const extractStartTime = Date.now();
        const extracted = await extractContactInfo(result.link, search.country);
        const extractDuration = Date.now() - extractStartTime;
        
        console.log(`[PROCESS] [${i + 1}/${total}] Extraction took ${extractDuration}ms`);
        
        // Merge extracted data
        lead.companyName = extracted.companyName || lead.companyName;
        // Use extracted website if it's better (canonical URL, etc.)
        if (extracted.website && extracted.website !== result.link) {
          lead.website = extracted.website;
          console.log(`[PROCESS] [${i + 1}/${total}] Using extracted website: ${extracted.website}`);
        } else {
          lead.website = result.link;
        }
        
        // Guard: first‑party vs directory classifier
        try {
          if (lead.website) {
            const { quickClassifyUrl } = await import('../services/extractor.js');
            const cls = await quickClassifyUrl(lead.website);
            // Only skip when strongly directory (negative score). Borderline (0) proceeds.
            if (cls && typeof cls.score === 'number' && cls.score < 0) {
              console.log(`[PROCESS] [${i + 1}/${total}] Classified as directory/list (score=${cls.score}): ${lead.website}. Skipping.`);
              return;
            }
          }
        } catch (clsErr) {
          console.log(`[PROCESS] [${i + 1}/${total}] Classifier error (continuing): ${clsErr.message}`);
        }
        
        // If result has phone/address from Places API, use it
        if (result.phone && (!extracted.phoneNumbers || extracted.phoneNumbers.length === 0)) {
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
        
        if (result.address && !extracted.address) {
          lead.address = result.address;
          console.log(`[PROCESS] [${i + 1}/${total}] Using address from Places API: ${result.address}`);
        }
        
        // Filter emails - only keep valid business emails
        lead.emails = (extracted.emails || []).filter(email => {
          const emailStr = email.email || email;
          // Filter out generic/non-business emails
          return !emailStr.includes('noreply') && 
                 !emailStr.includes('no-reply') &&
                 !emailStr.includes('donotreply') &&
                 !emailStr.includes('example.com');
        });
        
        // Filter phone numbers - only keep valid ones
        lead.phoneNumbers = (extracted.phoneNumbers || []).filter(phone => {
          const phoneStr = phone.phone || phone;
          // Additional validation
          if (!phoneStr || phoneStr.length < 10) return false;
          // Reject obviously wrong numbers
          if (phoneStr.match(/^[01]{8,}$/)) return false; // All 0s or 1s
          if (phoneStr.match(/^\d{1,3}$/)) return false; // Too short
          return true;
        });
        lead.whatsappLinks = extracted.whatsappLinks;
        lead.socials = extracted.socials;
        lead.address = extracted.address;
        lead.aboutText = extracted.aboutText;
        lead.categorySignals = extracted.categorySignals;
        
        // Process decision makers and generate emails
        if (extracted.decisionMakers && extracted.decisionMakers.length > 0) {
          console.log(`[PROCESS] [${i + 1}/${total}] Found ${extracted.decisionMakers.length} decision makers from website`);
          
          // Generate emails for decision makers if we have email pattern
          lead.decisionMakers = extracted.decisionMakers.map(dm => {
            // Will be enriched with email pattern later
            return {
              name: dm.name,
              title: dm.title,
              email: null, // Will be generated during enrichment
              source: dm.source,
              confidence: dm.confidence
            };
          });
        }
        
        // Executive discovery (business execs) if we still have few/no names
        try {
          const siteForDiscovery = lead.website || extracted.website || result.link;
          if ((!lead.decisionMakers || lead.decisionMakers.length < 3) && siteForDiscovery) {
            console.log(`[PROCESS] [${i + 1}/${total}] Discovering executives on ${siteForDiscovery}...`);
            const execs = await discoverExecutives(siteForDiscovery);
            if (execs && execs.length > 0) {
              const existing = new Set((lead.decisionMakers || []).map(dm => (dm.name || '').toLowerCase()));
              const merged = [...(lead.decisionMakers || [])];
              for (const e of execs) {
                const key = (e.name || '').toLowerCase();
                if (!existing.has(key)) {
                  merged.push({ name: e.name, title: e.title, email: null, source: e.source, confidence: e.confidence || 0.6 });
                  existing.add(key);
                }
                if (merged.length >= 12) break;
              }
              lead.decisionMakers = merged;
            }
          }
        } catch (discErr) {
            console.log(`[PROCESS] [${i + 1}/${total}] Exec discovery skipped: ${discErr.message}`);
        }
        
        lead.extractionStatus = 'extracted';
        
        // Check for duplicates
        const duplicateCheck = await detectDuplicates(lead, search._id);
        // Only treat as duplicate if it's a duplicate within THIS search.
        // Cross-search duplicates are allowed so users can run fresh queries and still see results.
        const dupOf = duplicateCheck.duplicateOf;
        const isSameSearchDup = duplicateCheck.isDuplicate &&
          dupOf && String(dupOf) === String(search._id);
        lead.isDuplicate = isSameSearchDup;
        lead.duplicateOf = dupOf || null;
        
        await lead.save();
        
        if (!lead.isDuplicate) {
          leads.push(lead);
          extractedCount++;
          
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
              
              lead.enrichment = enrichment;
              if (enrichment.decisionMakers && enrichment.decisionMakers.length > 0) {
                lead.decisionMakers = enrichment.decisionMakers;
              }
              const hasUsable = Array.isArray(enrichment.decisionMakers) && enrichment.decisionMakers.some(d => d.email);
              if (!hasUsable && billingEnabled() && searchCompanyId) {
                // refund if unusable
                await refundCredit(searchCompanyId, search.userId, search._id, lead._id, 'refund_invalid');
              }
              lead.enrichmentStatus = 'enriched';
              await lead.save();
              console.log(`[PROCESS] [${i + 1}/${total}] ✅ Enrichment complete (${enrichDuration}ms)`);
            } catch (enrichError) {
              console.error(`[PROCESS] [${i + 1}/${total}] ❌ Enrichment error:`, enrichError.message);
              if (billingEnabled() && searchCompanyId) {
                await refundCredit(searchCompanyId, search.userId, search._id, lead._id, 'refund_error');
              }
              lead.enrichmentStatus = 'failed';
              await lead.save();
            }
          }
        } else {
        console.log(`[PROCESS] [${i + 1}/${total}] ⚠️  Duplicate detected, skipping`);
        }
        
        const itemDuration = Date.now() - itemStartTime;
      console.log(`[PROCESS] [${i + 1}/${total}] ✅ Complete in ${itemDuration}ms: ${lead.companyName}`);
      console.log(`[PROCESS] [${i + 1}/${total}]   - Emails: ${lead.emails.length}, Phones: ${lead.phoneNumbers.length}, Website: ${lead.website ? 'Yes' : 'No'}`);
        
        // Update search progress
        search.extractedCount = extractedCount;
        search.enrichedCount = leads.filter(l => l.enrichmentStatus === 'enriched').length;
      if (i % 5 === 0 || i === total - 1) {
          await search.save();
        }
        
    } catch (error) {
        errorCount++;
      console.error(`[PROCESS] [${i + 1}/${total}] ❌ Error processing ${result.link}:`, error.message);
      console.error(`[PROCESS] [${i + 1}/${total}] Error stack:`, error.stack);
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
    // Anything not processed in the initial batch due to time is moved to background
    const leftoverFromInitial = initialBatch.slice(completed);
    const bgList = [...leftoverFromInitial, ...backgroundBatch];
    
    // Mark as completed for UX; background fill continues
    search.status = 'completed';
    search.extractedCount = extractedCount;
    search.enrichedCount = leads.filter(l => l.enrichmentStatus === 'enriched').length;
    search.completedAt = new Date();
    await search.save();

    if (bgList.length > 0) {
      console.log(`[PROCESS] 🔄 Background fill: remaining ${bgList.length} results...`);
      setImmediate(async () => {
        for (let j = 0; j < bgList.length; j++) {
          await processOne(bgList[j], initialBatch.length + j, expandedResults.length);
        }
        const s = await Search.findById(search._id);
        if (s) {
          s.extractedCount = extractedCount;
          s.enrichedCount = leads.filter(l => l.enrichmentStatus === 'enriched').length;
          s.completedAt = new Date();
          await s.save();
        }
        console.log(`[PROCESS] 🔄 Background fill complete.`);
      });
    }
    
    const totalDuration = Date.now() - startTime;
    console.log(`[PROCESS] ========================================`);
    console.log(`[PROCESS] ✅ Search processing complete!`);
    console.log(`[PROCESS] Total time: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log(`[PROCESS] Results: ${uniqueResults.length} found (${googleResults.length} before dedup), ${extractedCount} extracted, ${search.enrichedCount} enriched`);
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


