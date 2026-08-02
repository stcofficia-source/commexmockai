/**
 * Speech-to-Text Service
 * Uses AssemblyAI for transcription with fallback
 */
const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../core/logger');
const { AppError } = require('../../core/errors');

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';
const DEFAULT_SPEECH_MODELS = ['universal-2'];

function getSpeechModels() {
  const raw = (env.ASSEMBLYAI_SPEECH_MODELS || '').trim();
  if (!raw) return DEFAULT_SPEECH_MODELS;
  const models = raw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return models.length ? models : DEFAULT_SPEECH_MODELS;
}

/**
 * Transcribe audio buffer to text using AssemblyAI
 * @param {Buffer} audioBuffer - Raw audio data
 * @param {string} contentType - Audio content type (e.g., audio/webm, audio/wav)
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioBuffer, contentType = 'audio/webm') {
  if (!env.ASSEMBLYAI_API_KEY) {
    logger.error('ASSEMBLYAI_API_KEY is not configured');
    throw new AppError(
      'Recorded-answer transcription is not configured on this server.',
      503,
      'STT_NOT_CONFIGURED',
    );
  }

  try {
    // Step 1: Upload audio
    const uploadRes = await axios.post(`${ASSEMBLYAI_BASE}/upload`, audioBuffer, {
      headers: {
        authorization: env.ASSEMBLYAI_API_KEY,
        'content-type': 'application/octet-stream',
        'transfer-encoding': 'chunked',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const audioUrl = uploadRes.data.upload_url;
    
    if (audioBuffer) {
      logger.info({ 
        bufferSize: audioBuffer.length,
        mimeType: contentType 
      }, '📥 REST: High-fidelity audio buffer received');
    }
 
    const transcriptRes = await axios.post(
      `${ASSEMBLYAI_BASE}/transcript`,
      {
        audio_url: audioUrl,
        language_code: 'en',
        // `speech_model` is deprecated by AssemblyAI; use `speech_models` instead.
        // As of 2026-04-21, accepted values include: universal-3-pro, universal-2.
        speech_models: getSpeechModels(),
        punctuate: true,
        format_text: true,
        disfluencies: false, // REMOVES "Yeah, Yeah, Uh, Um"
        word_boost: [
          'CGPA', 'OOPS', 'Fullstack', 'Frontend', 'Backend', 
          'Internship', 'ZOHO', 'TCS', 'Cognizant', 'Infosys', 
          'ReactJS', 'NodeJS', 'MongoDB', 'REST API', 'SQL',
          'Semester', 'Placement', 'Recruitment', 'HR'
        ],
        boost_param: 'high'
      },
      {
        headers: {
          authorization: env.ASSEMBLYAI_API_KEY,
          'content-type': 'application/json',
        },
      }
    );

    const transcriptId = transcriptRes.data.id;
    const result = await pollTranscription(transcriptId);
    
    if (result) {
      logger.info({ transcriptId }, '✅ AssemblyAI: Transcription completed');
    }
    
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const errorMsg = err.response?.data?.error || err.message;
    logger.error({ err: errorMsg }, '❌ AssemblyAI: Transcription failed');
    throw new AppError(
      'The recorded answer could not be transcribed. Please record it again.',
      502,
      'STT_PROVIDER_ERROR',
    );
  }
}

/**
 * Poll AssemblyAI for transcription completion
 */
async function pollTranscription(transcriptId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await axios.get(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
        headers: { authorization: env.ASSEMBLYAI_API_KEY },
      });

      const { status, text, error } = res.data;

      if (status === 'completed') {
        logger.debug({ transcriptId, text: text?.substring(0, 50) }, 'Transcription completed');
        return text || '';
      }

      if (status === 'error') {
        logger.error({ transcriptId, error }, 'Transcription error');
        throw new AppError(
          'The transcription service could not read this recording. Please record it again.',
          422,
          'STT_AUDIO_UNREADABLE',
        );
      }

      // Real interview recordings commonly need several seconds to process.
      // Give the provider up to 30 seconds instead of returning an empty
      // transcript after the former 4.5-second polling window.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err: err.message }, 'Poll request failed');
      throw new AppError(
        'The transcription service is temporarily unavailable. Please try again.',
        502,
        'STT_PROVIDER_ERROR',
      );
    }
  }

  logger.warn({ transcriptId }, 'Transcription polling timeout');
  throw new AppError(
    'Transcription is taking too long. Please send the answer again.',
    504,
    'STT_TIMEOUT',
  );
}

/**
 * Transcribe from text directly (when client sends text via speech recognition)
 * This is the primary path — client uses expo-speech-recognition for on-device STT
 */
function passthrough(text) {
  return (text || '').trim();
}

module.exports = {
  transcribeAudio,
  passthrough,
};
