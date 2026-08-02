/**
 * Interview Service
 * Core business logic for interview flow orchestration
 */
const sessionManager = require('../../core/session');
const openaiService = require('../ai/openai.service');
const { runBillableAiOperation } = require('../../core/credit-billing.service');
const sttService = require('../stt/stt.service');
const ttsService = require('../tts/tts.service');
const logger = require('../../core/logger');
const axios = require('axios');
const env = require('../../config/env');
const { DEPARTMENTS, JOB_ROLES } = require('./interview.data');
const { AppError, SessionError } = require('../../core/errors');

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function getIndianTimeGreeting() {
  let hour = new Date().getHours();

  try {
    const hourPart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date()).find((part) => part.type === 'hour');
    hour = Number(hourPart?.value ?? hour);
  } catch (_) {
    // A standard server clock is a safe fallback if Intl timezone data is absent.
  }

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function applyCandidateGreeting(questionText, interviewContext = {}) {
  const firstName = String(interviewContext?.candidateName || "")
    .trim()
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z.'-]/g, "")
    .slice(0, 60);
  const question = String(questionText || "").trim();

  if (!firstName || !question) return question;

  // The service owns the greeting rather than trusting a model to consistently
  // use the learner's name. Strip an AI-provided salutation first so it never
  // reads as "Hello Sakthi, Good morning Sakthi".
  const escapedName = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const questionWithoutGreeting = question.replace(
    new RegExp(
      `^(?:(?:hello|hi|good\\s+(?:morning|afternoon|evening))\\s*,?\\s*(?:${escapedName})?\\s*[,.!\\-–—]*\\s*)`,
      'i',
    ),
    '',
  ).trim();

  return `${getIndianTimeGreeting()}, ${firstName}. ${questionWithoutGreeting || question}`;
}

function summarizeAxiosError(err) {
  const status = err?.response?.status;
  const statusText = err?.response?.statusText;
  const allow = err?.response?.headers?.allow;
  const location = err?.response?.headers?.location;
  const dataMessage = err?.response?.data?.message;
  const message = dataMessage || err?.message;

  return {
    status,
    statusText,
    allow,
    location,
    message,
  };
}

function phpPersistenceError(err, fallbackMessage) {
  const status = Number(err?.response?.status || 0);
  const message = err?.response?.data?.message || fallbackMessage;
  // The PHP service is an upstream dependency. Keep authentication/payment
  // statuses intact, but represent upstream server/network failures as a 502.
  const clientStatus = status >= 400 && status < 500 ? status : 502;
  return new AppError(message, clientStatus, 'INTERVIEW_PERSISTENCE_ERROR');
}

function phpReadError(err, fallbackMessage) {
  const status = Number(err?.response?.status || 0);
  const message = err?.response?.data?.message || fallbackMessage;
  return new AppError(
    message,
    status >= 400 && status < 500 ? status : 502,
    'INTERVIEW_REPORT_ERROR',
  );
}

async function axiosRequestPreserveMethodOnRedirect(config, maxRedirects = 3) {
  const requestConfig = { ...config, maxRedirects: 0 };
  try {
    return await axios(requestConfig);
  } catch (err) {
    const status = err?.response?.status;
    const location = err?.response?.headers?.location;
    if (status && REDIRECT_STATUSES.has(status) && location && maxRedirects > 0) {
      const nextUrl = new URL(location, requestConfig.url).toString();
      return axiosRequestPreserveMethodOnRedirect({ ...requestConfig, url: nextUrl }, maxRedirects - 1);
    }
    throw err;
  }
}

class InterviewService {
  /**
   * Get all departments from local data
   */
  async getDepartments() {
    return DEPARTMENTS;
  }

  /**
   * Get roles for a department from local data
   */
  async getRolesByDepartment(departmentId) {
    const roles = JOB_ROLES.filter(r => r.department_id === parseInt(departmentId, 10));
    const department = DEPARTMENTS.find(d => d.id === parseInt(departmentId, 10));
    
    return {
      department,
      roles
    };
  }

  /**
   * Get role detail from local data
   */
  async getRoleDetail(roleId) {
    const role = JOB_ROLES.find(r => r.id === parseInt(roleId, 10));
    if (!role) throw new Error('Role not found');
    
    const department = DEPARTMENTS.find(d => d.id === role.department_id);
    return {
      ...role,
      department_name: department?.name,
      department_slug: department?.slug,
      color_hex: department?.color_hex
    };
  }
  /**
   * Start a new interview session
   */
  async startSession(userId, jobRoleId, jobRoleTitle, difficulty, maxQuestions, sessionType = 'interview', interviewContext = {}, authorization = '', options = {}) {
    const session = await sessionManager.createSession(
      userId,
      jobRoleId,
      jobRoleTitle,
      difficulty,
      maxQuestions,
      sessionType,
      interviewContext
    );

    // Persist the session first. AI credits are settled from actual provider usage
    // after each successful model response, never as a fixed interview pre-charge.
    try {
      await this.persistInterviewStart(userId, jobRoleId, session.sessionId, maxQuestions, authorization);
    } catch (err) {
      await sessionManager.deleteSession(session.sessionId);
      throw err;
    }

    // Generate first question. If the provider or credit settlement fails after
    // the durable row is created, close that row instead of leaving a phantom
    // in-progress interview in history.
    let billedQuestion;
    try {
      billedQuestion = await runBillableAiOperation({
        authorization,
        serviceKey: 'mock_interview',
        reference: session.sessionId,
        operation: () => openaiService.generateFirstQuestion(
          jobRoleTitle,
          difficulty,
          sessionType,
          interviewContext,
        ),
      });
    } catch (err) {
      await this.persistInterviewAbandoned(session.sessionId, authorization).catch(() => undefined);
      await sessionManager.deleteSession(session.sessionId);
      throw err;
    }
    const questionText = applyCandidateGreeting(
      billedQuestion.data,
      interviewContext,
    );

    if (typeof questionText !== 'string' || !questionText.trim()) {
      await this.persistInterviewAbandoned(session.sessionId, authorization).catch(() => undefined);
      await sessionManager.deleteSession(session.sessionId);
      const error = new Error('The AI interviewer did not return an opening question. Please try again.');
      error.statusCode = 502;
      error.isOperational = true;
      throw error;
    }

    // The mobile socket keeps its audio URL. Web clients use browser speech
    // playback and receive the question immediately instead of waiting on TTS.
    let audioUrl = '';
    if (options.generateAudio !== false) {
      try {
        audioUrl = await ttsService.generateSpeechUrl(questionText);
      } catch (err) {
        logger.warn('TTS for first question failed, client will use on-device TTS');
      }
    }

    // Update session state
    await sessionManager.updateSession(session.sessionId, {
      state: 'asking',
      currentQuestionText: questionText,
    });

    return {
      sessionId: session.sessionId,
      questionNumber: 1,
      totalQuestions: session.maxQuestions,
      questionText,
      audioUrl,
    };
  }

  /**
   * Process a candidate's answer (text or audio)
   * @param {boolean} shouldPersist - If true, the result is saved to the permanent PHP database
   */
  async processAnswer(sessionId, answerText, audioBuffer, onPartialResult, shouldPersist = true, authorization = '', options = {}) {
    const lockToken = await sessionManager.acquireSessionLock(sessionId);
    if (!lockToken) {
      throw new AppError(
        'This answer is already being processed. Please wait for the next question.',
        409,
        'ANSWER_ALREADY_PROCESSING',
      );
    }

    try {
      return await this.processAnswerUnlocked(
        sessionId,
        answerText,
        audioBuffer,
        onPartialResult,
        shouldPersist,
        authorization,
        options,
      );
    } finally {
      await sessionManager.releaseSessionLock(sessionId, lockToken);
    }
  }

  async processAnswerUnlocked(sessionId, answerText, audioBuffer, onPartialResult, shouldPersist = true, authorization = '', options = {}) {
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      throw new SessionError('Session not found or expired');
    }
    if (session.state === 'completed' || session.state === 'finalizing') {
      throw new AppError('This interview is already being finalized.', 409, 'INTERVIEW_FINALIZING');
    }

    // TRANSCRIPTION PRIORITY:
    // 1. Recorded audio is transcribed by AssemblyAI.
    // 2. The client live transcript is used only if provider transcription fails.
    let transcript = '';
    
    if (audioBuffer) {
      // PRIMARY: Use AssemblyAI for accurate speech-to-text
      logger.info({ sessionId }, 'Transcribing audio via AssemblyAI...');
      try {
        transcript = await sttService.transcribeAudio(
          audioBuffer,
          options.audioContentType || 'audio/webm',
        );
      } catch (transcriptionError) {
        // A browser/mobile live transcript is a valid continuity fallback, but
        // never replace missing server STT with invented or placeholder text.
        if (!String(answerText || '').trim()) throw transcriptionError;
        logger.warn(
          { sessionId, error: transcriptionError.message },
          'Server transcription failed, using the client live transcript',
        );
      }
      
      // If AssemblyAI returned empty/failed, fall back to client-side text
      if (!transcript || transcript.trim().length < 3) {
        logger.warn({ sessionId }, 'AssemblyAI returned empty, using fallback text');
        transcript = answerText || '';
      }
    } else {
      // FALLBACK: No audio provided, use client-side text
      transcript = answerText || '';
    }
    
    transcript = sttService.passthrough(transcript);

    if (!transcript || transcript.trim().length < 3) {
      throw new AppError(
        audioBuffer
          ? 'No clear speech was detected in the recording. Check the selected microphone and record the answer again.'
          : 'Record an answer before continuing.',
        422,
        'ANSWER_NOT_CAPTURED',
      );
    }

    logger.debug(
      { sessionId, questionNum: session.currentQuestion + 1, transcript: transcript.substring(0, 80) },
      'Processing answer'
    );

    // -------------------------------------------------------------
    // FAST TRACK: Generate Next Question & TTS first (Speed priority)
    // -------------------------------------------------------------
    const tempAnswerSummary = transcript.length > 300 ? transcript.substring(0, 300) + '...' : transcript;
    const isCompletedAfterThis = (session.currentQuestion + 1) >= session.maxQuestions;

    const billedTurn = await runBillableAiOperation({
      authorization,
      serviceKey: 'mock_interview',
      reference: sessionId,
      operation: async () => {
        const evaluationPromise = openaiService.evaluateAnswer(
          session.jobRoleTitle,
          session.currentQuestionText,
          transcript,
          session.difficulty,
          session.sessionType,
          session.interviewContext,
        );
        const nextQuestionPromise = isCompletedAfterThis
          ? Promise.resolve(null)
          : openaiService.generateNextQuestion(
            session.jobRoleTitle,
            session.difficulty,
            [...session.history, { question: session.currentQuestionText, answerSummary: tempAnswerSummary }],
            sessionManager.getSessionSummary(session).overallScore,
            session.sessionType,
            session.interviewContext,
          );
        const [evaluation, nextQuestion] = await Promise.all([evaluationPromise, nextQuestionPromise]);
        return { evaluation, nextQuestion };
      },
    });
    const { evaluation, nextQuestion } = billedTurn.data;

    // [SPEED UP] Emit partial result with next question text immediately if callback provided
    if (nextQuestion && onPartialResult) {
      onPartialResult({
        isComplete: false,
        nextQuestion: {
          questionNumber: session.currentQuestion + 1,
          totalQuestions: session.maxQuestions,
          questionText: nextQuestion,
          audioUrl: '', // Audio not ready yet
        }
      });
    }

    // Generate TTS if not completed
    let audioUrl = '';
    if (nextQuestion && options.generateAudio !== false) {
      try {
        audioUrl = await ttsService.generateSpeechUrl(nextQuestion);
      } catch (err) {
        logger.warn('TTS for next question failed');
      }
    }

    // Build question data for session history
    const questionData = {
      questionNumber: session.currentQuestion + 1,
      question: session.currentQuestionText,
      answerSummary: tempAnswerSummary,
      answerFull: transcript,
      clarity: evaluation.clarity,
      confidence: evaluation.confidence,
      technical: evaluation.technical,
      communication: evaluation.communication,
      feedback: evaluation.feedback,
    };

    // Persist before advancing the live session. A failed database write must be
    // visible to the caller and must never silently create a report with missing
    // answers. The PHP endpoint is idempotent for a session/question pair.
    if (shouldPersist) {
      await this.persistQuestion(sessionId, questionData, authorization);
    }

    // Advance the Redis session only after the durable answer write succeeds.
    const updatedSession = await sessionManager.addAnswerToSession(sessionId, questionData);
    if (!updatedSession) {
      throw new SessionError('Session expired while the answer was being saved.');
    }

    // Check if interview is complete
    if (isCompletedAfterThis) {
      return {
        isComplete: true,
        evaluation,
        questionNumber: updatedSession.currentQuestion,
        transcript,
      };
    }

    // Update session with new question
    await sessionManager.updateSession(sessionId, {
      state: 'asking',
      currentQuestionText: nextQuestion,
    });

    return {
      isComplete: false,
      evaluation,
      questionNumber: updatedSession.currentQuestion,
      transcript,
      nextQuestion: {
        questionNumber: updatedSession.currentQuestion + 1,
        totalQuestions: updatedSession.maxQuestions,
        questionText: nextQuestion,
        audioUrl,
      },
    };
  }

  /**
   * Complete the interview and generate final report
   */
  async completeInterview(sessionId, authorization = '', options = {}) {
    const lockToken = await sessionManager.acquireSessionLock(sessionId);
    if (!lockToken) {
      throw new AppError(
        'The current answer is still being processed. Please wait before ending the interview.',
        409,
        'INTERVIEW_BUSY',
      );
    }

    try {
      return await this.completeInterviewUnlocked(sessionId, authorization, options);
    } finally {
      await sessionManager.releaseSessionLock(sessionId, lockToken);
    }
  }

  async completeInterviewUnlocked(sessionId, authorization = '', options = {}) {
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      throw new SessionError('Session not found or expired');
    }
    if (session.state === 'completed' && session.completionResult) {
      return {
        ...session.completionResult.summary,
        report: session.completionResult.report,
      };
    }

    // Cache the generated report in Redis before persistence. If the PHP write
    // fails or times out, a retry reuses this exact report and does not bill the
    // learner for a second final-report generation.
    let completion = session.pendingCompletion || session.completionResult || null;
    if (!completion) {
      const summary = sessionManager.getSessionSummary(session);
      const billedReport = await runBillableAiOperation({
        authorization,
        serviceKey: 'mock_interview',
        reference: sessionId,
        operation: () => openaiService.generateFinalReport(
          session.jobRoleTitle,
          summary,
          session.sessionType,
          { fast: options.fastReport === true },
        ),
      });
      completion = { summary, report: billedReport.data };
      await sessionManager.updateSession(sessionId, {
        state: 'finalizing',
        pendingCompletion: completion,
      });
    }

    await this.persistInterviewComplete(
      sessionId,
      completion.summary,
      completion.report,
      authorization,
    );

    // Retain a short-lived completed record so duplicate mobile/web end events
    // return the same result instead of becoming a misleading session error.
    await sessionManager.updateSession(sessionId, {
      state: 'completed',
      pendingCompletion: null,
      completionResult: completion,
    });
    await sessionManager.expireSession(sessionId, 600);

    return {
      ...completion.summary,
      report: completion.report,
    };
  }

  /**
   * Persist interview start to PHP API
   */
  async persistInterviewStart(userId, jobRoleId, sessionId, maxQuestions, authorization = '') {
    try {
      const resp = await axiosRequestPreserveMethodOnRedirect({
        method: 'post',
        url: `${env.STC_API_BASE_URL}/v1/mock/interviews`,
        headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
        timeout: 8000,
        data: {
        user_id: userId,
        job_role_id: jobRoleId,
        session_id: sessionId,
        total_questions: maxQuestions,
        status: 'in_progress',
        },
      });
      const createdId = resp?.data?.data?.id;
      logger.debug({ sessionId, createdId }, 'PHP API: interview created');
      return createdId || null;
    } catch (err) {
      logger.error({ err: summarizeAxiosError(err), sessionId }, 'PHP API: persistInterviewStart failed');
      throw phpPersistenceError(err, 'The interview session could not be created. Please try again.');
    }
  }

  async persistInterviewAbandoned(sessionId, authorization = '') {
    try {
      await axiosRequestPreserveMethodOnRedirect({
        method: 'put',
        url: `${env.STC_API_BASE_URL}/v1/mock/interviews/${sessionId}`,
        headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
        timeout: 10000,
        data: { status: 'abandoned' },
      });
    } catch (err) {
      logger.error({ err: summarizeAxiosError(err), sessionId }, 'PHP API: abandon interview failed');
      throw phpPersistenceError(err, 'The failed interview session could not be closed.');
    }
  }

  /**
   * Persist individual question to PHP API
   */
  async persistQuestion(sessionId, questionData, authorization = '') {
    try {
      const payload = {
        session_id: sessionId,
        question_number: questionData.questionNumber,
        question_text: questionData.question,
        answer_transcript: questionData.answerFull,
        clarity_score: Number(questionData.clarity || 0).toFixed(1),
        confidence_score: Number(questionData.confidence || 0).toFixed(1),
        technical_score: Number(questionData.technical || 0).toFixed(1),
        communication_score: Number(questionData.communication || 0).toFixed(1),
        ai_feedback: questionData.feedback,
      };

      await axiosRequestPreserveMethodOnRedirect({
        method: 'post',
        url: `${env.STC_API_BASE_URL}/v1/mock/interviews/${sessionId}/questions`,
        headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
        timeout: 10000,
        data: payload,
      });
      logger.debug({ sessionId, qNum: questionData.questionNumber }, 'Synced question to PHP API');
    } catch (err) {
      logger.error({ err: summarizeAxiosError(err), sessionId }, 'PHP API: persistQuestion failed');
      throw phpPersistenceError(err, 'The interview answer could not be saved. Please try again.');
    }
  }

  /**
   * Persist interview completion to PHP API
   */
  async persistInterviewComplete(sessionId, summary, report, authorization = '') {
    try {
      const payload = {
        session_id: sessionId,
        status: 'completed',
        answered_questions: summary.answeredQuestions,
        overall_score: summary.overallScore,
        clarity_avg: summary.avgClarity,
        confidence_avg: summary.avgConfidence,
        technical_avg: summary.avgTechnical,
        communication_avg: summary.avgCommunication,
        strengths: JSON.stringify(report.strengths || []),
        weaknesses: JSON.stringify(report.weaknesses || []),
        suggestions: JSON.stringify(report.suggestions || []),
        behavioural_observations: JSON.stringify(report.behaviouralObservations || []),
        summary_verdict: report.summaryVerdict || report.overallFeedback || '',
        duration_seconds: summary.duration,
      };

      await axiosRequestPreserveMethodOnRedirect({
        method: 'put',
        url: `${env.STC_API_BASE_URL}/v1/mock/interviews/${sessionId}`,
        headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
        timeout: 10000,
        data: payload,
      });
      logger.info({ sessionId }, 'Synced interview completion to PHP API');
    } catch (err) {
      logger.error({ err: summarizeAxiosError(err), sessionId }, 'PHP API: persistInterviewComplete failed');
      throw phpPersistenceError(err, 'The interview report could not be saved. Please try again.');
    }
  }

  /**
   * Get report from PHP
   */
  async getReport(sessionId, token) {
    try {
      const resp = await axios.get(`${env.STC_API_BASE_URL}/v1/mock/interviews/${sessionId}/report`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return resp.data.data;
    } catch (err) {
      logger.error({ err: summarizeAxiosError(err), sessionId }, 'PHP API: getReport failed');
      throw phpReadError(err, 'The interview report could not be loaded.');
    }
  }

  /**
   * Get interview history from PHP
   */
  async getHistory(userId, page, limit, token) {
    try {
      const resp = await axios.get(`${env.STC_API_BASE_URL}/v1/mock/history`, {
        params: { user_id: userId, page, limit },
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return resp.data.data;
    } catch (err) {
      logger.error({ err: summarizeAxiosError(err), userId }, 'PHP API: getHistory failed');
      throw phpReadError(err, 'Interview history could not be loaded.');
    }
  }
}

module.exports = new InterviewService();
