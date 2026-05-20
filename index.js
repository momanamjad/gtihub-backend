import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

// Import Swagger config
import swaggerDocs from './config/swagger.js';

// Import Routes
import authRoutes from './routes/auth.js';
import repoRoutes from './routes/repos.js';
import userRoutes from './routes/users.js';

// Import error handling
import { errorHandler } from './utils/errorHandler.js';

dotenv.config();

const app = express();

// Security Middleware
app.use(helmet());

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// CORS Configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true,
}));

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ Connection Error:', err.message));

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

// Health Check Route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// API Routes
app.get('/', (req, res) => res.json({ 
  message: 'GitHub Clone API is running!',
  docs: '/api/docs',
  version: '1.0.0',
}));

app.use('/api/auth', authRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/users', userRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Only listen if not in Vercel environment
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 API Docs available at http://localhost:${PORT}/api/docs`);
  });
} else if (process.env.VERCEL) {
  console.log('✅ Running on Vercel');
}

export default app;