import mongoose from 'mongoose';

const mcpServerSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  type: { type: String, enum: ['stdio', 'sse'], default: 'stdio' },
  command: { type: String, default: "" },
  args: { type: [String], default: [] },
  url: { type: String, default: "" },
  category: { type: String, default: 'tools' },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stars: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  downloads: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

mcpServerSchema.index({ name: 'text', description: 'text' });
mcpServerSchema.index({ category: 1 });

export default mongoose.model('McpServer', mcpServerSchema);
