import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  login: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  avatar_url: { type: String, default: "" },
  name: { type: String, default: "" },
  bio: { type: String, default: "" },
  followers_count: { type: Number, default: 0 },
  following_count: { type: Number, default: 0 },
  public_repos_count: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

userSchema.index({ login: 'text', name: 'text' });

export default mongoose.model('User', userSchema);