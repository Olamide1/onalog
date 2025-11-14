import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

export const useLeadsStore = defineStore('leads', () => {
  const leads = ref([]);
  const currentSearch = ref(null);
  const selectedLeads = ref([]);
  const loading = ref(false);
  const error = ref(null);
  
  const filteredLeads = computed(() => {
    return leads.value.filter(lead => !lead.isDuplicate);
  });
  
  const enrichedCount = computed(() => {
    return leads.value.filter(l => l.enrichmentStatus === 'enriched').length;
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
      
      currentSearch.value = response.data;
      return response.data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }
  
  async function fetchSearch(searchId) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await api.get(`/search/${searchId}`);
      currentSearch.value = response.data.search;
      leads.value = response.data.leads;
      return response.data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
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
    clearSelection
  };
});

