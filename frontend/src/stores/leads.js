import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

export const useLeadsStore = defineStore('leads', () => {
  const leads = ref([]);
  const currentSearch = ref(null);
  const backgroundSearches = ref([]); // Track searches processing in background
  const selectedLeads = ref([]);
  const loading = ref(false);
  const error = ref(null);
  
  const filteredLeads = computed(() => {
    return leads.value.filter(lead => !lead.isDuplicate);
  });
  
  const enrichedCount = computed(() => {
    return leads.value.filter(l => l.enrichmentStatus === 'enriched').length;
  });
  
  const activeBackgroundSearches = computed(() => {
    return backgroundSearches.value.filter(s => 
      s.status === 'processing' || s.status === 'queued' || s.status === 'searching' || s.status === 'extracting' || s.status === 'enriching'
    );
  });
  
  // Track last search creation to prevent rapid duplicate submissions
  let lastSearchCreation = null;
  const SEARCH_DEBOUNCE_MS = 2000; // 2 second debounce
  
  async function createSearch(query, country, location, industry, resultCount, maxDistance = null) {
    // Debounce: Prevent rapid duplicate search creation
    const now = Date.now();
    const searchKey = `${query}|${country}|${location}|${industry}|${resultCount}`;
    
    if (lastSearchCreation && (now - lastSearchCreation.timestamp) < SEARCH_DEBOUNCE_MS) {
      if (lastSearchCreation.key === searchKey) {
        // Same search submitted too quickly - return existing promise or reject
        console.log('[STORE] Search creation debounced - preventing duplicate');
        throw new Error('Please wait before creating the same search again');
      }
    }
    
    // Update last search creation tracking
    lastSearchCreation = { key: searchKey, timestamp: now };
    
    loading.value = true;
    error.value = null;
    
    try {
      const response = await api.post('/search', {
        query,
        country,
        location,
        industry,
        resultCount: parseInt(resultCount),
        maxDistance: maxDistance ? parseInt(maxDistance) : null
      });
      
      // If there's already a current search, move it to background
      if (currentSearch.value && currentSearch.value._id) {
        const oldSearch = {
          ...currentSearch.value,
          _id: currentSearch.value._id || currentSearch.value.searchId
        };
        // Only add to background if it's still processing
        if (oldSearch.status === 'processing' || oldSearch.status === 'queued' || oldSearch.status === 'searching' || oldSearch.status === 'extracting' || oldSearch.status === 'enriching') {
          backgroundSearches.value.push(oldSearch);
        }
      }
      
      currentSearch.value = response.data;
      return response.data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }
  
  async function fetchSearch(searchId, updateBackground = false, isPolling = false) {
    // Only set loading for initial fetches, not background updates or polling
    // Polling updates should be silent to prevent UI flicker
    if (!updateBackground && !isPolling) {
      loading.value = true;
    }
    error.value = null;
    
    try {
      const response = await api.get(`/search/${searchId}`);
      const search = response.data.search;
      const searchLeads = response.data.leads;
      
      // Normalize searchId for comparison (handle both string and ObjectId)
      const normalizedSearchId = String(searchId);
      const currentSearchId = currentSearch.value ? String(currentSearch.value._id || currentSearch.value.searchId || '') : '';
      
      // Fix: If this is the current search, update it and leads (improved ID matching)
      if (currentSearch.value && (currentSearchId === normalizedSearchId || String(currentSearch.value.searchId) === normalizedSearchId)) {
        currentSearch.value = { ...search };
        // CRITICAL FIX: Always update leads during backfill or when counts change
        // During backfill, new leads are being added, so we must always update
        const newLeads = [...(searchLeads || [])];
        const oldLeadIds = new Set(leads.value.map(l => String(l._id || l.id || '')));
        const newLeadIds = new Set(newLeads.map(l => String(l._id || l.id || '')));
        
        // Check if we have new leads (not just reordered)
        const hasNewLeads = Array.from(newLeadIds).some(id => !oldLeadIds.has(id));
        const leadCountChanged = newLeads.length !== leads.value.length;
        const isBackfillOrCompleted = search.status === 'processing_backfill' || search.status === 'completed';
        
        // Always update if:
        // 1. We have new leads (new IDs)
        // 2. Lead count changed
        // 3. Status is backfill or completed (leads are being added)
        // 4. We have no existing leads (initial load - prevents empty state flash)
        if (hasNewLeads || leadCountChanged || isBackfillOrCompleted || leads.value.length === 0) {
          leads.value = newLeads;
          console.log('[STORE] Updated leads list:', newLeads.length, 'leads (hasNewLeads:', hasNewLeads, ', countChanged:', leadCountChanged, ', isBackfill:', isBackfillOrCompleted, ')');
        }
      } 
      // If this is a background search, update it
      else if (updateBackground) {
        const bgIndex = backgroundSearches.value.findIndex(s => {
          const sId = String(s._id || s.searchId || '');
          return sId === normalizedSearchId;
        });
        if (bgIndex >= 0) {
          backgroundSearches.value[bgIndex] = { ...search };
        } else {
          // If not found in background, might be a new background search
          // Only add if it's processing
          if (search.status === 'processing' || search.status === 'queued' || search.status === 'searching' || search.status === 'extracting' || search.status === 'enriching') {
            backgroundSearches.value.push({ ...search });
          }
        }
      }
      // Fix: If no current search but this matches the searchId, set it as current
      else if (!currentSearch.value && search._id) {
        const searchIdStr = String(search._id);
        if (searchIdStr === normalizedSearchId) {
          currentSearch.value = { ...search };
          leads.value = [...(searchLeads || [])];
        }
      }
      
      return response.data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      if (!updateBackground) {
        loading.value = false;
      }
    }
  }
  
  function switchToSearch(search) {
    // Move current search to background if it's still processing
    if (currentSearch.value && currentSearch.value._id) {
      const oldSearch = {
        ...currentSearch.value,
        _id: currentSearch.value._id || currentSearch.value.searchId
      };
      if (oldSearch.status === 'processing' || oldSearch.status === 'queued' || oldSearch.status === 'searching' || oldSearch.status === 'extracting' || oldSearch.status === 'enriching') {
        // Remove from background if already there, then add
        backgroundSearches.value = backgroundSearches.value.filter(s => 
          s._id !== oldSearch._id && s.searchId !== oldSearch.searchId
        );
        backgroundSearches.value.push(oldSearch);
      }
    }
    
    // Remove from background if it's there
    backgroundSearches.value = backgroundSearches.value.filter(s => 
      s._id !== search._id && s.searchId !== search.searchId
    );
    
    // CRITICAL: Set as current WITHOUT clearing leads immediately
    // Leads will be updated when fetchSearch is called, preventing empty state flash
    currentSearch.value = search;
    // Don't clear leads here - let fetchSearch update them when new data arrives
  }
  
  function removeBackgroundSearch(searchId) {
    backgroundSearches.value = backgroundSearches.value.filter(s => 
      s._id !== searchId && s.searchId !== searchId
    );
  }
  
  async function fetchLeads(filters = {}) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await api.get('/leads', { params: filters });
      leads.value = response.data.leads;
      return response.data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }
  
  async function fetchLeadDetail(leadId) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await api.get(`/leads/${leadId}`);
      return response.data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }
  
  function toggleLeadSelection(leadId) {
    const index = selectedLeads.value.indexOf(leadId);
    if (index > -1) {
      selectedLeads.value.splice(index, 1);
    } else {
      selectedLeads.value.push(leadId);
    }
  }
  
  function clearSelection() {
    selectedLeads.value = [];
  }
  
  return {
    leads,
    currentSearch,
    backgroundSearches,
    activeBackgroundSearches,
    selectedLeads,
    loading,
    error,
    filteredLeads,
    enrichedCount,
    createSearch,
    fetchSearch,
    fetchLeads,
    fetchLeadDetail,
    toggleLeadSelection,
    clearSelection,
    switchToSearch,
    removeBackgroundSearch
  };
});

