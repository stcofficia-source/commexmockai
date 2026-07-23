/**
 * Gemini AI Service
 * Handles question generation, answer evaluation, and final report
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../../config/env');
const logger = require('../../core/logger');
const { AIServiceError } = require('../../core/errors');

let genAI = null;
let model = null;

/**
 * Initialize Gemini client
 */
function initGemini() {
  if (!env.GEMINI_API_KEY) {
    logger.warn('GEMINI_API_KEY is not configured. Gemini requests will be rejected until a provider is configured.');
    return;
  }
  genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  // Use Gemini 2.0 Flash for state-of-the-art performance in 2026
  model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  });
  logger.info('✅ Gemini AI initialized (Model: gemini-2.0-flash)');
}

/**
 * Generate the first interview question
 */
async function generateFirstQuestion(jobRoleTitle, difficulty) {
  const prompt = `You are a professional interviewer conducting a mock interview for the position of "${jobRoleTitle}".
Difficulty level: ${difficulty}

Generate the FIRST interview question. Start with a general introductory question like "Tell me about yourself and your relevant experience" or a similar opening question appropriate for this role.

Rules:
- Be professional and encouraging
- Question should be clear and concise
- Appropriate for the difficulty level
- Return ONLY the question text, nothing else
- Do not include numbering or prefixes`;

  return await callGemini(prompt);
}

/**
 * Evaluate a candidate's answer
 */
async function evaluateAnswer(jobRoleTitle, questionText, answerText, difficulty) {
  const prompt = `You are an expert interviewer evaluating a candidate's answer for the "${jobRoleTitle}" position.
Difficulty level: ${difficulty}

Question asked: "${questionText}"
Candidate's answer: "${answerText}"

Evaluate the answer on these 4 criteria (score 0-10 each):
1. clarity - How clear and well-structured is the answer?
2. confidence - How confident does the candidate sound?
3. technical - How technically accurate and deep is the answer?
4. communication - How well does the candidate communicate their thoughts?

Also provide brief feedback (1-2 sentences).

Return ONLY a valid JSON object in this exact format, no markdown, no code blocks:
{"clarity":0,"confidence":0,"technical":0,"communication":0,"feedback":"Your brief feedback here"}`;

  const response = await callGemini(prompt);

  try {
    // Clean the response - remove markdown code blocks if present
    let cleaned = response.trim();
    cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    return {
      clarity: clampScore(parsed.clarity),
      confidence: clampScore(parsed.confidence),
      technical: clampScore(parsed.technical),
      communication: clampScore(parsed.communication),
      feedback: parsed.feedback || 'Good attempt.',
    };
  } catch (err) {
    logger.error({ err, response }, 'Failed to parse evaluation response');
    return {
      clarity: 5,
      confidence: 5,
      technical: 5,
      communication: 5,
      feedback: 'Answer received and noted.',
    };
  }
}

/**
 * Generate the next adaptive question based on session history
 */
async function generateNextQuestion(jobRoleTitle, difficulty, sessionHistory, avgScore) {
  const lastAnswers = sessionHistory
    .slice(-3)
    .map((h, i) => `Q: ${h.question}\nA: ${h.answerSummary || '(no answer)'}`)
    .join('\n\n');

  const prompt = `You are a professional interviewer for the "${jobRoleTitle}" position.
Difficulty level: ${difficulty}
Candidate's average score so far: ${avgScore}/10
Number of questions asked so far: ${sessionHistory.length}

Recent Q&A:
${lastAnswers}

Generate the NEXT interview question following these adaptive rules:
- If average score < 4: Ask an easier, more fundamental question
- If average score 4-7: Ask a standard question for this difficulty level
- If average score > 7: Ask a more challenging, deeper question
- If the last answer was weak: Ask a follow-up to probe deeper
- Vary question types: technical, behavioral, situational, problem-solving
- Don't repeat similar questions

Return ONLY the question text, nothing else. No numbering, no prefixes.`;

  return await callGemini(prompt);
}

/**
 * Generate the final interview report
 */
async function generateFinalReport(jobRoleTitle, sessionSummary) {
  const historyText = sessionSummary.history
    .map((h, i) => {
      const scores = `Clarity:${h.clarity} Confidence:${h.confidence} Technical:${h.technical} Communication:${h.communication}`;
      return `Q${i + 1}: ${h.question}\nAnswer: ${h.answerSummary || '(skipped)'}\nScores: ${scores}`;
    })
    .join('\n\n');

  const prompt = `You are an expert career coach reviewing a mock interview for the "${jobRoleTitle}" position.

Interview Summary:
- Questions answered: ${sessionSummary.answeredQuestions}/${sessionSummary.totalQuestions}
- Average Clarity: ${sessionSummary.avgClarity}/10
- Average Confidence: ${sessionSummary.avgConfidence}/10
- Average Technical: ${sessionSummary.avgTechnical}/10
- Average Communication: ${sessionSummary.avgCommunication}/10
- Overall Score: ${sessionSummary.overallScore}/10

Detailed Q&A:
${historyText}

CRITICAL RULES FOR READINESS LEVEL:
- If overall score < 3: MUST be "not_ready"
- If overall score 3 to <6: MUST be "needs_improvement"
- If overall score 6 to <8: MUST be "almost_ready"
- If overall score 8 to <9.5: MUST be "ready"
- If overall score >= 9.5: MUST be "excellent"

Generate a comprehensive interview report. Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "overallFeedback": "2-3 sentence summary of the candidate's performance",
  "readinessLevel": "not_ready|needs_improvement|almost_ready|ready|excellent"
}`;

  const response = await callGemini(prompt);

  try {
    let cleaned = response.trim();
    cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    logger.error({ err, response }, 'Failed to parse report response');
    return {
      strengths: ['Completed the interview'],
      weaknesses: ['Could not generate detailed analysis'],
      suggestions: ['Practice more and retry'],
      overallFeedback: 'Interview completed. Keep practicing to improve your skills.',
      readinessLevel: 'needs_improvement',
    };
  }
}

/**
 * Call Gemini API
 */
async function callGemini(prompt) {
  if (!model) {
    throw new AIServiceError('Gemini provider is not configured.');
  }

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (err) {
    logger.error({
      err: err.message,
      stack: err.stack,
      status: err.status,
      details: err.response?.data || 'No extra details'
    }, 'Gemini API call failed');
    throw new AIServiceError('AI service temporarily unavailable');
  }
}

/**
 * Clamp score between 0 and 10
 */
function clampScore(score) {
  const num = parseFloat(score) || 0;
  return Math.min(10, Math.max(0, Math.round(num * 10) / 10));
}

module.exports = {
  initGemini,
  generateFirstQuestion,
  evaluateAnswer,
  generateNextQuestion,
  generateFinalReport,
};
