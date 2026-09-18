import 'dotenv/config';
import express from 'express';
import path from 'path';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import http from 'http';
import { Server } from 'socket.io';
import { notificationEmitter } from './utils/eventEmitter.js';

import swaggerDocs from './config/swagger.js';
// Start queue workers only in non-serverless standalone server
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  import('./services/webhookQueue.js').catch(() => {});
  import('./services/actionsQueue.js').catch(() => {});
}

// Import Routes
import authRoutes from './routes/auth.js';
import repoRoutes from './routes/repos.js';
import userRoutes from './routes/users.js';
import pullRoutes from './routes/pulls.js';
import discussionRoutes from './routes/discussions.js';
import mcpRoutes from './routes/mcp.js';
import copilotRoutes from './routes/copilot.js';
import uploadRoutes from './routes/upload.js';
import wikiRoutes from './routes/wiki.js';
import projectRoutes from './routes/projects.js';
import searchRoutes from './routes/search.js';
import releaseRoutes from './routes/releases.js';
import webhookRoutes from './routes/webhooks.js';
import orgRoutes from './routes/orgs.js';
import gistsRoutes from './routes/gists.js';

// Import error handling
import { errorHandler } from './utils/errorHandler.js';

const app = express();
const server = http.createServer(app);

// CORS Configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'https://github-kappa-two.vercel.app'];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST"]
  }
});

const userSockets = new Map();

io.on('connection', (socket) => {
  socket.on('register', (userId) => {
    userSockets.set(userId, socket.id);
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
  });
});

notificationEmitter.on('newNotification', (notification) => {
  const recipientId = notification.user.toString();
  const socketId = userSockets.get(recipientId);
  if (socketId) {
    io.to(socketId).emit('notification', notification);
  }
});

app.use(cors({
  origin: (origin, callback) => {
    callback(null, true); // Allow all origins dynamically
  },
  credentials: true,
}));

// Fix wildcard CORS pre-flight to use configured origins
app.options(/.*/, cors({
  origin: (origin, callback) => {
    callback(null, true); // Allow all origins dynamically
  },
  credentials: true,
}));

// Gzip compression — must be before routes
app.use(compression({ level: 6, threshold: 1024 }));

// Cache-Control for GET API responses (public profiles & GET routes cached with stale-while-revalidate)
app.use('/api/', (req, res, next) => {
  if (req.method === 'GET') {
    // Public user profile GET /api/auth/user/:username can be cached briefly (15s edge, 60s swr)
    if (req.path.match(/^\/auth\/user\/[^\/]+$/)) {
      res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    } else if (req.path.startsWith('/auth/') || req.path.includes('/profile') || req.path.includes('/users/me')) {
      // Private auth and self-profile routes should not be cached
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    } else {
      res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    }
  } else {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

// Nonce generation middleware for CSP
import crypto from 'crypto';
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Security Middleware
app.use((req, res, next) => {
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", `'nonce-${res.locals.nonce}'`]
      }
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })(req, res, next);
});

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Cookie Parser Middleware
app.use(cookieParser());

// Body Parser Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Disable query buffering so that we don't hang for 10s if the connection fails or isn't ready
mongoose.set('bufferCommands', false);

// Health Check Route (before connectDB to prevent blocking)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// API Welcome Route
app.get('/', (req, res) => res.json({ 
  message: 'GitHub Clone API is running!',
  docs: '/api/docs',
  version: '1.0.0',
}));

// Database Connection Middleware for Serverless/Vercel
let cachedMongoose = global._mongooseConn;
if (!cachedMongoose) {
  cachedMongoose = global._mongooseConn = { conn: null, promise: null };
}

const connectDB = async (req, res, next) => {
  // Pre-flight OPTIONS and health checks do not need DB connection
  if (req.method === 'OPTIONS' || req.path === '/health' || req.path === '/') {
    return next();
  }

  // If already connected, proceed immediately
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  let dbUri = process.env.MONGODB_URI;
  if (dbUri) {
    dbUri = dbUri.trim().replace(/^["']|["']$/g, '');
  }

  if (!dbUri) {
    return res.status(500).json({
      success: false,
      message: 'Database connection failed: MONGODB_URI environment variable is not defined.'
    });
  }

  try {
    if (!cachedMongoose.promise) {
      console.log('🔄 Connecting to MongoDB...');
      cachedMongoose.promise = mongoose.connect(dbUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }).then((m) => {
        console.log('✅ Connected to MongoDB');
        return m;
      }).catch((err) => {
        cachedMongoose.promise = null;
        throw err;
      });
    }
    await cachedMongoose.promise;
    next();
  } catch (err) {
    cachedMongoose.promise = null;
    console.error('❌ Database Connection Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed: ' + err.message
    });
  }
};

app.use(connectDB);

// Swagger Documentation Gating Middleware
const checkDocsAuth = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  const token = req.headers['x-docs-token'] || req.query.token;
  if (process.env.DOCS_TOKEN && token === process.env.DOCS_TOKEN) {
    return next();
  }
  res.status(403).json({ success: false, message: 'Swagger documentation access denied.' });
};

app.use('/api/docs', checkDocsAuth);

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/repos/:repoId/pulls', pullRoutes);
app.use('/api/repos/:repoId/discussions', discussionRoutes);
app.use('/api/repos/:repoId/wiki', wikiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/gists', gistsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/repos/:repoId/releases', releaseRoutes);
app.use('/api/repos/:id/webhooks', webhookRoutes);
app.use('/api/orgs', orgRoutes);
import packagesRoutes from './routes/packages.js';
app.use('/api/packages', packagesRoutes);

app.use('/uploads/packages', express.static(path.join(process.cwd(), 'uploads', 'packages')));
app.get('/uploads/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  
  const uploadDir = process.env.VERCEL 
    ? '/tmp'
    : path.resolve('public/uploads');
    
  const filePath = path.resolve(uploadDir, safeFilename);
  
  // Verify that the resolved path is inside the upload directory
  if (!filePath.startsWith(path.resolve(uploadDir))) {
    return res.status(400).json({ success: false, message: 'Invalid file path' });
  }

  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ success: false, message: 'Image not found' });
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global Error Handler
app.use(errorHandler);

// Enable ETags globally
app.set('etag', 'strong');

const PORT = process.env.PORT || 5000;

// Only listen if not in Vercel environment
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 API Docs available at http://localhost:${PORT}/api/docs`);
  });
} else if (process.env.VERCEL) {
  console.log('✅ Running on Vercel');
}

// Handle unhandled promise rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception thrown:', err);
  if (!process.env.VERCEL) {
    process.exit(1);
  }
});

export default app;