/**
 * Session Manager
 * Handles interview session lifecycle with Redis/memory backing
 */
const { v4: uuidv4 } = require('uuid');
const { getRedis } = require('../config/redis');
const env = require('../config/env');
const logger = require('./logger');

const SESSION_PREFIX = 'interview:session:';
const SESSION_LOCK_PREFIX = 'interview:lock:';

/**
 * Create a new interview session
 */
async function createSession(userId, jobRoleId, jobRoleTitle, difficulty, maxQuestions, sessionType = 'interview', interviewContext = {}) {
  const redis = getRedis();
  const sessionId = uuidv4();
  const sessionKey = `${SESSION_PREFIX}${sessionId}`;

  const session = {
    sessionId,
    userId,
    jobRoleId,
    jobRoleTitle,
    difficulty: difficulty || 'mid',
    maxQuestions: maxQuestions || env.MAX_QUESTIONS,
    sessionType,
    interviewContext,
    currentQuestion: 0,
    state: 'idle',
    scores: [],
    history: [],
    totalClarity: 0,
    totalConfidence: 0,
    totalTechnical: 0,
    totalCommunication: 0,
    startedAt: Date.now(),
    lastActivity: Date.now(),
  };

  await redis.set(sessionKey, JSON.stringify(session), 'EX', env.SESSION_TTL);
  logger.info({ sessionId, userId, jobRoleTitle }, 'Session created');

  return session;
}

/**
 * Get an existing session
 */
async function getSession(sessionId) {
  const redis = getRedis();
  const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Update session data
 */
async function updateSession(sessionId, updates) {
  const redis = getRedis();
  const session = await getSession(sessionId);
  if (!session) return null;

  const updated = { ...session, ...updates, lastActivity: Date.now() };
  await redis.set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(updated), 'EX', env.SESSION_TTL);

  return updated;
}

/**
 * Add answer evaluation to session history
 */
async function addAnswerToSession(sessionId, questionData) {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.history.push(questionData);
  session.scores.push({
    clarity: questionData.clarity,
    confidence: questionData.confidence,
    technical: questionData.technical,
    communication: questionData.communication,
  });

  session.totalClarity += questionData.clarity || 0;
  session.totalConfidence += questionData.confidence || 0;
  session.totalTechnical += questionData.technical || 0;
  session.totalCommunication += questionData.communication || 0;
  session.currentQuestion += 1;

  return await updateSession(sessionId, session);
}

/**
 * Get session summary (averages, history)
 */
function getSessionSummary(session) {
  const count = session.scores.length || 1;
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    jobRoleTitle: session.jobRoleTitle,
    totalQuestions: session.maxQuestions,
    answeredQuestions: session.currentQuestion,
    avgClarity: parseFloat((session.totalClarity / count).toFixed(1)),
    avgConfidence: parseFloat((session.totalConfidence / count).toFixed(1)),
    avgTechnical: parseFloat((session.totalTechnical / count).toFixed(1)),
    avgCommunication: parseFloat((session.totalCommunication / count).toFixed(1)),
    overallScore: parseFloat(
      (
        (session.totalClarity + session.totalConfidence + session.totalTechnical + session.totalCommunication) /
        (count * 4)
      ).toFixed(1)
    ),
    duration: Math.floor((Date.now() - session.startedAt) / 1000),
    history: session.history.map(item => ({
      ...item,
      scores: {
        clarity: item.clarity || 0,
        confidence: item.confidence || 0,
        technical: item.technical || 0,
        communication: item.communication || 0
      }
    })),
  };
}

/**
 * Delete a session
 */
async function deleteSession(sessionId) {
  const redis = getRedis();
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
  logger.info({ sessionId }, 'Session deleted');
}

/** Shorten or extend the TTL for an existing session without rewriting it. */
async function expireSession(sessionId, seconds) {
  const redis = getRedis();
  return redis.expire(`${SESSION_PREFIX}${sessionId}`, Math.max(1, Number(seconds) || 1));
}

/** Acquire a short distributed lock for one answer/completion mutation. */
async function acquireSessionLock(sessionId, seconds = 180) {
  const redis = getRedis();
  const token = uuidv4();
  const result = await redis.set(
    `${SESSION_LOCK_PREFIX}${sessionId}`,
    token,
    'NX',
    'EX',
    Math.max(1, Number(seconds) || 180),
  );
  return result === 'OK' ? token : null;
}

/** Release only the lock created by this caller. */
async function releaseSessionLock(sessionId, token) {
  if (!token) return false;
  const redis = getRedis();
  const key = `${SESSION_LOCK_PREFIX}${sessionId}`;
  const current = await redis.get(key);
  if (current !== token) return false;
  await redis.del(key);
  return true;
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  addAnswerToSession,
  getSessionSummary,
  deleteSession,
  expireSession,
  acquireSessionLock,
  releaseSessionLock,
};
