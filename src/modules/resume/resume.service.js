const axios = require('axios');
const env = require('../../config/env');
const { extractText } = require('../documents/document-parser.service');
const { analyzeResume } = require('../analysis/analysis.service');

const phpBaseUrl = String(env.STC_API_BASE_URL || '').replace(/\/+$/, '');

function upstreamError(error, action) {
  const wrapped = new Error(error.response?.data?.message || `STC resume API could not ${action}.`);
  wrapped.statusCode = error.response?.status || 503;
  wrapped.isOperational = true;
  return wrapped;
}

async function request(method, path, authHeader, data) {
  if (!phpBaseUrl) throw Object.assign(new Error('STC_API_BASE_URL is not configured.'), { statusCode: 503, isOperational: true });
  try {
    const response = await axios({
      method,
      url: `${phpBaseUrl}${path}`,
      headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
      data,
      timeout: 20000,
    });
    return response.data?.data || response.data || {};
  } catch (error) {
    throw upstreamError(error, method.toLowerCase());
  }
}

async function analyzeUpload(userId, authHeader, file) {
  if (!userId) throw Object.assign(new Error('Authentication is required to analyze a resume.'), { statusCode: 401, isOperational: true });
  const parsed = await extractText(file, 'resume');
  const analysis = await analyzeResume({ title: file.originalname, extractedText: parsed.text });
  return {
    resume: {},
    atsScore: analysis.score,
    analysis,
    uploadedFile: { name: file.originalname, type: file.mimetype, size: file.size, extension: parsed.extension },
  };
}

async function reviewAts(userId, authHeader, payload = {}) {
  if (!userId) throw Object.assign(new Error('Authentication is required to review a resume.'), { statusCode: 401, isOperational: true });
  const analysis = await analyzeResume({ title: payload.title, form: payload.form });
  const resumeId = String(payload.resumeId || '').trim();
  if (resumeId) await request('put', `/v1/resumes/${encodeURIComponent(resumeId)}/ats-analysis`, authHeader, { analysis });
  return analysis;
}

module.exports = {
  getWorkspace: (userId, authHeader) => request('get', '/v1/resumes/workspace', authHeader),
  list: (userId, authHeader) => request('get', '/v1/resumes', authHeader),
  create: (userId, authHeader, payload) => request('post', '/v1/resumes', authHeader, payload),
  update: (userId, resumeId, authHeader, payload) => request('put', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader, payload),
  remove: (userId, resumeId, authHeader) => request('delete', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader),
  completeTour: (userId, tourKey, authHeader) => request('put', `/v1/resumes/onboarding/${encodeURIComponent(tourKey)}`, authHeader, { status: 'completed' }),
  analyzeUpload,
  reviewAts,
};
