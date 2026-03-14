import mongoose from 'mongoose';

const starSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true }
});

export default mongoose.model('Star', starSchema);