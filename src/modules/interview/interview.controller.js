/**
 * Interview Controller
 * Handles HTTP requests for interview meta data
 */
const interviewService = require("./interview.service");
const axios = require("axios");
const env = require("../../config/env");
const multer = require("multer");
const logger = require("../../core/logger");
const sessionManager = require("../../core/session");
const { JOB_ROLES } = require("./interview.data");

// Configure multer for memory storage (high-speed processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).single("audioFile");

const getAssemblyToken = async (req, res, next) => {
  try {
    const response = await axios.get(
      "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600",
      {
        headers: { authorization: env.ASSEMBLYAI_API_KEY },
      },
    );
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
    const token = req.headers.authorization?.split(" ")[1];
    const data = await interviewService.getReport(req.params.sessionId, token);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getHistory = async (req, res, next) => {
  try {
    // SECURITY: Use the user ID from the verified token, NOT from query params
    const userId = req.user.id;
    const token = req.headers.authorization?.split(" ")[1];
    const { page, limit } = req.query;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User ID missing from session" });
    }

    const data = await interviewService.getHistory(userId, page, limit, token);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

function currentUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.userId || null;
}

function normalizeType(type) {
  if (type === "resume") return "resume_upload";
  if (type === "technical") return "technical";
  if (type === "role-based") return "role_based";
  return "general";
}

function normalizeDuration(value) {
  const duration = Number(value);
  return [30, 45, 60].includes(duration) ? duration : 30;
}

function questionsForDuration(duration) {
  if (duration >= 60) return 20;
  if (duration >= 45) return 15;
  return 10;
}

function formatReport(session, result, requestBody) {
  const report = result.report || {};
  const toPercent = (value) =>
    Math.round(Math.max(0, Math.min(10, Number(value) || 0)) * 10);
  return {
    sessionId: result.sessionId || session?.sessionId,
    type: requestBody.type || "general",
    difficulty: requestBody.difficulty || "medium",
    duration: normalizeDuration(requestBody.duration),
    questionsAttempted: result.answeredQuestions || 0,
    overallScore: toPercent(result.overallScore),
    skills: [
      { label: "Communication", score: toPercent(result.avgCommunication) },
      { label: "Problem Solving", score: toPercent(result.avgTechnical) },
      { label: "Confidence", score: toPercent(result.avgConfidence) },
      { label: "Clarity", score: toPercent(result.avgClarity) },
    ],
    strengths: Array.isArray(report.strengths) ? report.strengths : [],
    improvements: Array.isArray(report.suggestions)
      ? report.suggestions
      : Array.isArray(report.weaknesses)
        ? report.weaknesses
        : [],
    detailedReport: report,
  };
}

/**
 * HTTP bridge for the Next.js web client. The mobile app continues to use the
 * WebSocket gateway; both paths share the same Redis session and GPT service.
 */
const handleInterviewSession = async (req, res, next) => {
  try {
    const action = req.body?.action || "create";
    const userId = currentUserId(req);
    if (!userId)
      return res
        .status(401)
        .json({
          success: false,
          message: "User ID is missing from the verified session.",
        });

    if (action === "create") {
      const roleTitle = String(req.body?.role || "Business Analyst").slice(
        0,
        120,
      );
      const matchingRole = JOB_ROLES.find(
        (role) => role.title?.toLowerCase() === roleTitle.toLowerCase(),
      );
      const duration = normalizeDuration(req.body?.duration);
      const maxQuestions = Math.max(
        3,
        Math.min(
          20,
          Number(req.body?.maxQuestions) || questionsForDuration(duration),
        ),
      );
      const result = await interviewService.startSession(
        userId,
        matchingRole?.id || 1,
        matchingRole?.title || roleTitle,
        req.body?.difficulty || "medium",
        maxQuestions,
        normalizeType(req.body?.type),
      );
      return res.json({
        success: true,
        data: {
          sessionId: result.sessionId,
          type: req.body?.type || "general",
          role: matchingRole?.title || roleTitle,
          difficulty: req.body?.difficulty || "medium",
          duration,
          totalQuestions: result.totalQuestions,
          questions: [result.questionText],
        },
      });
    }

    const sessionId = req.body?.sessionId;
    const session = await sessionManager.getSession(sessionId);
    if (!session)
      return res
        .status(404)
        .json({
          success: false,
          message: "Interview session has expired. Start a new interview.",
        });
    if (String(session.userId) !== String(userId))
      return res
        .status(403)
        .json({
          success: false,
          message: "This interview belongs to another student.",
        });

    if (action === "answer") {
      const result = await interviewService.processAnswer(
        sessionId,
        String(req.body?.answerText || "").trim(),
        null,
        null,
        true,
      );
      return res.json({ success: true, data: result });
    }

    if (action === "complete") {
      if (req.body?.malpracticeDetected) {
        logger.warn(
          {
            sessionId,
            userId,
            reason: String(req.body?.reason || "malpractice"),
          },
          "Secure interview ended after a client-side malpractice detection",
        );
      }
      const result = await interviewService.completeInterview(sessionId);
      return res.json({
        success: true,
        data: formatReport(session, result, req.body),
      });
    }

    return res
      .status(400)
      .json({ success: false, message: "Unsupported interview action." });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle high-fidelity M4A upload from mobile (Advanced Async Path)
 * Bypasses WebSocket payload limits. Returns instant ACK to client.
 */
const uploadAnswerAudio = async (req, res, next) => {
  try {
    const { sessionId, fallbackText } = req.body;
    const audioBuffer = req.file ? req.file.buffer : null;

    // 1. SESSION VALIDATION: Check if session exists BEFORE ACK
    // This prevents "Analyzing" hangs if the server was restarted
    const sessionManager = require("../../core/session");
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      logger.warn(
        { sessionId },
        "❌ REST: Upload attempted for expired session",
      );
      return res
        .status(404)
        .json({ success: false, message: "Session not found or expired" });
    }

    logger.info(
      {
        sessionId,
        bufferSize: audioBuffer?.length || 0,
        mimetype: req.file?.mimetype,
      },
      "📥 REST: Audio upload received (Async Path)",
    );

    // 2. INSTANT ACK: Tell mobile we got the file
    res.json({ success: true, message: "Processing started" });

    // 2. BACKGROUND WORK: Process the answer without blocking the HTTP response
    setImmediate(async () => {
      try {
        // 2. Transcribe Audio (AssemblyAI)
        const result = await interviewService.processAnswer(
          sessionId,
          fallbackText,
          audioBuffer,
        );
        const gateway = require("./interview.gateway");

        // 3. PUSH EVALUATION & TEXT IMMEDIATELY (Don't wait for TTS)
        gateway.broadcastToSession(sessionId, "answer:evaluated", {
          questionNumber: result.questionNumber,
          scores: result.evaluation,
          feedback: result.evaluation.feedback,
        });

        if (result.isComplete) {
          const finalReport =
            await interviewService.completeInterview(sessionId);
          gateway.broadcastToSession(
            sessionId,
            "session:complete",
            finalReport,
          );
        } else if (result.nextQuestion) {
          // PUSH TEXT VERSION FIRST (Instant UI Update)
          gateway.broadcastToSession(sessionId, "question:new", {
            ...result.nextQuestion,
            audioUrl: "", // Audio is generating...
          });

          // 4. GENERATE TTS IN PARALLEL
          try {
            const ttsService = require("../tts/tts.service");
            const audioUrl = await ttsService.generateSpeechUrl(
              result.nextQuestion.questionText,
            );

            // PUSH AUDIO UPDATE (Seamless Playback)
            gateway.broadcastToSession(sessionId, "question:new", {
              ...result.nextQuestion,
              audioUrl: audioUrl,
            });
          } catch (ttsErr) {
            logger.warn(
              { err: ttsErr.message },
              "Background TTS generation failed",
            );
          }
        }
      } catch (bgErr) {
        logger.error(
          { err: bgErr.message, sessionId },
          "❌ Background processing failed",
        );
        const gateway = require("./interview.gateway");
        gateway.broadcastToSession(sessionId, "error", {
          message: bgErr.message,
          code: "SESSION_EXPIRED",
        });
      }
    });
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      logger.error({ err: err.message }, "Error after ACK sent");
    }
  }
};

module.exports = {
  getDepartments,
  getRolesByDepartment,
  getRoleDetail,
  getReport,
  getHistory,
  getAssemblyToken,
  uploadAnswerAudio,
  upload,
  handleInterviewSession,
};
