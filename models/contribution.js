import mongoose from 'mongoose';

const contributionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { 
    type: String, 
    enum: [
      'repo_created', 
      'file_created', 
      'file_updated', 
      'pr_created', 
      'issue_created',
      'repo_starred',
      'user_followed',
      'pr_merged',
      'issue_commented'
    ], 
    required: true 
  },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository' },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  count: { type: Number, default: 1 },
  commitMessage: { type: String },
  commitAuthor: { type: String },
  commitHash: { type: String },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Add index on user and created_at for fast aggregation queries
contributionSchema.index({ user: 1, created_at: -1 });

export default mongoose.model('Contribution', contributionSchema);
