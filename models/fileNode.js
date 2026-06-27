import mongoose from 'mongoose';

const fileNodeSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  branch: { type: String, default: "main", index: true },
  name: { type: String, required: true },
  path: { type: String, required: true },
  type: { type: String, enum: ['file', 'dir'], required: true },
  content: { type: String, default: "" },
  parentPath: { type: String, default: "" },
  lastCommitMessage: { type: String, default: "Initial commit" },
  lastCommitAuthor: { type: String, default: "unknown" },
  lastCommitDate: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Composite indexes for fast directory and path lookups
fileNodeSchema.index({ repository: 1, branch: 1, path: 1 }, { unique: true });
fileNodeSchema.index({ repository: 1, branch: 1, parentPath: 1 });

export default mongoose.model('FileNode', fileNodeSchema);
