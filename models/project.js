import mongoose from 'mongoose';

const projectCardSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  column: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo', index: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('ProjectCard', projectCardSchema);
