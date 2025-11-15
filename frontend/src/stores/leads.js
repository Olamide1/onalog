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
  
  async function createSearch(query, country, location, resultCount) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await api.post('/search', {
        query,
        country,
        location,
        resultCount: parseInt(resultCount)
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
  
  async function fetchSearch(searchId, updateBackground = false) {
    // Only set loading for current search updates, not background
    if (!updateBackground) {
      loading.value = true;
    }
    error.value = null;
    
    try {
      const response = await api.get(`/search/${searchId}`);
      const search = response.data.search;
      const searchLeads = response.data.leads;
      
      // If this is the current search, update it and leads
      if (currentSearch.value && (currentSearch.value._id === searchId || currentSearch.value.searchId === searchId)) {
        currentSearch.value = search;
        leads.value = searchLeads;
      } 
      // If this is a background search, update it
      else if (updateBackground) {
        const bgIndex = backgroundSearches.value.findIndex(s => s._id === searchId || s.searchId === searchId);
        if (bgIndex >= 0) {
          backgroundSearches.value[bgIndex] = search;
        } else {
          // If not found in background, might be a new background search
          // Only add if it's processing
          if (search.status === 'processing' || search.status === 'queued' || search.status === 'searching' || search.status === 'extracting' || search.status === 'enriching') {
            backgroundSearches.value.push(search);
          }
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
    
    // Set as current
    currentSearch.value = search;
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

