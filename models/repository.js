import mongoose from 'mongoose';

const repositorySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  language: { type: String, default: "JavaScript" },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  stars_count: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('Repository', repositorySchema);