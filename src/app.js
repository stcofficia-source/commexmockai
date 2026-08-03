/**
 * Express Application Setup
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const logger = require('./core/logger');
const { version } = require('../package.json');

const app = express();
const corsOrigins = String(env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Security middleware
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const allowed = !origin || corsOrigins.includes('*') || corsOrigins.includes(origin);
    callback(null, allowed);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Interview-Client'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(require('path').join(__dirname, '../public')));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.url !== '/health') {
      logger.debug({
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
      }, 'HTTP request');
    }
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'stcmockai',
    version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Auth Middleware
const { authenticate } = require('./core/middleware/auth');

// Mock Interview Module Routes (Protected)
app.use('/api/mock', authenticate, require('./modules/interview/interview.routes'));

// Browser mock interviews use their own fast REST/socket contract. The mobile
// app remains on /api/mock and its existing WebSocket path.
app.use('/api/web/mock-interviews', authenticate, require('./modules/interview/web-interview.routes'));

// Dashboard Module Routes (Protected)
app.use('/api/dashboard', authenticate, require('./modules/dashboard/dashboard.routes'));

// AI Mentor routes use the same verified STC session and keep OpenAI server-only.
app.use('/api/mentor', authenticate, require('./modules/mentor/mentor.routes'));

// STC/PHP owns assessment data and reports; this service is the authenticated adapter.
app.use('/api/assessments', authenticate, require('./modules/assessments/physical-assessment.routes'));

// Resume data is owned by STC/PHP; this authenticated adapter keeps the web UI
// on the same server-side API boundary as the rest of the AI workspace.
app.use('/api/resumes', authenticate, require('./modules/resume/resume.routes'));

// File parsing and GPT analysis stay in Express; STC/PHP persists the result.
app.use('/api/project-critiques', authenticate, require('./modules/project-critique/project-critique.routes'));

// Presentation text is extracted by the web server; model execution and exact
// provider-usage credit settlement remain in the shared AI backend.
app.use('/api/presentation-coach', authenticate, require('./modules/presentation-coach/presentation-coach.routes'));

// API version info
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'STC Mock AI Interview',
      version,
      features: [
        'websocket_interview',
        'gemini_ai_evaluation',
        'adaptive_questions',
        'speech_to_text',
        'text_to_speech',
        'session_management',
        'interview_reports',
      ],
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (err.isOperational && statusCode < 500) {
    logger.warn({ err, statusCode }, 'Request rejected');
  } else {
    logger.error({ err, statusCode }, 'Unhandled error');
  }
  res.status(statusCode).json({
    success: false,
    message: err.isOperational ? err.message : 'Internal server error',
  });
});

module.exports = app;
