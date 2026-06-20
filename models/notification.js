import mongoose from 'mongoose';
import { notificationEmitter } from '../utils/eventEmitter.js';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['follow', 'star', 'issue', 'comment', 'pr', 'merge'], required: true },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository' },
  issue: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue' },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, created_at: -1 });

notificationSchema.post('save', function(doc) {
  doc.populate('actor', 'login name avatar_url').then(populatedDoc => {
    notificationEmitter.emit('newNotification', populatedDoc);
  }).catch(err => {
    console.error('Error populating notification actor:', err);
    notificationEmitter.emit('newNotification', doc);
  });
});

export default mongoose.model('Notification', notificationSchema);
