import mongoose from 'mongoose';

const orgMemberSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// A user can only have one membership per org
orgMemberSchema.index({ organization: 1, user: 1 }, { unique: true });

export default mongoose.model('OrgMember', orgMemberSchema);
