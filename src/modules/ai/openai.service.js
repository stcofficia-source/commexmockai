/**
 * OpenAI AI Service
 * Handles question generation, answer evaluation, and final report using GPT-4o
 */
const OpenAI = require('openai');
const env = require('../../config/env');
const logger = require('../../core/logger');
const { AIServiceError } = require('../../core/errors');

let openai = null;

/**
 * Initialize OpenAI client
 */
function initOpenAI() {
  if (!env.OPENAI_API_KEY) {
    logger.warn('⚠️ OPENAI_API_KEY not set — AI features will use mock responses');
    return;
  }
  openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
  logger.info('✅ OpenAI AI initialized (Model: gpt-4o)');
}

/**
 * Generate the first interview question
 */
async function generateFirstQuestion(jobRoleTitle, difficulty) {
  const prompt = `You are a Senior University Placement Officer and Interviewer. You are conducting a mock interview for a COLLEGE STUDENT (Fresher) applying for the position of "${jobRoleTitle}".
Difficulty level: ${difficulty}

Task: Generate the FIRST interview question. 
MANDATORY: You must ALWAYS start with a variation of "Tell me about yourself and your academic/project experience" to help the student settle in.

Rules:
- THE 3-LINE LAW: The question MUST BE 1 to 3 lines max. NEVER exceed this. 
- HUMAN TOUCH: You are a warm, real person. Use natural, human language. 
- NO ROBOTS: Never use robotic prefixes like "First Question:". 
- PROFESSIONAL: Clear, high-standard English for a college placement.
- Return ONLY the question text. No numbering or prefixes.`;

  return await callOpenAI(prompt);
}

/**
 * Evaluate a candidate's answer
 */
async function evaluateAnswer(jobRoleTitle, questionText, answerText, difficulty) {
  const prompt = `You are an expert interviewer evaluating a candidate's answer for the "${jobRoleTitle}" position.
Difficulty level: ${difficulty}

Question asked: "${questionText}"
Candidate's answer: "${answerText}"

evaluate the answer on these 4 criteria (score 0-10 each):
1. clarity - How clear and well-structured is the answer?
2. confidence - How confident does the candidate sound?
3. technical - How technically accurate and deep is the answer?
4. communication - How well does the candidate communicate their thoughts?

Also provide brief feedback (1-2 sentences). 
STRICT SCORING RULES:
- If the answer is COMPLETELY off-topic, nonsense gibberish, or irrelevant to any professional context, set all scores to 0 and explicitly state this in the feedback.
- If the answer is an INTRODUCTION (e.g., student stating name, college, or basic bio) for an introductory question, DO NOT set scores to 0. Score it fairly (e.g. 4-7) even if brief.
- If the answer is "I don't know," score it 0 for technical but provide fair scores for clarity and communication if their delivery was professional.

Return ONLY a valid JSON object in this exact format:
{"clarity":0,"confidence":0,"technical":0,"communication":0,"feedback":"Your brief feedback here"}`;

  // Use gpt-4o-mini for ultra-fast evaluation during the interview
  const response = await callOpenAI(prompt, true, false);

  try {
    const parsed = typeof response === 'string' ? JSON.parse(response) : response;
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

  const prompt = `You are an expert, highly conversational hiring manager conducting an adaptive mock interview for the "${jobRoleTitle}" position.
Difficulty level: ${difficulty}
Candidate's score: ${avgScore}/10

Recent Q&A Context:
${lastAnswers}

Generate the NEXT response and question organically:
- THE 3-LINE LAW: Keep it very punchy and conversational. Maximum 3 lines total.
- ORGANIC FLOW: Read the candidate's last answer. 
  * If it was a GREAT answer, acknowledge a specific point they made organically (e.g. "That's a smart way to handle state.") and pivot to the next question.
  * If the answer was VAGUE, push them naturally based on what they just said.
  * If the answer was COMPLETE SMALL TALK, EXCUSES, OR UNRELATED (e.g. "hello", "how are you", "I don't know"), DO NOT use robotic templates. Handle it like a strict but polite human interviewer. Briefly address it organically, then immediately hit them with the next technical question. 
- AVOID REPETITION: Do not use the same transition phrases over and over. Avoid "I see," "Got it," "That's interesting." Just talk naturally.

Return ONLY the text you will speak. No numbering, no prefixes.`;

  return await callOpenAI(prompt);
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

Generate a comprehensive interview report. Return ONLY a valid JSON object:
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "behaviouralObservations": ["Detailed Pause analysis", "Hesitation/Nervousness markers", "Repetitive word usage (detecting specific words student said again and again)", "Grammar mistakes or sentence structure slips"],
  "summaryVerdict": "A decisive 1-sentence executive verdict.",
  "overallFeedback": "2-3 sentence summary of the candidate's performance",
  "readinessLevel": "not_ready|needs_improvement|almost_ready|ready|excellent"
} `;

  const response = await callOpenAI(prompt, true, true);

  try {
    return typeof response === 'string' ? JSON.parse(response) : response;
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
 * Call OpenAI API
 */
async function callOpenAI(prompt, jsonMode = false, highReasoning = false) {
  if (!openai) {
    logger.debug('Using mock AI response (no API key)');
    return getMockResponse(prompt);
  }

  // Speed Optimization: use gpt-4o-mini for fast question generation, gpt-4o for deep evaluation
  const modelId = highReasoning ? 'gpt-4o' : 'gpt-4o-mini';

  try {
    const response = await openai.chat.completions.create({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      response_format: jsonMode ? { type: 'json_object' } : { type: 'text' },
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (err) {
    logger.error({
      err: err.message,
      status: err.status,
    }, 'OpenAI API call failed');
    throw new AIServiceError('AI service temporarily unavailable');
  }
}

/**
 * Mock responses for development
 */
function getMockResponse(prompt) {
  if (prompt.includes('FIRST interview question')) {
    return 'Tell me about yourself and your experience relevant to this role.';
  }
  if (prompt.includes('Evaluate the answer')) {
    return JSON.stringify({
      clarity: 7,
      confidence: 6,
      technical: 7,
      communication: 6,
      feedback: 'Good answer with clear structure.',
    });
  }
  // Simplified for brevity
  return 'GPT-4o simulated response';
}

/**
 * Clamp score
 */
function clampScore(score) {
  const num = parseFloat(score) || 0;
  return Math.min(10, Math.max(0, Math.round(num * 10) / 10));
}

module.exports = {
  initOpenAI,
  generateFirstQuestion,
  evaluateAnswer,
  generateNextQuestion,
  generateFinalReport,
};
