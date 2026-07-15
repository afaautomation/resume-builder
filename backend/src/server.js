console.log('>>> [BOOT] Process started. Node version:', process.version);
require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// ─── Ensure directories exist (BEFORE logger) ──────────────────────────────────
try {
  ['uploads/resumes','uploads/avatars','exports','logs','data'].forEach((dir) => {
    const p = path.join(__dirname, '..', dir);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  });
} catch (err) {
  console.error('Failed to create initial directories:', err);
}

const logger = require('./config/logger');
const { getDb } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// ─── Route modules ────────────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const resumeRoutes    = require('./routes/resumes');
const templateRoutes  = require('./routes/templates');
const importRoutes    = require('./routes/import');
const exportRoutes    = require('./routes/export');
const tipsRoutes      = require('./routes/tips');
const aiRoutes        = require('./routes/ai');


// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false, // Allow iframing from the frontend
}));
app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Compression & parsing
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
// app.use('/api', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' },
});
// app.use('/api/auth', authLimiter);

// ─── Static files ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve Frontend Static Files — disable caching for JS/CSS so edits show immediately
app.use(express.static(path.join(__dirname, '../../frontend'), {
  setHeaders(res, filePath) {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ─── Public Routes ────────────────────────────────────────────────────────────
// Welcome route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Resume Builder API is LIVE',
    version: '1.0.0',
    docs: '/api',
    health: '/health'
  });
});

// Health check
app.get('/health', async (_req, res) => {
  try {
    const db = await getDb();
    const result = await db.get('SELECT COUNT(*) AS c FROM templates');
    res.json({
      status: 'ok',
      version: '1.0.0',
      env: process.env.NODE_ENV,
      database: 'connected',
      templates: result ? result.c : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
  }
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/resumes',   resumeRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/import',    importRoutes);
app.use('/api/export',    exportRoutes);
app.use('/api/tips',      tipsRoutes);
app.use('/api/ai',        aiRoutes);


// ─── API docs (mini) ─────────────────────────────────────────────────────────
app.get('/api', (_req, res) => {
  res.json({
    name: 'Resume Builder API',
    version: '1.0.0',
    endpoints: {
      auth:      '/api/auth      — register · login · refresh · me',
      resumes:   '/api/resumes   — CRUD · ATS · design · order · versions · duplicate',
      templates: '/api/templates — list · categories · single',
      import:    '/api/import    — upload DOCX/image · jobs',
      export:    '/api/export    — Word download · HTML preview · history',
      tips:      '/api/tips      — section tips · random tip',
    },
  });
});

// ─── Catch-all for Frontend SPA ────────────────────────────────────────────
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next(); // Fall through to 404 handler
  }
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Boot ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Resume Builder API starting up...`);
    logger.info(`📡 Listening on 0.0.0.0:${PORT}`);
    logger.info(`📋 API docs: http://localhost:${PORT}/api`);
    logger.info(`🏥 Health:   http://localhost:${PORT}/health`);
  });
}

module.exports = app;
