import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  login: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true, select: false },
  avatar_url: { type: String, default: "" },
  name: { type: String, default: "" },
  bio: { type: String, default: "" },
  company: { type: String, default: "" },
  location: { type: String, default: "" },
  blog: { type: String, default: "" },
  pronouns: { type: String, default: "" },
  status: {
    emoji: { type: String, default: "" },
    text: { type: String, default: "" },
    isBusy: { type: Boolean, default: false },
  },
  followers_count: { type: Number, default: 0 },
  following_count: { type: Number, default: 0 },
  public_repos_count: { type: Number, default: 0 },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date },
  refreshToken: { type: String, default: null, select: false },
  loginAttempts: { type: Number, required: true, default: 0 },
  lockUntil: { type: Date },
  storage_used: { type: Number, default: 0 },
  storage_limit: { type: Number, default: 1048576000 }, // 1GB default limit
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

userSchema.index({ login: 'text', name: 'text' });

export default mongoose.model('User', userSchema);