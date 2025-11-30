import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  normalizedName: {
    type: String,
    required: true,
    unique: true
  },
  
  // Admin user (first user who created company)
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Company type/industry (optional, for better search targeting)
  companyType: {
    type: String,
    enum: ['agency', 'saas', 'ecommerce', 'service_provider', 'manufacturing', 'other'],
    default: null
  },
  
  // Sharing settings (controlled by admin)
  settings: {
    shareSearches: {
      type: Boolean,
      default: true
    },
    shareLeads: {
      type: Boolean,
      default: true
    },
    shareTemplates: {
      type: Boolean,
      default: true
    }
  },
  
  // Credits for enrichment (company-scoped)
  creditBalance: {
    type: Number,
    default: 0
  },
  // Billing profile
  billing: {
    currency: {
      type: String,
      enum: ['usd', 'ngn'],
      default: 'usd'
    },
    provider: {
      type: String,
      enum: ['mock', 'stripe', 'paystack'],
      default: 'mock'
    },
    customerId: { type: String, default: null },
    taxInfo: { type: Object, default: {} },
    address: { type: Object, default: {} }
  },
  // Lightweight ledger (append-only)
  ledger: {
    type: [
      {
        ts: { type: Date, default: Date.now },
        delta: { type: Number, required: true }, // +credits or -credits
        reason: { type: String, required: true }, // purchase, reserve, consume, refund_invalid, adjust
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        searchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Search' },
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
        currency: { type: String, enum: ['usd', 'ngn'], default: 'usd' },
        packId: { type: String, default: null },
        meta: { type: Object, default: {} }
      }
    ],
    default: []
  },
  
  // Member count
  memberCount: {
    type: Number,
    default: 1
  },
  
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

// Indexes
// Note: normalizedName already has unique: true which creates an index automatically
companySchema.index({ adminId: 1 });

export default mongoose.model('Company', companySchema);

