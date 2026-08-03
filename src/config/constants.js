/**
 * Application Constants
 */
const INTERVIEW_STATES = {
  IDLE: 'idle',
  ASKING: 'asking',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  EVALUATING: 'evaluating',
  COMPLETE: 'complete',
};

const WS_EVENTS = {
  // Client → Server
  SESSION_START: 'session:start',
  SESSION_ATTACH: 'session:attach',
  ANSWER_AUDIO: 'answer:audio_chunk',
  ANSWER_TEXT: 'answer:text',
  SILENCE_DETECTED: 'answer:silence_detected',
  SESSION_END: 'session:end',
  SESSION_PAUSE: 'session:pause',
  SESSION_RESUME: 'session:resume',

  // Live Streaming STT
  SPEECH_STREAM_START: 'speech:stream_start',
  SPEECH_AUDIO_CHUNK: 'speech:audio_chunk',
  SPEECH_STREAM_STOP: 'speech:stream_stop',
  SPEECH_TRANSCRIPT: 'speech:transcript',

  // Server → Client
  SESSION_READY: 'session:ready',
  QUESTION_NEW: 'question:new',
  ANSWER_PROCESSING: 'answer:processing',
  ANSWER_EVALUATED: 'answer:evaluated',
  SESSION_COMPLETE: 'session:complete',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong',
};

const DIFFICULTY_LEVELS = {
  ENTRY: 'entry',
  MID: 'mid',
  SENIOR: 'senior',
};

const SCORE_THRESHOLDS = {
  LOW: 4,
  MEDIUM: 7,
  HIGH: 9,
};

module.exports = {
  INTERVIEW_STATES,
  WS_EVENTS,
  DIFFICULTY_LEVELS,
  SCORE_THRESHOLDS,
};
