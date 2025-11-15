import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../services/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(null);
  const isAuthenticated = ref(false);
  
  function setUser(userData) {
    user.value = userData;
    isAuthenticated.value = true;
    try {
      localStorage.setItem('onalog_user', JSON.stringify(userData));
    } catch {}
  }
  
  function setToken(tokenData) {
    token.value = tokenData;
    // Set token in API client
    if (tokenData) {
      api.defaults.headers.common['Authorization'] = `Bearer ${tokenData}`;
      try {
        localStorage.setItem('onalog_token', tokenData);
      } catch {}
    }
  }
  
  function clearUser() {
    user.value = null;
    token.value = null;
    isAuthenticated.value = false;
    localStorage.removeItem('onalog_user');
    localStorage.removeItem('onalog_token');
    delete api.defaults.headers.common['Authorization'];
  }
  
  async function initAuth() {
    const storedToken = localStorage.getItem('onalog_token');
    const storedUser = localStorage.getItem('onalog_user');
    
    if (storedToken && storedUser) {
      try {
        token.value = storedToken;
        user.value = JSON.parse(storedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        isAuthenticated.value = true; // assume valid until proven otherwise
        
        // Verify token is still valid
        try {
          const response = await api.get('/auth/me');
          if (response.data.user) {
            isAuthenticated.value = true;
            user.value = response.data.user;
            localStorage.setItem('onalog_user', JSON.stringify(response.data.user));
          } else {
            // unexpected shape; keep session but log
            console.warn('Auth init: /auth/me returned no user');
          }
        } catch (error) {
          // Only clear session on explicit 401/403; keep session on transient errors
          if (error?.response?.status === 401 || error?.response?.status === 403) {
            clearUser();
          } else {
            console.warn('Auth init: transient error, keeping local session');
          }
        }
      } catch (error) {
        console.error('Auth init error:', error);
        clearUser();
      }
    }
  }
  
  return {
    user,
    token,
    isAuthenticated,
    setUser,
    setToken,
    clearUser,
    initAuth
  };
});

