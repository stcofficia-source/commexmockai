/**
 * Interview Service
 * Core business logic for interview flow orchestration
 */
const sessionManager = require('../../core/session');
const openaiService = require('../ai/openai.service');
const sttService = require('../stt/stt.service');
const ttsService = require('../tts/tts.service');
const logger = require('../../core/logger');
const axios = require('axios');
const env = require('../../config/env');
const { DEPARTMENTS, JOB_ROLES } = require('./interview.data');

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
  async startSession(userId, jobRoleId, jobRoleTitle, difficulty, maxQuestions) {
    const session = await sessionManager.createSession(
      userId,
      jobRoleId,
      jobRoleTitle,
      difficulty,
      maxQuestions
    );

    // Generate first question
    const questionText = await openaiService.generateFirstQuestion(jobRoleTitle, difficulty);

    // Generate TTS URL (optional — client can use on-device TTS)
    let audioUrl = '';
    try {
      audioUrl = await ttsService.generateSpeechUrl(questionText);
    } catch (err) {
      logger.warn('TTS for first question failed, client will use on-device TTS');
    }

    // Update session state
    await sessionManager.updateSession(session.sessionId, {
      state: 'asking',
      currentQuestionText: questionText,
    });

    // Persist interview start to PHP API
    this.persistInterviewStart(userId, jobRoleId, session.sessionId, maxQuestions).catch((err) =>
      logger.error({ err: err.message }, 'Failed to persist interview start')
    );

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
  async processAnswer(sessionId, answerText, audioBuffer, onPartialResult, shouldPersist = true) {
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found or expired');
    }

    // TRANSCRIPTION PRIORITY:
    // 1. If audio exists → AssemblyAI transcription is the ONLY authority
    // 2. answerText (from expo-speech-recognition) is ONLY a fallback if AssemblyAI fails
    let transcript = '';
    
    if (audioBuffer) {
      // PRIMARY: Use AssemblyAI for accurate speech-to-text
      logger.info({ sessionId }, 'Transcribing audio via AssemblyAI...');
      transcript = await sttService.transcribeAudio(audioBuffer);
      
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
      transcript = '(No answer provided)';
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

    // Trigger Evaluation in BACKGROUND (Don't wait for it to block the response)
    const evaluationPromise = openaiService.evaluateAnswer(
      session.jobRoleTitle,
      session.currentQuestionText,
      transcript,
      session.difficulty
    );

    // Generate NEXT QUESTION immediately using faster mini model
    const nextQuestion = isCompletedAfterThis 
      ? null 
      : await openaiService.generateNextQuestion(
          session.jobRoleTitle,
          session.difficulty,
          [...session.history, { question: session.currentQuestionText, answerSummary: tempAnswerSummary }],
          sessionManager.getSessionSummary(session).overallScore
        );

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
    if (nextQuestion) {
      try {
        audioUrl = await ttsService.generateSpeechUrl(nextQuestion);
      } catch (err) {
        logger.warn('TTS for next question failed');
      }
    }

    // Now WAIT for evaluation to finalize the data slice (usually ready by now or soon)
    const evaluation = await evaluationPromise;

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

    // Add to session history
    const updatedSession = await sessionManager.addAnswerToSession(sessionId, questionData);

    // Persist question to PHP API (Only if shouldPersist is true — usually REST path)
    if (shouldPersist) {
      this.persistQuestion(sessionId, questionData).catch((err) =>
        logger.error({ err: err.message }, 'Failed to persist question')
      );
    }

    // Check if interview is complete
    if (isCompletedAfterThis) {
      return {
        isComplete: true,
        evaluation,
        questionNumber: updatedSession.currentQuestion,
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
  async completeInterview(sessionId) {
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found or expired');
    }

    const summary = sessionManager.getSessionSummary(session);

    // Generate AI-powered final report
    const report = await openaiService.generateFinalReport(session.jobRoleTitle, summary);

    // Persist final results to PHP API
    this.persistInterviewComplete(sessionId, summary, report).catch((err) =>
      logger.error({ err: err.message }, 'Failed to persist interview completion')
    );

    // Clean up session
    await sessionManager.deleteSession(sessionId);

    return {
      ...summary,
      report,
    };
  }

  /**
   * Persist interview start to PHP API
   */
  async persistInterviewStart(userId, jobRoleId, sessionId, maxQuestions) {
    try {
      await axios.post(`${env.STC_API_BASE_URL}/v1/mock/interviews`, {
        user_id: userId,
        job_role_id: jobRoleId,
        session_id: sessionId,
        total_questions: maxQuestions,
        status: 'in_progress',
      });
    } catch (err) {
      logger.error({ err: err.message }, 'PHP API: persistInterviewStart failed');
    }
  }

  /**
   * Persist individual question to PHP API
   */
  async persistQuestion(sessionId, questionData) {
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

      await axios.post(`${env.STC_API_BASE_URL}/v1/mock/interviews/${sessionId}/questions`, payload);
      logger.debug({ sessionId, qNum: questionData.questionNumber }, 'Synced question to PHP API');
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      logger.error({ err: errorMsg, sessionId }, 'PHP API: persistQuestion failed');
    }
  }

  /**
   * Persist interview completion to PHP API
   */
  async persistInterviewComplete(sessionId, summary, report) {
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

      await axios.put(`${env.STC_API_BASE_URL}/v1/mock/interviews/${sessionId}`, payload);
      logger.info({ sessionId }, 'Synced interview completion to PHP API');
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      logger.error({ err: errorMsg, sessionId }, 'PHP API: persistInterviewComplete failed');
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
      const phpError = err.response?.data?.message || err.message;
      logger.error({ err: phpError, sessionId }, 'PHP API: getReport failed');
      throw new Error(phpError);
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
      const phpError = err.response?.data?.message || err.message;
      logger.error({ err: phpError, userId }, 'PHP API: getHistory failed');
      throw new Error(phpError);
    }
  }
}

module.exports = new InterviewService();
