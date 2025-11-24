import axios from 'axios';

// Determine the API base URL based on environment
const getBaseURL = () => {
  const env = import.meta.env.VITE_ENV;
  
  if (env === 'production' && import.meta.env.VITE_PROD_API_URL) {
    return import.meta.env.VITE_PROD_API_URL;
  }
  
  return import.meta.env.VITE_API_URL || '/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add auth token if available
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('onalog_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  response => response,
  error => {
    // Don't redirect on login/signup pages - let them handle the error
    const isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/signin';
    
    // Handle 401 (unauthorized) - redirect to login (but not on auth pages)
    if (error.response?.status === 401 && !isAuthPage) {
      localStorage.removeItem('onalog_token');
      localStorage.removeItem('onalog_user');
      window.location.href = '/login';
    }
    
    // Return the original error object so components can access error.response
    return Promise.reject(error);
  }
);

export default api;

