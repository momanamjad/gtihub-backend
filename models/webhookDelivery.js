import mongoose from 'mongoose';

const webhookDeliverySchema = new mongoose.Schema({
  webhook: { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
  event: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  request_headers: { type: mongoose.Schema.Types.Mixed },
  response_headers: { type: mongoose.Schema.Types.Mixed },
  response_body: { type: String },
  status_code: { type: Number },
  delivered_at: { type: Date, default: Date.now },
  success: { type: Boolean, required: true },
  duration_ms: { type: Number }
});

export default mongoose.model('WebhookDelivery', webhookDeliverySchema);
