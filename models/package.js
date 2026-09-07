import mongoose from 'mongoose';

const packageVersionSchema = new mongoose.Schema({
  version: { type: String, required: true },
  tarballUrl: { type: String, required: true }, // URL to download the asset
  size: { type: Number, default: 0 },
  dependencies: { type: Map, of: String, default: {} },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  packageType: { type: String, enum: ['npm', 'docker', 'maven', 'nuget', 'rubygems'], default: 'npm' },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, default: '' },
  versions: [packageVersionSchema],
  latest_version: { type: String, default: '1.0.0' },
  downloads_count: { type: Number, default: 0 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// A user/org can only have one package with a given name
packageSchema.index({ owner: 1, name: 1 }, { unique: true });

export default mongoose.model('Package', packageSchema);
