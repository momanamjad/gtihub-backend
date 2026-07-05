import mongoose from 'mongoose';

const releaseSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  tagName: { type: String, required: true },
  name: { type: String, required: true },
  body: { type: String, default: "" },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assets: [{
    name: { type: String, required: true },
    size: { type: Number, default: 0 },
    downloadUrl: { type: String, required: true }
  }],
  isPrerelease: { type: Boolean, default: false },
  isDraft: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Ensure unique releases per tag inside a repository
releaseSchema.index({ repository: 1, tagName: 1 }, { unique: true });

export default mongoose.model('Release', releaseSchema);
