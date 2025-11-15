import mongoose from 'mongoose';

const searchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Search parameters
  query: {
    type: String,
    required: true
  },
  country: String,
  location: String,
  resultCount: {
    type: Number,
    default: 50,
    enum: [50, 100, 200]
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'queued', 'searching', 'extracting', 'enriching', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Results metadata
  totalResults: Number,
  extractedCount: Number,
  enrichedCount: Number,
  
  // Saved search template
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateName: String,
  
  // Timestamps
  startedAt: Date,
  completedAt: Date,
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
searchSchema.index({ userId: 1, createdAt: -1 });
searchSchema.index({ isTemplate: 1, userId: 1 });

export default mongoose.model('Search', searchSchema);

