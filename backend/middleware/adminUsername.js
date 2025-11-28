// Allowed admin usernames (case-insensitive) - matches frontend
const ALLOWED_ADMIN_USERS = ['chuks', 'olamide', 'ola'];

/**
 * Admin username-based authentication middleware
 * Accepts username in x-admin-username header and verifies it matches allowed list
 * This is for username-only admin access (no JWT required)
 */
export const requireAdminUsername = async (req, res, next) => {
  try {
    const adminUsername = req.headers['x-admin-username']?.toLowerCase().trim();
    
    if (!adminUsername) {
      return res.status(401).json({ error: 'Admin username required' });
    }
    
    const isAuthorized = ALLOWED_ADMIN_USERS.includes(adminUsername);
    
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Admin access denied' });
    }
    
    // Attach admin username to request for logging/auditing
    req.adminUsername = adminUsername;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization error' });
  }
};

