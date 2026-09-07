import mongoose from 'mongoose';

const teamRepoSchema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  permission: { type: String, enum: ['read', 'triage', 'write', 'maintain', 'admin'], default: 'read' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

teamRepoSchema.index({ team: 1, repository: 1 }, { unique: true });

export default mongoose.model('TeamRepo', teamRepoSchema);
