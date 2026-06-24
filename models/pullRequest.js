import mongoose from 'mongoose';

const pullRequestSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  status: { type: String, enum: ['open', 'closed', 'merged'], default: 'open', index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceBranch: { type: String, default: '' },
  targetBranch: { type: String, default: 'main' },
  number: { type: Number },
  comments: [{
    filePath: { type: String, required: true },
    lineNumber: { type: Number, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
  }],
  reviews: [{
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    state: { type: String, enum: ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'], required: true },
    body: { type: String, default: "" },
    submitted_at: { type: Date, default: Date.now }
  }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

pullRequestSchema.pre('save', function(next) {
  if (this.sourceBranch === this.targetBranch) {
    return next(new Error('Source and target branches must be different'));
  }
  next();
});

export default mongoose.model('PullRequest', pullRequestSchema);
