/**
 * Environment Configuration
 * Loads and validates environment variables
 */
require('dotenv').config();

const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3500', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:3500',

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',

  // AI Models
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // AssemblyAI
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY || '',
  // Comma-separated list. As of 2026-04-21 AssemblyAI accepts: universal-3-pro, universal-2
  ASSEMBLYAI_SPEECH_MODELS: process.env.ASSEMBLYAI_SPEECH_MODELS || '',

  // STC API
  STC_API_BASE_URL: process.env.STC_API_BASE_URL || 'http://192.168.29.244:8000',

  // Session
  SESSION_TTL: parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10),
  MAX_QUESTIONS: parseInt(process.env.MAX_QUESTIONS_PER_SESSION || '10', 10),

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};

module.exports = env;
