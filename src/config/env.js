/**
 * Environment Configuration
 * Loads and validates environment variables
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '../../');
const nodeEnv = process.env.NODE_ENV || 'development';
const envFiles = nodeEnv === 'production' 
  ? ['.env.production', '.env.local', '.env']
  : ['.env.local', '.env.development', '.env'];

for (const file of envFiles) {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
}

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
  // The browser always asks for English (India); these server settings keep
  // the generated interviewer audio aligned with that locale.
  OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  // Nova gives the clearest warm female delivery for this interviewer. Deployments
  // can still explicitly override the voice through OPENAI_TTS_VOICE.
  OPENAI_TTS_VOICE: process.env.OPENAI_TTS_VOICE || 'nova',
  OPENAI_TTS_INSTRUCTIONS: process.env.OPENAI_TTS_INSTRUCTIONS || 'Speak in clear, warm female Indian English. Use a natural Indian-English cadence, a calm professional interview pace, and pronounce Indian names naturally. Do not use an American-style accent.',
  OPENAI_MENTOR_MODEL: process.env.OPENAI_MENTOR_MODEL || 'gpt-4o-mini',
  OPENAI_MENTOR_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_MENTOR_MAX_OUTPUT_TOKENS || '1800', 10),
  OPENAI_RESUME_MODEL: process.env.OPENAI_RESUME_MODEL || process.env.OPENAI_MENTOR_MODEL || 'gpt-4o-mini',
  OPENAI_RESUME_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_RESUME_MAX_OUTPUT_TOKENS || '2200', 10),
  OPENAI_PRESENTATION_MODEL: process.env.OPENAI_PRESENTATION_MODEL || process.env.OPENAI_MENTOR_MODEL || 'gpt-4o-mini',
  OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS || '16000', 10),
  OPENAI_REQUEST_TIMEOUT_MS: parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS || '45000', 10),
  OPENAI_MAX_RETRIES: parseInt(process.env.OPENAI_MAX_RETRIES || '2', 10),
  AI_PROVIDER_PRICING_PATH: process.env.AI_PROVIDER_PRICING_PATH || '',
  AI_PROVIDER_PRICING_JSON: process.env.AI_PROVIDER_PRICING_JSON || '',
  RESUME_ANALYSIS_CACHE_TTL_MS: parseInt(process.env.RESUME_ANALYSIS_CACHE_TTL_MS || '300000', 10),
  RESUME_ANALYSIS_CACHE_MAX_ENTRIES: parseInt(process.env.RESUME_ANALYSIS_CACHE_MAX_ENTRIES || '100', 10),
  PROJECT_CRITIQUE_MODEL: process.env.PROJECT_CRITIQUE_MODEL || process.env.OPENAI_MENTOR_MODEL || 'gpt-4o-mini',
  PROJECT_CRITIQUE_MAX_OUTPUT_TOKENS: parseInt(process.env.PROJECT_CRITIQUE_MAX_OUTPUT_TOKENS || '6000', 10),

  // Project upload security. Production fails closed when ClamAV is unavailable.
  PROJECT_UPLOAD_SCAN_MODE: process.env.PROJECT_UPLOAD_SCAN_MODE || ((process.env.NODE_ENV || 'development') === 'production' ? 'strict' : 'compatible'),
  CLAMAV_CLAMSCAN_PATH: process.env.CLAMAV_CLAMSCAN_PATH || '/usr/bin/clamscan',
  CLAMAV_CLAMDSCAN_PATH: process.env.CLAMAV_CLAMDSCAN_PATH || '/usr/bin/clamdscan',
  CLAMAV_SOCKET: process.env.CLAMAV_SOCKET || '',
  CLAMAV_HOST: process.env.CLAMAV_HOST || '',
  CLAMAV_PORT: parseInt(process.env.CLAMAV_PORT || '3310', 10),
  CLAMAV_TIMEOUT_MS: parseInt(process.env.CLAMAV_TIMEOUT_MS || '120000', 10),

  // AssemblyAI
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY || '',
  // Comma-separated list. As of 2026-04-21 AssemblyAI accepts: universal-3-pro, universal-2
  ASSEMBLYAI_SPEECH_MODELS: process.env.ASSEMBLYAI_SPEECH_MODELS || '',

  // STC API
  STC_API_BASE_URL: process.env.STC_API_BASE_URL || '',
  STC_ASSESSMENT_API_PREFIX: process.env.STC_ASSESSMENT_API_PREFIX || '/v1/psychometric-assessments',

  // Session
  SESSION_TTL: parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10),
  MAX_QUESTIONS: parseInt(process.env.MAX_QUESTIONS_PER_SESSION || '10', 10),

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};

module.exports = env;
