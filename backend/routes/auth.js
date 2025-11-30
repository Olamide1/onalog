import express from 'express';
import User from '../models/User.js';
import Company from '../models/Company.js';
import jwt from 'jsonwebtoken';
import { normalizeCompanyName, findSimilarCompanies } from '../utils/companyMatcher.js';
import { defaultCurrency } from '../services/billing.js';

const router = express.Router();

// Generate JWT token
function generateToken(userId) {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign({ userId }, secret, {
    expiresIn: '7d'
  });
}

/**
 * POST /api/auth/signup - Create new user
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, companyName, joinCompanyId, userRole, companyType } = req.body;
    
    // Validation
    if (!name || !email || !password || !companyName) {
      return res.status(400).json({ error: 'Name, email, password, and company name are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    if (companyName.trim().length < 2) {
      return res.status(400).json({ error: 'Company name must be at least 2 characters' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    let company;
    let role = 'member';
    
    // Handle company matching
    if (joinCompanyId) {
      // User chose to join existing company
      company = await Company.findById(joinCompanyId);
      if (!company) {
        return res.status(400).json({ error: 'Company not found' });
      }
      // Increment member count
      company.memberCount += 1;
      await company.save();
    } else {
      // Check for similar companies
      const matchResult = await findSimilarCompanies(companyName, Company);
      
      if (matchResult.type === 'exact') {
        // Exact match - join existing company
        company = matchResult.match;
        company.memberCount += 1;
        await company.save();
      } else if (matchResult.type === 'similar' && matchResult.similarity >= 0.85) {
        // Similar company found - return suggestion
        return res.status(200).json({
          requiresConfirmation: true,
          suggestedCompany: {
            id: matchResult.match._id,
            name: matchResult.match.name,
            similarity: matchResult.similarity
          },
          message: `Did you mean "${matchResult.match.name}"? Or create new company "${companyName}"?`
        });
      } else {
        // No match - will create new company after user is created
        role = 'admin'; // First user is admin
        company = null; // Will create after user
      }
    }
    
    // Create user first (needed for adminId when creating new company)
    const user = new User({
      name,
      email,
      password,
      role,
      userRole: userRole || null // Optional: founder_ceo, sales_manager, marketing_manager, operations, other
    });
    
    // If creating new company, we need user._id first
    if (role === 'admin' && !company) {
      // Save user temporarily to get _id
      await user.save();
      
      const normalizedName = normalizeCompanyName(companyName);
      company = new Company({
        name: companyName.trim(),
        normalizedName,
        adminId: user._id,
        companyType: companyType || null, // Optional: agency, saas, ecommerce, service_provider, manufacturing, other
        settings: {
          shareSearches: true,
          shareLeads: true,
          shareTemplates: true
        },
        memberCount: 1
      });
      // Seed free credits for new companies
      try {
        const freeCredits = parseInt(process.env.FREE_CREDITS_NEW || '0', 10);
        if (freeCredits > 0) {
          company.creditBalance = (company.creditBalance || 0) + freeCredits;
          if (!company.billing) company.billing = {};
          if (!company.billing.currency) company.billing.currency = defaultCurrency();
          company.ledger = company.ledger || [];
          company.ledger.push({
            delta: freeCredits,
            reason: 'signup_bonus',
            byUserId: user._id,
            currency: company.billing.currency
          });
        }
      } catch {}
      await company.save();
      
      // Update user with companyId
      user.companyId = company._id;
      await user.save();
    } else {
      // For existing companies, set companyId before saving
      user.companyId = company._id;
      await user.save();
    }
    
    // Generate token
    const token = generateToken(user._id);
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        userRole: user.userRole || null,
        companyId: company._id,
        companyName: company.name,
        companyType: company.companyType || null
      }
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login - Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      // Security: Don't reveal that email doesn't exist
      return res.status(401).json({ 
        error: 'Invalid email or password'
      });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Security: Don't reveal that email exists but password is wrong
      return res.status(401).json({ 
        error: 'Invalid email or password'
      });
    }
    
    // Generate token
    const token = generateToken(user._id);
    
    const company = await Company.findById(user.companyId);
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        userRole: user.userRole || null,
        companyId: user.companyId,
        companyName: company?.name,
        companyType: company?.companyType || null
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/me - Get current user (protected)
 */
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.userId).populate('companyId', 'name companyType');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        userRole: user.userRole || null,
        companyId: user.companyId?._id,
        companyName: user.companyId?.name,
        companyType: user.companyId?.companyType || null,
        defaultCountry: user.defaultCountry,
        defaultResultCount: user.defaultResultCount
      }
    });
    
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * PUT /api/auth/profile - Update user profile settings
 */
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { name, defaultCountry, defaultResultCount } = req.body;
    
    // Update allowed fields
    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
      }
      user.name = name.trim();
    }
    
    if (defaultCountry !== undefined) {
      user.defaultCountry = defaultCountry || null;
    }
    
    if (defaultResultCount !== undefined) {
      if (![50, 100, 200].includes(defaultResultCount)) {
        return res.status(400).json({ error: 'Result count must be 50, 100, or 200' });
      }
      user.defaultResultCount = defaultResultCount;
    }
    
    await user.save();
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        defaultCountry: user.defaultCountry,
        defaultResultCount: user.defaultResultCount
      }
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/auth/password - Change user password
 */
router.put('/password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password updated successfully' });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

