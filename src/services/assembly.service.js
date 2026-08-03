/**
 * AssemblyAI Realtime Live Streaming Service
 * Bridges Express WebSocket Gateway to AssemblyAI Streaming API
 */
const { AssemblyAI } = require('assemblyai');
const env = require('../config/env');
const logger = require('../core/logger');

function createRealtimeSession({ onTranscript, onError, onClose, sampleRate = 16000 }) {
  if (!env.ASSEMBLYAI_API_KEY) {
    logger.warn('ASSEMBLYAI_API_KEY missing for Realtime Streaming STT');
    return null;
  }

  try {
    const client = new AssemblyAI({ apiKey: env.ASSEMBLYAI_API_KEY });
    const transcriber = client.realtime.transcriber({
      sampleRate,
      encoding: 'pcm_s16le',
      wordBoost: [
        'CGPA', 'OOPS', 'Fullstack', 'Frontend', 'Backend',
        'Internship', 'ZOHO', 'TCS', 'Cognizant', 'Infosys',
        'ReactJS', 'NodeJS', 'MongoDB', 'REST API', 'SQL',
      ],
    });

    transcriber.on('open', ({ sessionId }) => {
      logger.info({ sessionId }, '⚡ AssemblyAI Live STT Stream Connected');
    });

    transcriber.on('transcript', (transcript) => {
      if (!transcript || !transcript.text) return;
      const isFinal = transcript.message_type === 'FinalTranscript';
      onTranscript?.({
        text: transcript.text,
        isFinal,
        confidence: transcript.confidence || 0.9,
      });
    });

    transcriber.on('error', (err) => {
      logger.error({ err: err?.message || err }, 'AssemblyAI Live STT Error');
      onError?.(err);
    });

    transcriber.on('close', (code, reason) => {
      logger.info({ code, reason }, 'AssemblyAI Live STT Stream Closed');
      onClose?.(code, reason);
    });

    return transcriber;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to initialize AssemblyAI Realtime Transcriber');
    return null;
  }
}

module.exports = { createRealtimeSession };
