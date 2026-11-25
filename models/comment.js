import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  body: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issue: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue' },
  pullRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'PullRequest' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

commentSchema.index({ issue: 1, created_at: 1 });
commentSchema.index({ pullRequest: 1, created_at: 1 });

export default mongoose.model('Comment', commentSchema);
