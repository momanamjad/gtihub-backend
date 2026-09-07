import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  description: { type: String, default: '' },
  privacy: { type: String, enum: ['visible', 'secret'], default: 'visible' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Enforce unique team slug per org
teamSchema.index({ organization: 1, slug: 1 }, { unique: true });

export default mongoose.model('Team', teamSchema);
