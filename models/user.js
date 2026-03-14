import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  login: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar_url: { type: String, default: "" },
  name: { type: String, default: "" },
  bio: { type: String, default: "" },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('User', userSchema);