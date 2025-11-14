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
  }
  
  function setToken(tokenData) {
    token.value = tokenData;
    // Set token in API client
    if (tokenData) {
      api.defaults.headers.common['Authorization'] = `Bearer ${tokenData}`;
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
        
        // Verify token is still valid
        try {
          const response = await api.get('/auth/me');
          if (response.data.user) {
            isAuthenticated.value = true;
            user.value = response.data.user;
          } else {
            clearUser();
          }
        } catch (error) {
          // Token invalid, clear auth
          clearUser();
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

