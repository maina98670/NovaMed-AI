/**
 * NovaMed AI — backend entry.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const encounterRoutes = require('./routes/encounters');
const adminRoutes = require('./routes/admin');
const claimsRoutes    = require('./routes/claims');
const logger = require('./services/logger');

const app = express();
const PORT = process.env.PORT || 4000;

// Allowed origins: FRONTEND_URL env var (production) + localhost (dev)
const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean));

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Render health-checks, same-origin)
    if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

// Static for uploaded files (read-only)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Routes
app.use('/api/auth',        authRoutes);
app.use('/api/patients',    patientRoutes);
app.use('/api/encounters',  encounterRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/claims',     claimsRoutes);

// Optionally serve a built frontend
const buildPath = path.join(__dirname, '..', '..', 'frontend', 'build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  // Don't log expected client errors as errors
  if (status >= 500) {
    logger.error('http.unhandled_error', err, {
      method : req.method,
      path   : req.path,
      user   : req.user?.sub,
      status,
    });
  } else {
    logger.warn('http.client_error', {
      message: err.message,
      method : req.method,
      path   : req.path,
      status,
    });
  }

  res.status(status).json({ ok: false, error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`\n  NovaMed AI API`);
  console.log(`  ──────────────`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  health:  /api/health`);
  const _aiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  const _aiProvider = (process.env.AI_PROVIDER || 'gemini').toUpperCase();
  if (_aiKey) {
    console.log(`  AI augmentation: enabled (provider: ${_aiProvider})`);
    console.log(`  ✅ API key detected — AI mode active.\n`);
  } else {
    console.log(`  AI augmentation: disabled (DB-only mode)`);
    console.log(`  ⚠️  No API key found. Add GROQ_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY to your .env file.\n`);
  }
});
