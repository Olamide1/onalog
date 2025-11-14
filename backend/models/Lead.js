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
    required: true,
    index: true
  },
  website: {
    type: String,
    index: true
  },
  
  // Contact details
  emails: [{
    email: String,
    source: String, // 'website', 'social', 'extracted'
    confidence: Number
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
  
  // AI Enrichment
  enrichment: {
    businessSummary: String,
    companySize: String, // 'micro', 'small', 'medium', 'large'
    revenueBracket: String, // '0-50k', '50k-200k', '200k-1m', '1m+'
    industry: String,
    emailPattern: String,
    contactRelevance: Number, // 0-100
    signalStrength: Number, // 0-100
    enrichedAt: Date
  },
  
  // Metadata
  extractionStatus: {
    type: String,
    enum: ['pending', 'extracting', 'extracted', 'failed'],
    default: 'pending'
  },
  enrichmentStatus: {
    type: String,
    enum: ['pending', 'enriching', 'enriched', 'failed'],
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

