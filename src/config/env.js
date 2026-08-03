/**
 * Environment Configuration
 * Loads and validates environment variables cleanly
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '../../');
const nodeEnv = process.env.NODE_ENV || 'development';
const envFiles = nodeEnv === 'production' 
  ? ['.env.production', '.env.local']
  : ['.env.local', '.env.production'];

for (const file of envFiles) {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
}

const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

  // AI Keys & Shared Model
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: defaultModel,

  // Feature AI Models (defaults to shared OPENAI_MODEL)
  OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  OPENAI_TTS_VOICE: process.env.OPENAI_TTS_VOICE || 'nova',
  OPENAI_TTS_INSTRUCTIONS: process.env.OPENAI_TTS_INSTRUCTIONS || 'Speak in clear, warm female Indian English. Use a natural Indian-English cadence, a calm professional interview pace, and pronounce Indian names naturally.',
  OPENAI_MENTOR_MODEL: process.env.OPENAI_MENTOR_MODEL || defaultModel,
  OPENAI_MENTOR_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_MENTOR_MAX_OUTPUT_TOKENS || '1800', 10),
  OPENAI_RESUME_MODEL: process.env.OPENAI_RESUME_MODEL || defaultModel,
  OPENAI_RESUME_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_RESUME_MAX_OUTPUT_TOKENS || '2200', 10),
  OPENAI_PRESENTATION_MODEL: process.env.OPENAI_PRESENTATION_MODEL || defaultModel,
  OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS || '16000', 10),
  PROJECT_CRITIQUE_MODEL: process.env.PROJECT_CRITIQUE_MODEL || defaultModel,
  PROJECT_CRITIQUE_MAX_OUTPUT_TOKENS: parseInt(process.env.PROJECT_CRITIQUE_MAX_OUTPUT_TOKENS || '6000', 10),
  OPENAI_REQUEST_TIMEOUT_MS: parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS || '45000', 10),
  OPENAI_MAX_RETRIES: parseInt(process.env.OPENAI_MAX_RETRIES || '2', 10),
  RESUME_ANALYSIS_CACHE_TTL_MS: parseInt(process.env.RESUME_ANALYSIS_CACHE_TTL_MS || '300000', 10),
  RESUME_ANALYSIS_CACHE_MAX_ENTRIES: parseInt(process.env.RESUME_ANALYSIS_CACHE_MAX_ENTRIES || '100', 10),

  // Security & ClamAV
  PROJECT_UPLOAD_SCAN_MODE: process.env.PROJECT_UPLOAD_SCAN_MODE || ((process.env.NODE_ENV || 'development') === 'production' ? 'strict' : 'compatible'),
  CLAMAV_CLAMSCAN_PATH: process.env.CLAMAV_CLAMSCAN_PATH || '/usr/bin/clamscan',
  CLAMAV_CLAMDSCAN_PATH: process.env.CLAMAV_CLAMDSCAN_PATH || '/usr/bin/clamdscan',

  // Speech-To-Text (AssemblyAI)
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY || '',
  ASSEMBLYAI_SPEECH_MODELS: process.env.ASSEMBLYAI_SPEECH_MODELS || 'universal-2',

  // STC API (PHP Backend)
  STC_API_BASE_URL: process.env.STC_API_BASE_URL || '',
  STC_ASSESSMENT_API_PREFIX: process.env.STC_ASSESSMENT_API_PREFIX || '/v1/psychometric-assessments',

  // Session & Security
  SESSION_TTL: parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10),
  MAX_QUESTIONS: parseInt(process.env.MAX_QUESTIONS_PER_SESSION || '10', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  JWT_SECRET: process.env.JWT_SECRET || '13b12cfc5e91db24d1607369319e484010d7583bd9a3ca4bd5b3102d831b85b8',
};

module.exports = env;
