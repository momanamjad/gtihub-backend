import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Import Routes
import authRoutes from './routes/auth.js';
import repoRoutes from './routes/repos.js';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ Connection Error:', err.message));

// Basic Route
app.get('/', (req, res) => res.send('GitHub Clone API is running!'));

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/repos', repoRoutes);

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;