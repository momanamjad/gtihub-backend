import mongoose from 'mongoose';

const starSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true }
}, { timestamps: { createdAt: 'created_at' } });

starSchema.index({ user: 1, repository: 1 }, { unique: true });

export default mongoose.model('Star', starSchema);