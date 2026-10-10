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
  ['uploads/resumes','uploads/avatars','exports','logs'].forEach((dir) => {
    const p = path.join(__dirname, '..', dir);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  });
} catch (err) {
  console.error('Failed to create initial directories:', err);
}

const logger = require('./config/logger');
const { supabase } = require('./config/supabase');
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

// The hosting proxy terminates TLS in front of us, so the client IP arrives
// in X-Forwarded-For. Without this, express-rate-limit buckets every visitor
// under the proxy's single address and the limits above do nothing.
// Behind Cloudflare -> Cloud Run there are two proxies (set TRUST_PROXY=2).
app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || 1);

// When PROXY_SECRET is set, only requests forwarded by our Cloudflare proxy
// (which adds this header) are served. This stops callers going straight to the
// Cloud Run URL and forging X-Forwarded-For to dodge the rate limits.
if (process.env.PROXY_SECRET) {
  const crypto = require('crypto');
  const expected = Buffer.from(process.env.PROXY_SECRET);
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const given = Buffer.from(String(req.get('x-proxy-secret') || ''));
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
    return res.status(403).json({ success: false, message: 'Forbidden' });
  });
}

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false, // Allow iframing from the frontend
}));
// Allowed browser origins. Reflecting any origin while also sending
// `credentials: true` let any website make authenticated calls on a visitor's
// behalf, so the list is now explicit. Configure extra origins via CLIENT_ORIGIN
// (comma-separated) rather than widening this code.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://kompetenzen.in',
  'https://www.kompetenzen.in',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5500',
];

const ALLOWED_ORIGINS = new Set(
  DEFAULT_ALLOWED_ORIGINS.concat(
    (process.env.CLIENT_ORIGIN || '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean)
  )
);

const corsOptions = {
  origin(origin, callback) {
    // No Origin header = same-origin navigation, curl, or a server-to-server
    // call. Those are not browser CORS requests.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''))) return callback(null, true);
    logger.warn(`Blocked CORS request from disallowed origin: ${origin}`);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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
  // The live preview re-renders on every edit and has its own, higher limit
  // (routes/export.js).
  skip: (req) => req.path === '/export/preview',
});
app.use('/api', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' },
});
app.use('/api/auth', authLimiter);

// ─── Static files ─────────────────────────────────────────────────────────────
// Uploaded files are user-controlled content served from our own origin.
// Forcing a download and disabling MIME sniffing stops anything that slips past
// the upload filter from executing as a page in a visitor's session.
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  },
}));

// Serve Frontend Static Files — disable caching for JS/CSS so edits show immediately
const frontendStatic = express.static(path.join(__dirname, '../../frontend'), {
  setHeaders(res, filePath) {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
});
app.use(frontendStatic);
// The main site links to /Resume/resume.html, which loads its files from
// frontend/. The Cloudflare proxy strips the /Resume prefix, so serve that layout too.
app.use('/frontend', frontendStatic);
app.get('/resume.html', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, '../../resume.html'));
});

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
    const { count, error } = await supabase
      .from('resume_templates')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({
      status: 'ok',
      version: '1.0.0',
      env: process.env.NODE_ENV,
      database: 'connected',
      templates: count || 0,
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

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`[Process] Unhandled Rejection: ${reason && reason.message ? reason.message : reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`[Process] Uncaught Exception: ${err.message}`, { stack: err.stack });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Resume Builder API starting up...`);
    logger.info(`📡 Listening on 0.0.0.0:${PORT}`);
    logger.info(`📋 API docs: http://localhost:${PORT}/api`);
    logger.info(`🏥 Health:   http://localhost:${PORT}/health`);
  });
}

module.exports = app;
