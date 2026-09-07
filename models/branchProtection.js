import mongoose from 'mongoose';

const branchProtectionSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  branch: { type: String, required: true },
  
  // Protection Rules
  require_pr_reviews: { type: Boolean, default: false },
  required_approving_review_count: { type: Number, default: 1, min: 1, max: 6 },
  
  require_status_checks: { type: Boolean, default: false },
  strict_status_checks: { type: Boolean, default: false }, // Require branches to be up to date before merging
  contexts: { type: [String], default: [] }, // Status checks that must pass
  
  enforce_admins: { type: Boolean, default: false }, // Apply rules to administrators too
  
  require_linear_history: { type: Boolean, default: false },
  allow_force_pushes: { type: Boolean, default: false },
  allow_deletions: { type: Boolean, default: false },

}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Each branch in a repository can only have one protection rule set
branchProtectionSchema.index({ repository: 1, branch: 1 }, { unique: true });

export default mongoose.model('BranchProtection', branchProtectionSchema);
