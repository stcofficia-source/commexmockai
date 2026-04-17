/**
 * Express Application Setup
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const logger = require('./core/logger');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mock Interview Module Routes
app.use('/api/mock', require('./modules/interview/interview.routes'));

// API version info
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'STC Mock AI Interview',
      version: '1.0.0',
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
  logger.error({ err }, 'Unhandled error');
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.isOperational ? err.message : 'Internal server error',
  });
});

module.exports = app;
