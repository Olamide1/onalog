import { createRouter, createWebHistory } from 'vue-router';
import Landing from '../views/Landing.vue';
import SignIn from '../views/SignIn.vue';
import Login from '../views/Login.vue';
import Dashboard from '../views/Dashboard.vue';
import Settings from '../views/Settings.vue';
import Admin from '../views/Admin.vue';
import AdminLogin from '../views/AdminLogin.vue';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/',
    name: 'Landing',
    component: Landing
  },
  {
    path: '/signin',
    name: 'SignIn',
    component: SignIn
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: AdminLogin
  },
  {
    path: '/admin',
    name: 'Admin',
    component: Admin,
    meta: { requiresAdmin: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// Allowed admin usernames (case-insensitive)
const ALLOWED_ADMIN_USERS = ['chuks', 'olamide', 'ola'];

// Navigation guard for protected routes
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  
  // Await authentication initialization to ensure token verification completes
  await authStore.initAuth();
  
  // Check authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login');
    return;
  }
  
  // Check admin access - username-only authentication
  if (to.meta.requiresAdmin) {
    // Check if admin username is stored in session
    const adminUsername = sessionStorage.getItem('admin_username');
    const isAuthorized = adminUsername && ALLOWED_ADMIN_USERS.includes(adminUsername.toLowerCase().trim());
    
    if (!isAuthorized) {
      // Redirect to admin login
      next('/admin/login');
      return;
    }
  }
  
  next();
});

export default router;

