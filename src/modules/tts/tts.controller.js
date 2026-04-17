/**
 * TTS Streaming Controller
 * Provides a low-latency proxy to stream OpenAI TTS directly to the client.
 */
const OpenAI = require('openai');
const env = require('../../config/env');
const logger = require('../../core/logger');

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * GET /api/mock/tts/stream?text=...
 * Streams audio directly from OpenAI to the response
 */
async function streamTts(req, res) {
  const { text, voice = 'nova' } = req.query;

  if (!text) {
    return res.status(400).json({ error: 'Text parameter is required' });
  }

  try {
    logger.debug({ text: text.substring(0, 50) }, 'Initiating TTS Stream Proxy...');

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice,
      input: text,
      speed: 0.95,
      response_format: 'mp3',
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
