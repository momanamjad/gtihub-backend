import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['follow', 'star', 'issue', 'comment'], required: true },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository' },
  issue: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue' },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, created_at: -1 });

export default mongoose.model('Notification', notificationSchema);
