import { authenticate } from './auth.js';

// Allowed admin usernames (case-insensitive) - matches frontend
const ALLOWED_ADMIN_USERS = ['chuks', 'olamide', 'ola'];

/**
 * Admin-only middleware - username-based
 * Requires user to be authenticated AND username must match allowed admin users
 */
export const requireAdmin = [
  authenticate,
  async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Check if user's name matches allowed admin usernames
      const userName = req.user.name?.toLowerCase().trim();
      const isAuthorized = userName && ALLOWED_ADMIN_USERS.includes(userName);
      
      if (!isAuthorized) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: 'Authorization error' });
    }
  }
];

