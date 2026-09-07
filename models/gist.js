import mongoose from 'mongoose';

const gistFileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  content: { type: String, required: true },
  language: { type: String, default: 'text' },
  size: { type: Number, default: 0 }
});

const gistSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, default: '' },
  public: { type: Boolean, default: true, index: true },
  files: { type: [gistFileSchema], required: true },
  comments_count: { type: Number, default: 0 },
  stars_count: { type: Number, default: 0 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('Gist', gistSchema);
