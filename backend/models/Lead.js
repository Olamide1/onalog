import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  // Search metadata
  searchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Search',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Raw extraction data
  rawTitle: String,
  rawSnippet: String,
  rawLink: String,
  
  // Structured company data
  companyName: {
    type: String,
    required: true
  },
  website: {
    type: String
  },
  
  // Contact details
  emails: [{
    email: String,
    source: String, // 'website', 'social', 'extracted'
    confidence: Number,
    deliverability: { // NEW: Email deliverability scoring
      score: Number, // 0-100, deliverability score
      status: String, // 'valid', 'invalid', 'risky', 'unknown'
      checkedAt: Date,
      method: String // 'syntax', 'api', 'unknown'
    }
  }],
  phoneNumbers: [{
    phone: String,
    country: String,
    formatted: String,
    source: String,
    confidence: Number
  }],
  whatsappLinks: [String],
  address: String,
  
  // Social media
  socials: {
    linkedin: String,
    twitter: String,
    facebook: String,
    instagram: String
  },
  
  // Content
  aboutText: String,
  categorySignals: [String],
  
  // Decision makers extracted from website
  decisionMakers: [{
    name: String,
    title: String,
    email: String, // Generated from name + pattern
    source: String, // 'website', 'structured_data', 'ai_inferred'
    confidence: Number // 0-100
  }],
  
  // AI Enrichment
  enrichment: {
    businessSummary: String,
    companySize: String, // 'micro', 'small', 'medium', 'large'
    employeeCount: Number, // Exact employee count or range (e.g., 25, 150)
    employeeCountRange: String, // '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'
    revenueBracket: String, // '0-50k', '50k-200k', '200k-1m', '1m+'
    industry: String,
    emailPattern: String,
    contactRelevance: Number, // 0-100
    signalStrength: Number, // 0-100
    verificationScore: Number, // 0-5, calculated during enrichment
    verificationSources: [String], // Array of sources used for verification
    foundedYear: Number, // Company founded year
    location: {
      city: String,
      state: String,
      country: String,
      formatted: String
    },
    hiringSignals: {
      isHiring: Boolean,
      hasCareersPage: Boolean,
      hasJobPostings: Boolean,
      detectedAt: Date
    },
    linkedinContacts: {
      contacts: [{
        name: String,
        title: String,
        normalizedTitle: String, // Normalized job title
        seniority: String, // 'executive', 'senior', 'mid', 'junior'
        department: String,
        relevance: Number, // 0-100
        suggestedEmail: String,
        linkedinSearchQuery: String,
        notes: String
      }],
      linkedinCompanyUrl: String,
      enrichedAt: Date
    },
    enrichedAt: Date
  },
  
  // Quality scoring (0-5, calculated after extraction)
  qualityScore: {
    type: Number,
    min: 0,
    max: 5,
    default: null
  },
  
  // Metadata
  extractionStatus: {
    type: String,
    enum: ['pending', 'extracting', 'extracted', 'failed'],
    default: 'pending'
  },
  enrichmentStatus: {
    type: String,
    enum: ['pending', 'enriching', 'enriched', 'failed', 'skipped'],
    default: 'pending'
  },
  isDuplicate: {
    type: Boolean,
    default: false
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
leadSchema.index({ searchId: 1, createdAt: -1 });
leadSchema.index({ companyName: 1 });
leadSchema.index({ website: 1 });
leadSchema.index({ 'enrichment.signalStrength': -1 });
leadSchema.index({ extractionStatus: 1, enrichmentStatus: 1 });

export default mongoose.model('Lead', leadSchema);

