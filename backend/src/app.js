const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const apiRoutes = require('./routes');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API V1 Routes
app.use('/api/v1', apiRoutes);

// Root Fallback Route
app.get('/', (req, res) => {
  res.json({
    message: 'ETRAI Fact-Checking & AI Verification API',
    healthCheck: '/api/v1/health'
  });
});

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint Not Found', path: req.originalUrl });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[ETRAI Server Error]:', err.stack || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
