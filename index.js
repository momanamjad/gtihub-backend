import 'dotenv/config';
import express from 'express';
import path from 'path';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server } from 'socket.io';
import { notificationEmitter } from './utils/eventEmitter.js';

// Import Swagger config
import swaggerDocs from './config/swagger.js';

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
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
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

app.options(/.*/, cors());

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

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

// Database Connection Middleware for Serverless/Vercel
const connectDB = async (req, res, next) => {
  // If already connected, proceed
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
    if (mongoose.connection.readyState === 2) {
      await new Promise((resolve, reject) => {
        let retries = 0;
        const maxRetries = 20; // 10 seconds at 500ms intervals
        const interval = setInterval(() => {
          retries++;
          if (mongoose.connection.readyState === 1) {
            clearInterval(interval);
            resolve();
          } else if (retries >= maxRetries) {
            clearInterval(interval);
            reject(new Error('MongoDB connection timeout'));
          }
        }, 500);
      });
      return next();
    }

    // Otherwise, connect
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');
    next();
  } catch (err) {
    console.error('❌ Database Connection Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed: ' + err.message
    });
  }
};

app.use(connectDB);

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
app.use('/api/repos/:repoId/discussions', discussionRoutes);
app.use('/api/repos/:repoId/wiki', wikiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/projects', projectRoutes);
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

export default app;