/**
 * Speech-to-Text Service
 * Uses AssemblyAI for transcription with fallback
 */
const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../core/logger');

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

/**
 * Transcribe audio buffer to text using AssemblyAI
 * @param {Buffer} audioBuffer - Raw audio data
 * @param {string} contentType - Audio content type (e.g., audio/webm, audio/wav)
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioBuffer, contentType = 'audio/webm') {
  if (!env.ASSEMBLYAI_API_KEY) {
    logger.warn('No AssemblyAI API key — returning mock transcription');
    return 'This is a mock transcription for development testing.';
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
        speech_model: 'best',
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
    const errorMsg = err.response?.data?.error || err.message;
    logger.error({ err: errorMsg }, '❌ AssemblyAI: Transcription failed');
    return '';
  }
}

/**
 * Poll AssemblyAI for transcription completion
 */
async function pollTranscription(transcriptId, maxAttempts = 30) {
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
        return '';
      }

      // Wait before next poll (Advanced Hyper-Speed: 150ms)
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (err) {
      logger.error({ err: err.message }, 'Poll request failed');
      return '';
    }
  }

  logger.warn({ transcriptId }, 'Transcription polling timeout');
  return '';
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
