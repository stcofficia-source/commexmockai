const crypto = require('crypto');
const env = require('../../config/env');
const { extractText } = require('../documents/document-parser.service');
const { analyzeResume, parseResumeDocument } = require('../analysis/analysis.service');
const { runBillableAiOperation } = require('../../core/credit-billing.service');
const { ValidationError } = require('../../core/errors');
const AsyncResultCache = require('../../core/async-result-cache');

const phpBaseUrl = String(env.STC_API_BASE_URL || '').replace(/\/+$/, '');
const analysisCache = new AsyncResultCache({
  ttlMs: env.RESUME_ANALYSIS_CACHE_TTL_MS,
  maxEntries: env.RESUME_ANALYSIS_CACHE_MAX_ENTRIES,
});
const binaryFieldPattern = /^(profileImage|profile_picture|profilePicture|photo|avatar|image|dataUrl|file|blob)$/i;
const atsReviewExperience = Object.freeze({
  title: 'Analyzing your resume',
  description: 'Your resume is being reviewed...',
  stageDurationMs: 1500,
  unchangedReview: {
    eyebrow: 'COMMEX AI',
    title: 'Improve your resume before the next ATS review',
    description: 'Apply the personalized AI recommendations from your latest review. The ATS action will unlock automatically when your resume content changes.',
    lockedButtonLabel: 'ATS reviewed',
    suggestionsLabel: 'Latest AI recommendations',
    actionLabel: 'Review AI suggestions',
    dismissLabel: 'Continue editing',
  },
  stages: [
    { id: 'structure', label: 'Reading your resume structure', icon: 'scan' },
    { id: 'keywords', label: 'Checking role-specific keywords', icon: 'keywords' },
    { id: 'language', label: 'Reviewing grammar and professional tone', icon: 'language' },
    { id: 'impact', label: 'Evaluating measurable achievements', icon: 'impact' },
    { id: 'score', label: 'Calculating ATS readiness', icon: 'score' },
    { id: 'suggestions', label: 'Preparing personalized suggestions', icon: 'suggestions' },
  ],
});

function sanitizeAnalysisValue(value, depth = 0) {
  if (depth > 8 || value === undefined || typeof value === 'function') return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim().slice(0, 5000);
  if (Array.isArray(value)) {
    return value
      .slice(0, 60)
      .map((item) => sanitizeAnalysisValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== 'object') return String(value).slice(0, 5000);

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !binaryFieldPattern.test(key))
      .sort()
      .slice(0, 80)
      .map((key) => [key, sanitizeAnalysisValue(value[key], depth + 1)])
      .filter(([, item]) => item !== undefined),
  );
}

function analysisFingerprint(userId, kind, payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      userId: String(userId || ''),
      kind,
      payload: sanitizeAnalysisValue(payload),
    }))
    .digest('hex');
}

function withAnalysisMeta(analysis, fingerprint, cacheStatus) {
  return {
    ...analysis,
    analysisId: fingerprint.slice(0, 16),
    cacheStatus,
  };
}

function upstreamError(error, action) {
  const wrapped = new Error(error.response?.data?.message || `STC resume API could not ${action}.`);
  wrapped.statusCode = error.response?.status || 503;
  wrapped.isOperational = true;
  return wrapped;
}

const phpApiClient = require('../../core/php-api-client');

async function request(method, path, authHeader, data) {
  try {
    const response = await phpApiClient({
      method,
      url: path,
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
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
  if (!file) throw new ValidationError('Upload a PDF, DOCX, or TXT resume before analysis.');
  const parsed = await extractText(file, 'resume');
  const analysisPayload = {
    title: String(file.originalname || 'Uploaded resume').slice(0, 190),
    extractedText: String(parsed.text || '').slice(0, 30000),
  };
  const fingerprint = analysisFingerprint(userId, 'resume-upload', analysisPayload);
  const cached = await analysisCache.getOrCreate(fingerprint, async () => {
    const billed = await runBillableAiOperation({
      authorization: authHeader,
      serviceKey: 'resume_ai',
      reference: `resume-upload:${fingerprint}`,
      operation: async () => {
        const [imported, analysis] = await Promise.all([
          parseResumeDocument(analysisPayload),
          analyzeResume(analysisPayload),
        ]);
        return { imported, analysis };
      },
    });
    return billed.data;
  });
  const imported = cached.value?.imported || { form: {}, review: { mappedFieldCount: 0, unmappedContent: [] } };
  const analysis = withAnalysisMeta(cached.value?.analysis || cached.value, fingerprint, cached.status);
  return {
    resume: imported.form,
    form: imported.form,
    importReview: imported.review,
    atsScore: analysis.score,
    analysis,
    uploadedFile: { name: file.originalname, type: file.mimetype, size: file.size, extension: parsed.extension },
  };
}

async function reviewAts(userId, authHeader, payload = {}) {
  if (!userId) throw Object.assign(new Error('Authentication is required to review a resume.'), { statusCode: 401, isOperational: true });
  const analysisPayload = {
    title: String(payload.title || '').trim().slice(0, 190),
    form: sanitizeAnalysisValue(payload.form || {}),
  };
  if (!analysisPayload.title && !Object.keys(analysisPayload.form).length) throw new ValidationError('Add resume details before requesting an ATS review.');
  const resumeId = String(payload.resumeId || '').trim();
  const fingerprint = analysisFingerprint(userId, 'ats-review', { resumeId, ...analysisPayload });
  const analyzeAndPersist = async () => {
    const billed = await runBillableAiOperation({
      authorization: authHeader,
      serviceKey: 'resume_ai',
      reference: `ats-review:${fingerprint}`,
      operation: () => analyzeResume(analysisPayload),
    });
    const analysis = billed.data;
    if (resumeId) await request('put', `/v1/resumes/${encodeURIComponent(resumeId)}/ats-analysis`, authHeader, { analysis });
    return analysis;
  };
  const cached = payload.force === true
    ? { value: await analyzeAndPersist(), status: 'refresh' }
    : await analysisCache.getOrCreate(fingerprint, analyzeAndPersist);
  return withAnalysisMeta(cached.value, fingerprint, cached.status);
}

function getAtsReviewExperience() {
  return atsReviewExperience;
}

module.exports = {
  getWorkspace: (userId, authHeader) => request('get', '/v1/resumes/workspace', authHeader),
  list: (userId, authHeader) => request('get', '/v1/resumes', authHeader),
  create: (userId, authHeader, payload) => request('post', '/v1/resumes', authHeader, payload),
  update: (userId, resumeId, authHeader, payload) => request('put', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader, payload),
  remove: (userId, resumeId, authHeader) => request('delete', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader),
  completeTour: (userId, tourKey, authHeader) => request('put', `/v1/resumes/onboarding/${encodeURIComponent(tourKey)}`, authHeader, { status: 'completed' }),
  analyzeUpload,
  getAtsReviewExperience,
  reviewAts,
};
