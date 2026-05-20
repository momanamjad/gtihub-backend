import mongoose from 'mongoose';

const issueSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  state: { type: String, enum: ['open', 'closed'], default: 'open' },
  labels: [String],
  comments_count: { type: Number, default: 0 },
  is_deleted: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

issueSchema.index({ repository: 1, state: 1 });
issueSchema.index({ creator: 1 });

export default mongoose.model('Issue', issueSchema);
