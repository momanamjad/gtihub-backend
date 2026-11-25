import mongoose from 'mongoose';

const workflowRunSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  name: { type: String, default: 'CI/CD Pipeline' },
  branch: { type: String, default: 'main' },
  status: { type: String, enum: ['queued', 'in_progress', 'success', 'failure'], default: 'queued', index: true },
  logs: { type: [String], default: [] }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

workflowRunSchema.index({ repository: 1, created_at: -1 });

export default mongoose.model('WorkflowRun', workflowRunSchema);
