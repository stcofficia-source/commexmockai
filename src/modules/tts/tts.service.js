/**
 * Text-to-Speech Service
 * Upgraded: Uses OpenAI Neural TTS (tts-1) for ultra-human, professional voices.
 * Replaces the robotic Google Translate fallback with state-of-the-art AI speech.
 */
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const env = require('../../config/env');
const logger = require('../../core/logger');

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

// Storage path for generated speech files
const TTS_DIR = path.join(__dirname, '../../../public/tts');

/**
 * Generate high-fidelity neural TTS audio URL (Streaming Proxy)
 * @param {string} text - Text to convert to speech
 * @returns {Promise<string>} Public URL for low-latency streaming
 */
async function generateSpeechUrl(text) {
  try {
    if (!env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY missing, TTS generation aborted');
      return '';
    }

    if (!text || text.trim().length === 0) {
      return '';
    }

    // INDUSTRY STANDARD: Return a streaming proxy URL instantly.
    // The client will hit this URL, and the server will stream bits from OpenAI.
    const publicUrl = `${env.SERVER_URL}/api/mock/tts/stream?text=${encodeURIComponent(text)}`;

    logger.debug({ publicUrl }, 'Generated Instant TTS Stream URL');

    return publicUrl;
  } catch (err) {
    logger.error({ err: err.message }, 'TTS URL generation failed');
    return ''; 
  }
}

/**
 * Multi-URL generator (Legacy compatibility)
 */
async function generateSpeechUrls(text) {
  const url = await generateSpeechUrl(text);
  return url ? [url] : [];
}

module.exports = {
  generateSpeechUrl,
  generateSpeechUrls,
};
