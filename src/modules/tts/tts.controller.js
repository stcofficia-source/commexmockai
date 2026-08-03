/**
 * TTS Streaming Controller
 * Provides a low-latency proxy to stream the configured Indian-English
 * interviewer voice directly to the client.
 */
const env = require('../../config/env');
const logger = require('../../core/logger');
const { createSpeech } = require('../../core/openai-client');

/**
 * GET /api/mock/tts/stream?text=...
 * Streams audio directly from OpenAI to the response
 */
async function streamTts(req, res) {
  const { text } = req.query;

  if (!text) {
    return res.status(400).json({ error: 'Text parameter is required' });
  }

  try {
    logger.debug({ text: text.substring(0, 50) }, 'Initiating TTS Stream Proxy...');

    const ttsModel = (env.OPENAI_TTS_MODEL && env.OPENAI_TTS_MODEL.startsWith('tts-')) ? env.OPENAI_TTS_MODEL : 'tts-1';
    const validVoices = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
    const ttsVoice = validVoices.has(env.OPENAI_TTS_VOICE) ? env.OPENAI_TTS_VOICE : 'nova';

    const response = await createSpeech({
      model: ttsModel,
      voice: ttsVoice,
      input: text,
      speed: 0.95,
      responseFormat: 'mp3',
    });

    // Set headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    // INDUSTRY STANDARD: Bridge Web Stream to Node Stream for Express piping
    const { Readable } = require('stream');
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);

    nodeStream.on('end', () => {
      logger.debug('TTS Stream Proxy completed successfully');
    });

    nodeStream.on('error', (err) => {
      logger.error({ err: err.message }, 'TTS Stream Proxy error');
      if (!res.headersSent) {
        res.status(500).send('Streaming error');
      }
    });

  } catch (err) {
    logger.error({ err: err.message }, 'Failed to initialize TTS stream');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio' });
    }
  }
}

module.exports = {
  streamTts,
};
