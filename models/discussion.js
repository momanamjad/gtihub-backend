import mongoose from 'mongoose';

const replySchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true },
  isAnswer: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const discussionSchema = new mongoose.Schema({
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  category: { type: String, enum: ['general', 'qna', 'ideas'], default: 'general' },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies: [replySchema]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

discussionSchema.index({ repository: 1, category: 1 });

export default mongoose.model('Discussion', discussionSchema);
