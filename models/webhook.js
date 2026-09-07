import mongoose from 'mongoose';

const webhookSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  url: { type: String, required: true },
  secret: { type: String, default: '' },
  events: { type: [String], default: ['push'] },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('Webhook', webhookSchema);
