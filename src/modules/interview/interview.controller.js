/**
 * Interview Controller
 * Handles HTTP requests for interview meta data
 */
const interviewService = require('./interview.service');
const axios = require('axios');
const env = require('../../config/env');
const multer = require('multer');
const logger = require('../../core/logger');

// Configure multer for memory storage (high-speed processing)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('audioFile');

const getAssemblyToken = async (req, res, next) => {
  try {
    const response = await axios.get('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600', {
      headers: { authorization: env.ASSEMBLYAI_API_KEY }
    });
    res.json({ success: true, token: response.data.token });
  } catch (err) {
    next(err);
  }
};

const getDepartments = async (req, res, next) => {
  try {
    const data = await interviewService.getDepartments();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getRolesByDepartment = async (req, res, next) => {
  try {
    const data = await interviewService.getRolesByDepartment(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getRoleDetail = async (req, res, next) => {
  try {
    const data = await interviewService.getRoleDetail(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getReport = async (req, res, next) => {
  try {
    const data = await interviewService.getReport(req.params.sessionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const { user_id, page, limit } = req.query;
    const data = await interviewService.getHistory(user_id, page, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle high-fidelity M4A upload from mobile (Advanced Async Path)
 * Bypasses WebSocket payload limits. Returns instant ACK to client.
 */
const uploadAnswerAudio = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) return next(err);
    
    try {
      const { sessionId, fallbackText } = req.body;
      const audioBuffer = req.file ? req.file.buffer : null;
      
      if (!sessionId) {
        return res.status(400).json({ success: false, message: 'sessionId is required' });
      }

      // 1. SESSION VALIDATION: Check if session exists BEFORE ACK
      // This prevents "Analyzing" hangs if the server was restarted
      const sessionManager = require('../../core/session');
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        logger.warn({ sessionId }, '❌ REST: Upload attempted for expired session');
        return res.status(404).json({ success: false, message: 'Session not found or expired' });
      }

      logger.info({ 
        sessionId, 
        bufferSize: audioBuffer?.length || 0,
        mimetype: req.file?.mimetype 
      }, '📥 REST: Audio upload received (Async Path)');

      // 2. INSTANT ACK: Tell mobile we got the file
      res.json({ success: true, message: 'Processing started' });

      // 2. BACKGROUND WORK: Process the answer without blocking the HTTP response
      setImmediate(async () => {
        try {
          // 2. Transcribe Audio (AssemblyAI)
          const result = await interviewService.processAnswer(sessionId, fallbackText, audioBuffer);
          const gateway = require('./interview.gateway');

          // 3. PUSH EVALUATION & TEXT IMMEDIATELY (Don't wait for TTS)
          gateway.broadcastToSession(sessionId, 'answer:evaluated', {
            questionNumber: result.questionNumber,
            scores: result.evaluation,
            feedback: result.evaluation.feedback
          });

          if (result.isComplete) {
            const finalReport = await interviewService.completeInterview(sessionId);
            gateway.broadcastToSession(sessionId, 'session:complete', finalReport);
          } else if (result.nextQuestion) {
            // PUSH TEXT VERSION FIRST (Instant UI Update)
            gateway.broadcastToSession(sessionId, 'question:new', {
                ...result.nextQuestion,
                audioUrl: '' // Audio is generating...
            });

            // 4. GENERATE TTS IN PARALLEL
            try {
                const ttsService = require('../tts/tts.service');
                const audioUrl = await ttsService.generateSpeechUrl(result.nextQuestion.questionText);
                
                // PUSH AUDIO UPDATE (Seamless Playback)
                gateway.broadcastToSession(sessionId, 'question:new', {
                    ...result.nextQuestion,
                    audioUrl: audioUrl
                });
            } catch (ttsErr) {
                logger.warn({ err: ttsErr.message }, 'Background TTS generation failed');
            }
          }
        } catch (bgErr) {
          logger.error({ err: bgErr.message, sessionId }, '❌ Background processing failed');
          const gateway = require('./interview.gateway');
          gateway.broadcastToSession(sessionId, 'error', { 
            message: bgErr.message,
            code: 'SESSION_EXPIRED' 
          });
        }
      });

    } catch (err) {
      if (!res.headersSent) {
        next(err);
      } else {
        logger.error({ err: err.message }, 'Error after ACK sent');
      }
    }
  });
};

module.exports = {
  getDepartments,
  getRolesByDepartment,
  getRoleDetail,
  getReport,
  getHistory,
  getAssemblyToken,
  uploadAnswerAudio,
};
