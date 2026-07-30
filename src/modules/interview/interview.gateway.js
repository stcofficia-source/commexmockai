/**
 * Interview WebSocket Gateway
 * Handles real-time communication for the mobile client and the separate
 * browser client. Their paths are isolated while their secure session service
 * remains shared.
 */
const { WebSocketServer } = require('ws');
const { WS_EVENTS } = require('../../config/constants');
const interviewService = require('./interview.service');
const logger = require('../../core/logger');
const { authorizeSocket } = require('../../core/middleware/auth');

// Track active connections
const activeConnections = new Map();

/**
 * Initialize WebSocket server on an existing HTTP server
 */
function createInterviewSocketServer(server, path, clientChannel) {
  const wss = new WebSocketServer({
    // The HTTP server owns the single upgrade listener below. Registering two
    // `ws` servers directly against one HTTP server makes the first listener
    // reject the other path with HTTP 400 before it can be handled.
    noServer: true,
    maxPayload: 10 * 1024 * 1024, // 10MB max payload for audio
  });

  wss.on('connection', (ws, req) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    logger.info({ clientId, clientChannel }, 'WebSocket client connected');

    // Store connection metadata
    activeConnections.set(clientId, {
      ws,
      sessionId: null,
      userId: null,
      authorization: '',
      clientChannel,
      connectedAt: Date.now(),
    });

    // Set up heartbeat
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle messages
    ws.on('message', async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        await handleMessage(clientId, ws, message);
      } catch (err) {
        logger.error({ err: err.message, clientId }, 'Failed to process message');
        sendError(ws, 'INVALID_MESSAGE', 'Invalid message format');
      }
    });

    // Handle disconnect
    ws.on('close', (code, reason) => {
      logger.info({ clientId, code }, 'WebSocket client disconnected');
      activeConnections.delete(clientId);
    });

    ws.on('error', (err) => {
      logger.error({ err: err.message, clientId }, 'WebSocket error');
      activeConnections.delete(clientId);
    });
  });

  // Heartbeat interval — ping every 30s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        logger.debug('Terminating inactive WebSocket');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  logger.info({ path, clientChannel }, 'Interview WebSocket server initialized');
  return wss;
}

function initWebSocket(server) {
  const mobile = createInterviewSocketServer(server, '/ws/interview', 'mobile');
  const web = createInterviewSocketServer(server, '/ws/web-interview', 'web');

  const socketServers = new Map([
    ['/ws/interview', mobile],
    ['/ws/web-interview', web],
  ]);

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const target = socketServers.get(pathname);

    if (!target) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    target.handleUpgrade(req, socket, head, (ws) => {
      target.emit('connection', ws, req);
    });
  });

  return { mobile, web };
}

/**
 * Route incoming messages to appropriate handlers
 */
async function handleMessage(clientId, ws, message) {
  const { event, data } = message;

  logger.debug({ clientId, event }, 'Received WS event');

  switch (event) {
    case WS_EVENTS.SESSION_START:
      await handleSessionStart(clientId, ws, data);
      break;

    case WS_EVENTS.SESSION_ATTACH:
      await handleSessionAttach(clientId, ws, data);
      break;

    case WS_EVENTS.ANSWER_TEXT:
      await handleAnswerText(clientId, ws, data);
      break;

    case WS_EVENTS.ANSWER_AUDIO:
      await handleAnswerAudio(clientId, ws, data);
      break;

    case WS_EVENTS.SILENCE_DETECTED:
      await handleSilenceDetected(clientId, ws, data);
      break;

    case WS_EVENTS.SESSION_END:
      await handleSessionEnd(clientId, ws, data);
      break;

    case WS_EVENTS.PING:
      sendEvent(ws, WS_EVENTS.PONG, { timestamp: Date.now() });
      break;

    default:
      sendError(ws, 'UNKNOWN_EVENT', `Unknown event: ${event}`);
  }
}

/**
 * Handle session start — initialize interview and send first question
 */
async function handleSessionStart(clientId, ws, data) {
  const { userId, jobRoleId, jobRoleTitle, difficulty, maxQuestions, token, sessionType } = data || {};

  // 1. Mandatory Auth Check (Industry Standard)
  const user = await authorizeSocket(token);

  if (!user) {
    logger.warn({ clientId, userId }, 'WS: Unauthorized session start attempt');
    return sendError(ws, 'UNAUTHORIZED', 'Invalid or expired authentication token');
  }

  // 2. Validate user ID matches token
  if (user.id != userId) {
      logger.warn({ clientId, providedId: userId,tokenId: user.id }, 'WS: User ID mismatch in token');
      return sendError(ws, 'UNAUTHORIZED', 'User ID mismatch');
  }

  if (!userId || !jobRoleId || !jobRoleTitle) {
    return sendError(ws, 'VALIDATION_ERROR', 'userId, jobRoleId, and jobRoleTitle are required');
  }

  try {
    sendEvent(ws, WS_EVENTS.ANSWER_PROCESSING, { status: 'initializing' });
    const connection = activeConnections.get(clientId);

    const result = await interviewService.startSession(
      userId,
      jobRoleId,
      jobRoleTitle,
      difficulty || 'mid',
      maxQuestions || 10,
      sessionType || 'interview',
      {},
      `Bearer ${token}`,
      { generateAudio: connection?.clientChannel !== 'web' },
    );

    // Update connection metadata
    const conn = activeConnections.get(clientId);
    if (conn) {
      conn.sessionId = result.sessionId;
      conn.userId = userId;
      conn.authorization = `Bearer ${token}`;
      conn.turn = 'ai'; // AI goes first
    }

    // Send session ready
    sendEvent(ws, WS_EVENTS.SESSION_READY, { sessionId: result.sessionId });

    // Send first question
    sendEvent(ws, WS_EVENTS.QUESTION_NEW, {
      questionNumber: result.questionNumber,
      totalQuestions: result.totalQuestions,
      questionText: result.questionText,
      audioUrl: result.audioUrl,
    });

    logger.info({ clientId, sessionId: result.sessionId }, 'Interview session started');
  } catch (err) {
    logger.error({ err: err.message, clientId }, 'Session start failed');
    sendError(ws, 'SESSION_START_FAILED', err.message);
  }
}

/** Attach the browser socket to the session created by the browser REST API. */
async function handleSessionAttach(clientId, ws, data) {
  const { sessionId, token } = data || {};
  if (!sessionId || !token) {
    return sendError(ws, 'VALIDATION_ERROR', 'sessionId and token are required');
  }

  const user = await authorizeSocket(token);
  if (!user) return sendError(ws, 'UNAUTHORIZED', 'Invalid or expired authentication token');

  const session = await require('../../core/session').getSession(sessionId);
  if (!session || String(session.userId) !== String(user.id)) {
    return sendError(ws, 'SESSION_NOT_FOUND', 'Interview session has expired. Start a new interview.');
  }

  const connection = activeConnections.get(clientId);
  if (connection) {
    connection.sessionId = sessionId;
    connection.userId = user.id;
    connection.authorization = `Bearer ${token}`;
    connection.turn = 'ai';
  }

  sendEvent(ws, WS_EVENTS.SESSION_READY, { sessionId });
  if (session.currentQuestionText) {
    sendEvent(ws, WS_EVENTS.QUESTION_NEW, {
      questionNumber: session.currentQuestion + 1,
      totalQuestions: session.maxQuestions,
      questionText: session.currentQuestionText,
      audioUrl: '',
    });
  }
}

/**
 * Handle answer submitted as text (from client-side speech recognition)
 * This is the PRIMARY path — expo-speech-recognition handles STT on device
 */
async function handleAnswerText(clientId, ws, data) {
  const { sessionId, answerText } = data || {};
  const connection = activeConnections.get(clientId);
  const authorization = connection?.authorization || '';

  if (!sessionId || !answerText) {
    return sendError(ws, 'VALIDATION_ERROR', 'sessionId and answerText are required');
  }

  try {
    // Notify client that processing has begun
    sendEvent(ws, WS_EVENTS.ANSWER_PROCESSING, { status: 'evaluating' });

    // Web does not wait for TTS, so a partial question provides no latency
    // benefit and would render the same prompt twice. Preserve the existing
    // mobile partial/TTS behaviour while sending one clean streamed turn to
    // the browser.
    const sendPartialQuestion = connection?.clientChannel === 'web'
      ? undefined
      : (partial) => {
        if (partial.nextQuestion) {
          sendEvent(ws, WS_EVENTS.QUESTION_NEW, partial.nextQuestion);
        }
      };

    const result = await interviewService.processAnswer(
      sessionId, 
      answerText, 
      null,
      sendPartialQuestion,
      false, // [AUDIO-ONLY RULE] Do not persist WebSocket text to DB. High-fidelity REST upload will handle persistence.
      authorization,
      { generateAudio: connection?.clientChannel !== 'web' },
    );

    // Update turn state
    const conn = activeConnections.get(clientId);
    if (conn) conn.turn = 'ai';

    // Send evaluation result
    sendEvent(ws, WS_EVENTS.ANSWER_EVALUATED, {
      questionNumber: result.questionNumber,
      scores: {
        clarity: result.evaluation.clarity,
        confidence: result.evaluation.confidence,
        technical: result.evaluation.technical,
        communication: result.evaluation.communication,
      },
      feedback: result.evaluation.feedback,
    });

    if (result.isComplete) {
      // Interview complete — generate report
      await handleInterviewComplete(clientId, ws, sessionId);
    } else {
      // Send next question instantly
      sendEvent(ws, WS_EVENTS.QUESTION_NEW, result.nextQuestion);
    }
  } catch (err) {
    // Reset turn on error
    const conn = activeConnections.get(clientId);
    if (conn) conn.turn = 'user';
    
    logger.error({ err: err.message, clientId }, 'Answer processing failed');
    sendError(ws, 'ANSWER_PROCESS_FAILED', err.message);
  }
}

/**
 * Handle raw audio answer (fallback when client STT is unavailable)
 */
async function handleAnswerAudio(clientId, ws, data) {
  const { sessionId, audioBase64 } = data || {};
  const connection = activeConnections.get(clientId);
  const authorization = connection?.authorization || '';

  if (!sessionId || !audioBase64) {
    return sendError(ws, 'VALIDATION_ERROR', 'sessionId and audioBase64 are required');
  }

  try {
    sendEvent(ws, WS_EVENTS.ANSWER_PROCESSING, { status: 'transcribing' });

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const sendPartialQuestion = connection?.clientChannel === 'web'
      ? undefined
      : (partial) => {
        if (partial.nextQuestion) {
          sendEvent(ws, WS_EVENTS.QUESTION_NEW, partial.nextQuestion);
        }
      };
    const result = await interviewService.processAnswer(
      sessionId, 
      null, 
      audioBuffer,
      sendPartialQuestion,
      false, // [AUDIO-ONLY RULE] Do not persist WS audio fallbacks to DB. Use high-fidelity REST upload path instead.
      authorization,
      { generateAudio: connection?.clientChannel !== 'web' },
    );

    sendEvent(ws, WS_EVENTS.ANSWER_PROCESSING, { status: 'evaluated' });
    sendEvent(ws, WS_EVENTS.ANSWER_EVALUATED, {
      questionNumber: result.questionNumber,
      scores: {
        clarity: result.evaluation.clarity,
        confidence: result.evaluation.confidence,
        technical: result.evaluation.technical,
        communication: result.evaluation.communication,
      },
      feedback: result.evaluation.feedback,
    });

    if (result.isComplete) {
      await handleInterviewComplete(clientId, ws, sessionId);
    } else {
      sendEvent(ws, WS_EVENTS.QUESTION_NEW, result.nextQuestion);
    }
  } catch (err) {
    logger.error({ err: err.message, clientId }, 'Audio answer processing failed');
    sendError(ws, 'ANSWER_PROCESS_FAILED', err.message);
  }
}

/**
 * Handle silence detection — client signals user stopped speaking
 */
async function handleSilenceDetected(clientId, ws, data) {
  // This event is informational — actual answer submission comes via ANSWER_TEXT
  logger.debug({ clientId, sessionId: data?.sessionId }, 'Silence detected signal received');
}

/**
 * Handle interview completion
 */
async function handleInterviewComplete(clientId, ws, sessionId) {
  try {
    sendEvent(ws, WS_EVENTS.ANSWER_PROCESSING, { status: 'generating_report' });

    const connection = activeConnections.get(clientId);
    const authorization = connection?.authorization || '';
    const report = await interviewService.completeInterview(sessionId, authorization, {
      fastReport: connection?.clientChannel === 'web',
    });

    sendEvent(ws, WS_EVENTS.SESSION_COMPLETE, {
      sessionId,
      overallScore: report.overallScore,
      avgClarity: report.avgClarity,
      avgConfidence: report.avgConfidence,
      avgTechnical: report.avgTechnical,
      avgCommunication: report.avgCommunication,
      answeredQuestions: report.answeredQuestions,
      totalQuestions: report.totalQuestions,
      duration: report.duration,
      report: report.report,
      history: report.history,
    });

    logger.info({ clientId, sessionId }, 'Interview completed');
  } catch (err) {
    logger.error({ err: err.message, clientId }, 'Interview completion failed');
    sendError(ws, 'COMPLETION_FAILED', err.message);
  }
}

/**
 * Handle session end request (user quits early)
 */
async function handleSessionEnd(clientId, ws, data) {
  const { sessionId } = data || {};
  if (!sessionId) return;

  try {
    const connection = activeConnections.get(clientId);
    const authorization = connection?.authorization || '';
    const report = await interviewService.completeInterview(sessionId, authorization, {
      fastReport: connection?.clientChannel === 'web',
    });

    sendEvent(ws, WS_EVENTS.SESSION_COMPLETE, {
      sessionId,
      overallScore: report.overallScore,
      avgClarity: report.avgClarity,
      avgConfidence: report.avgConfidence,
      avgTechnical: report.avgTechnical,
      avgCommunication: report.avgCommunication,
      answeredQuestions: report.answeredQuestions,
      totalQuestions: report.totalQuestions,
      duration: report.duration,
      report: report.report,
      history: report.history,
      wasEarlyExit: true,
    });

    logger.info({ clientId, sessionId }, 'Interview ended early by user');
  } catch (err) {
    logger.error({ err: err.message, clientId }, 'Session end failed');
    sendError(ws, 'SESSION_END_FAILED', err.message);
  }
}

/**
 * Send a structured event to client
 */
function sendEvent(ws, event, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ event, data, timestamp: Date.now() }));
  }
}

/**
 * Send an error event to client
 */
function sendError(ws, code, message) {
  sendEvent(ws, WS_EVENTS.ERROR, { code, message });
}

/**
 * Broadcast event to all clients linked to a sessionId
 * This bridges the REST upload path back to the real-time UI
 */
function broadcastToSession(sessionId, event, data) {
  for (const [clientId, conn] of activeConnections.entries()) {
    if (conn.sessionId === sessionId) {
      sendEvent(conn.ws, event, data);
    }
  }
}

module.exports = { 
  initWebSocket,
  broadcastToSession
};
