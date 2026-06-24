import mongoose from 'mongoose';

const wikiPageSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, default: "" },
  slug: { type: String, required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Ensure slug is unique per repository
wikiPageSchema.index({ repository: 1, slug: 1 }, { unique: true });

export default mongoose.model('WikiPage', wikiPageSchema);
