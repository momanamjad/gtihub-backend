import mongoose from 'mongoose';

const contributionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { 
    type: String, 
    enum: ['repo_created', 'file_created', 'file_updated', 'pr_created', 'issue_created'], 
    required: true 
  },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository' },
  count: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Add index on user and created_at for fast aggregation queries
contributionSchema.index({ user: 1, created_at: -1 });

export default mongoose.model('Contribution', contributionSchema);
