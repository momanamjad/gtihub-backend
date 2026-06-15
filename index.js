import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

// Import Swagger config
import swaggerDocs from './config/swagger.js';

// Import Routes
import authRoutes from './routes/auth.js';
import repoRoutes from './routes/repos.js';
import userRoutes from './routes/users.js';
import pullRoutes from './routes/pulls.js';

// Import error handling
import { errorHandler } from './utils/errorHandler.js';

dotenv.config();

const app = express();

// CORS Configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
}));

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    return !!req.cookies?.accessToken;
  }
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

// Cookie Parser Middleware
app.use(cookieParser());

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ Connection Error:', err.message));

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve);
app.get('/api/docs', swaggerUi.setup(swaggerDocs, {
  customCss: '.swagger-ui { max-width: 1400px; margin: 0 auto; }',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));
app.get('/api/docs/swagger-ui.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.send(swaggerUi.CSS);
});
app.get('/api/docs/swagger-ui-bundle.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(swaggerUi.JS);
});

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
app.use('/api/repos/:repoId/pulls', pullRoutes);
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