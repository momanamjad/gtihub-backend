import mongoose from 'mongoose';

const repositorySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 100,
    match: /^[a-zA-Z0-9._-]+$/ // GitHub-like naming rules
  },
  description: { type: String, default: "" },
  language: { type: String, default: "" },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  stars_count: { type: Number, default: 0, min: 0 },
  forks_count: { type: Number, default: 0, min: 0 },
  watchers_count: { type: Number, default: 0, min: 0 },
  watchers: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  issues_count: { type: Number, default: 0, min: 0 },
  url: { type: String, default: "" },
  topics: [String],
  branches: { type: [String], default: ['main'] },
  tags: { type: [String], default: [] },
  is_deleted: { type: Boolean, default: false, index: true },
  is_profile_readme: { type: Boolean, default: false, index: true },
  license: { type: String, default: "MIT License" },
  size: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

repositorySchema.index({ owner: 1, is_deleted: 1 });
repositorySchema.index({ owner: 1, name: 1 }, { unique: true, partialFilterExpression: { is_deleted: false } });
repositorySchema.index({ name: 'text', description: 'text' }, { language_override: 'none' });
repositorySchema.index({ visibility: 1, is_deleted: 1 });

export default mongoose.model('Repository', repositorySchema);