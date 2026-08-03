/**
 * Environment Configuration
 * Strictly reads environment variables directly from process.env without || fallbacks
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '../../');
const nodeEnv = process.env.NODE_ENV;
const envFiles = nodeEnv === 'production' 
  ? ['.env.production', '.env.local']
  : ['.env.local', '.env.production'];

for (const file of envFiles) {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
}

const env = {
  // Server
  PORT: parseInt(process.env.PORT, 10),
  NODE_ENV: process.env.NODE_ENV,
  isDev: process.env.NODE_ENV === 'development',
  SERVER_URL: process.env.SERVER_URL,

  // Redis
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: parseInt(process.env.REDIS_PORT, 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,

  // AI Keys & Shared Model
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,

  // Feature AI Models & Audio Settings
  OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL,
  OPENAI_TTS_VOICE: process.env.OPENAI_TTS_VOICE,
  OPENAI_TTS_INSTRUCTIONS: process.env.OPENAI_TTS_INSTRUCTIONS,
  OPENAI_MENTOR_MODEL: process.env.OPENAI_MENTOR_MODEL,
  OPENAI_MENTOR_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_MENTOR_MAX_OUTPUT_TOKENS, 10),
  OPENAI_RESUME_MODEL: process.env.OPENAI_RESUME_MODEL,
  OPENAI_RESUME_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_RESUME_MAX_OUTPUT_TOKENS, 10),
  OPENAI_PRESENTATION_MODEL: process.env.OPENAI_PRESENTATION_MODEL,
  OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS: parseInt(process.env.OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS, 10),
  PROJECT_CRITIQUE_MODEL: process.env.PROJECT_CRITIQUE_MODEL,
  PROJECT_CRITIQUE_MAX_OUTPUT_TOKENS: parseInt(process.env.PROJECT_CRITIQUE_MAX_OUTPUT_TOKENS, 10),
  OPENAI_REQUEST_TIMEOUT_MS: parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS, 10),
  OPENAI_MAX_RETRIES: parseInt(process.env.OPENAI_MAX_RETRIES, 10),
  RESUME_ANALYSIS_CACHE_TTL_MS: parseInt(process.env.RESUME_ANALYSIS_CACHE_TTL_MS, 10),
  RESUME_ANALYSIS_CACHE_MAX_ENTRIES: parseInt(process.env.RESUME_ANALYSIS_CACHE_MAX_ENTRIES, 10),

  // Security & ClamAV
  PROJECT_UPLOAD_SCAN_MODE: process.env.PROJECT_UPLOAD_SCAN_MODE,
  CLAMAV_CLAMSCAN_PATH: process.env.CLAMAV_CLAMSCAN_PATH,
  CLAMAV_CLAMDSCAN_PATH: process.env.CLAMAV_CLAMDSCAN_PATH,

  // Speech-To-Text (AssemblyAI)
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY,
  ASSEMBLYAI_SPEECH_MODELS: process.env.ASSEMBLYAI_SPEECH_MODELS,

  // STC API (PHP Backend)
  STC_API_BASE_URL: process.env.STC_API_BASE_URL,
  STC_ASSESSMENT_API_PREFIX: process.env.STC_ASSESSMENT_API_PREFIX,

  // Session & Security
  SESSION_TTL: parseInt(process.env.SESSION_TTL_SECONDS, 10),
  MAX_QUESTIONS: parseInt(process.env.MAX_QUESTIONS_PER_SESSION, 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  JWT_SECRET: process.env.JWT_SECRET,
};

module.exports = env;
