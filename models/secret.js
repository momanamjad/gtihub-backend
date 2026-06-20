import mongoose from 'mongoose';

const secretSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  name: { type: String, required: true },
  value: { type: String, required: true }, // Encrypted payload
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Make sure secret names are unique per repository
secretSchema.index({ repository: 1, name: 1 }, { unique: true });

export default mongoose.model('Secret', secretSchema);
