import mongoose from 'mongoose';

const followerSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Ensure unique followers
followerSchema.index({ follower: 1, following: 1 }, { unique: true });
followerSchema.index({ following: 1 });

export default mongoose.model('Follower', followerSchema);
