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
    unique: true,
    index: true
  },
  
  // Admin user (first user who created company)
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
companySchema.index({ normalizedName: 1 });
companySchema.index({ adminId: 1 });

export default mongoose.model('Company', companySchema);

