import mongoose from 'mongoose';

const pinSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
  order: { type: Number, default: 0 }
}, { timestamps: { createdAt: 'created_at' } });

pinSchema.index({ user: 1, repository: 1 }, { unique: true });

export default mongoose.model('Pin', pinSchema);