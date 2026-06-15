import mongoose from 'mongoose';

const pullRequestSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  status: { type: String, enum: ['open', 'closed', 'merged'], default: 'open', index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceBranch: { type: String, default: 'main' },
  targetBranch: { type: String, default: 'main' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('PullRequest', pullRequestSchema);
