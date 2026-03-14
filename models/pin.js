import mongoose from 'mongoose';

const pinSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
  order: { type: Number, default: 0 }
});

export default mongoose.model('Pin', pinSchema);