const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const apiRoutes = require('./routes');
const { generalApiLimiter } = require('./middleware/rateLimiter');

// Load environment variables
dotenv.config();

// Global process error handlers to prevent unhandled crashes
if (process.listenerCount('uncaughtException') === 0) {
  process.on('uncaughtException', (err) => {
    console.error('[FATAL UNCAUGHT EXCEPTION]:', err.stack || err.message);
  });
}

if (process.listenerCount('unhandledRejection') === 0) {
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED PROMISE REJECTION]:', reason instanceof Error ? reason.stack : reason);
  });
}

const app = express();

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Middleware
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    // Allow localhost, 127.0.0.1, any .vercel.app deployment, or explicit CLIENT_URL
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const isVercel = origin.endsWith('.vercel.app') || origin.includes('vercel.app');
    const isExplicitlyAllowed = allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed));

    if (isLocalhost || isVercel || isExplicitlyAllowed) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// General Rate Limiting for all API V1 routes
app.use('/api/v1', generalApiLimiter);

// API V1 Routes
app.use('/api/v1', apiRoutes);

// Production Static Asset & SPA Serving
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  
  // SPA Fallback for client-side routing (excluding /api routes)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  // Root Fallback Route when frontend dist is not built
  app.get('/', (req, res) => {
    res.json({
      message: 'ETRAI Fact-Checking & AI Verification API',
      healthCheck: '/api/v1/health',
      readinessCheck: '/api/v1/health/ready'
    });
  });
}

// 404 Route Handler for unmatched API routes
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint Not Found', path: req.originalUrl });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const isProd = (process.env.NODE_ENV || 'development').toLowerCase() === 'production';
  
  // Handle Multer upload limits
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'Uploaded file exceeds the maximum allowed size limit of 50MB.',
      code: 'PAYLOAD_TOO_LARGE',
      status: 413
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  
  if (statusCode >= 500) {
    console.error('[ETRAI Server Error]:', err.stack || err.message || err);
  }

  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
    code: err.code || 'SERVER_ERROR',
    status: statusCode,
    timestamp: new Date().toISOString(),
    ...(isProd ? {} : { details: err.stack })
  });
});

module.exports = app;
