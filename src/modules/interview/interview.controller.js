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
const { DEPARTMENTS, JOB_ROLES } = require("./interview.data");
const openaiService = require("../ai/openai.service");

// Configure multer for memory storage (high-speed processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).single("audioFile");

const RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const RESUME_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const extension = String(file.originalname || "").split(".").pop().toLowerCase();
    if (!RESUME_EXTENSIONS.has(extension) || !RESUME_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("Upload a PDF, DOC, or DOCX resume up to 5 MB.");
      error.statusCode = 400;
      error.isOperational = true;
      return callback(error);
    }
    callback(null, true);
  },
}).single("file");

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
  return 10;
}

function questionsForDuration(duration) {
  return 10;
}

function safeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeList(value, maxItems = 20, maxLength = 80) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => safeText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalizeExperienceLevel(value) {
  return ["fresher", "mid", "senior"].includes(value) ? value : "mid";
}

function normalizedMatch(value) {
  return safeText(value, 140)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenOverlap(left, right) {
  const first = new Set(normalizedMatch(left).split(" ").filter((item) => item.length > 2));
  const second = normalizedMatch(right).split(" ").filter((item) => item.length > 2);
  return second.reduce((count, token) => count + (first.has(token) ? 1 : 0), 0);
}

function resolveResumeProfile(profile = {}) {
  const suggestedRole = safeText(profile.suggestedRole, 140);
  const suggestedDepartment = safeText(profile.suggestedDepartment, 140);
  const explicitRole = JOB_ROLES.find((role) => normalizedMatch(role.title) === normalizedMatch(suggestedRole));
  const probableRole = explicitRole || JOB_ROLES
    .map((role) => ({ role, score: tokenOverlap(role.title, suggestedRole) }))
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score)[0]?.role;
  const explicitDepartment = DEPARTMENTS
    .filter((department) => department.id <= 16)
    .find((department) => normalizedMatch(department.name) === normalizedMatch(suggestedDepartment) || normalizedMatch(department.slug) === normalizedMatch(suggestedDepartment));
  const department = probableRole
    ? DEPARTMENTS.find((item) => item.id === probableRole.department_id)
    : explicitDepartment;

  return {
    source: "ai_resume_analysis",
    suggestedRole: probableRole?.title || suggestedRole,
    suggestedRoleId: probableRole?.id || null,
    suggestedDepartment: department?.name || suggestedDepartment,
    suggestedDepartmentId: department?.id || null,
    suggestedDepartmentSlug: department?.slug || "",
    experienceLevel: normalizeExperienceLevel(profile.experienceLevel),
    education: safeList(profile.education, 8, 180),
    detectedSkills: safeList(profile.detectedSkills, 20, 80),
    summary: safeText(profile.summary, 500),
  };
}

const analyzeResume = (req, res, next) => {
  resumeUpload(req, res, async (uploadError) => {
    if (uploadError) return next(uploadError);
    try {
      if (!currentUserId(req)) {
        return res.status(401).json({ success: false, message: "Authentication is required to analyse a resume." });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Upload a PDF, DOC, or DOCX resume up to 5 MB." });
      }
      const profile = await openaiService.analyzeResume(req.file);
      return res.json({ success: true, data: resolveResumeProfile(profile) });
    } catch (error) {
      return next(error);
    }
  });
};

function resolveInterviewContext(body, sessionType) {
  const requestedDepartmentId = Number(body?.departmentId);
  const requestedRoleId = Number(body?.roleId);
  const needsCareerContext = ["technical", "role_based", "resume_upload"].includes(sessionType);
  let role = Number.isInteger(requestedRoleId)
    ? JOB_ROLES.find((item) => item.id === requestedRoleId)
    : null;

  if (!role) {
    const requestedTitle = safeText(body?.role);
    role = requestedTitle
      ? JOB_ROLES.find((item) => item.title.toLowerCase() === requestedTitle.toLowerCase())
      : null;
  }

  if (role && requestedDepartmentId && role.department_id !== requestedDepartmentId) {
    const error = new Error("The selected role does not belong to the selected department.");
    error.statusCode = 422;
    throw error;
  }

  const departmentId = role?.department_id || requestedDepartmentId || null;
  const department = departmentId
    ? DEPARTMENTS.find((item) => item.id === departmentId)
    : null;

  if (needsCareerContext && (!department || !role || department.id > 16)) {
    const error = new Error("Select a valid department and role before starting this interview.");
    error.statusCode = 422;
    throw error;
  }

  const fallbackRole = JOB_ROLES.find((item) => item.id === 1) || JOB_ROLES[0];
  return {
    jobRoleId: role?.id || fallbackRole?.id || 1,
    jobRoleTitle: role?.title || safeText(body?.role) || "General placement candidate",
    context: {
      departmentId: department?.id || null,
      departmentName: department?.name || safeText(body?.departmentName),
      roleId: role?.id || null,
      roleTitle: role?.title || safeText(body?.role) || "General placement candidate",
      experienceLevel: normalizeExperienceLevel(body?.experienceLevel),
      skills: safeList(body?.skills),
      education: safeList(body?.education, 8, 140),
      focus: safeList(body?.focus, 6, 80),
      resumeName: safeText(body?.resume?.name, 180),
    },
  };
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
      const sessionType = normalizeType(req.body?.type);
      const interview = resolveInterviewContext(req.body, sessionType);
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
        interview.jobRoleId,
        interview.jobRoleTitle,
        req.body?.difficulty || "medium",
        maxQuestions,
        sessionType,
        interview.context,
        req.headers.authorization || "",
      );
      return res.json({
        success: true,
        data: {
          sessionId: result.sessionId,
          type: req.body?.type || "general",
          role: interview.jobRoleTitle,
          context: interview.context,
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
  analyzeResume,
  uploadAnswerAudio,
  upload,
  handleInterviewSession,
};
