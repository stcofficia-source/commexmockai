const axios = require('axios');
const { randomUUID } = require('crypto');
const env = require('../../config/env');

const phpBaseUrl = String(env.STC_API_BASE_URL || '').replace(/\/+$/, '');
const localResumesByUser = new Map();

// Development-only API configuration. The LMS never imports this data: it is
// delivered by the same API contract that production receives from STC/PHP.
const localWorkspaceConfig = Object.freeze({
  methods: [
    { key: 'scratch', title: 'Start from scratch', description: 'Create a new resume step by step', icon: 'file' },
    { key: 'upload', title: 'Upload existing resume', description: 'Upload your current resume and improve it with AI', icon: 'upload', action: 'upload' },
    { key: 'ai', title: 'Use AI resume assistant', description: 'Answer questions and let AI build your resume', icon: 'sparkles', tag: 'Recommended' },
  ],
  steps: [
    { key: 'personal', title: 'Personal information', description: 'Name, contact, and links', icon: 'user', fields: [
      { section: 'personal', key: 'name', label: 'Full name', required: true },
      { section: 'personal', key: 'role', label: 'Target role' },
      { section: 'personal', key: 'email', label: 'Email', type: 'email', required: true },
      { section: 'personal', key: 'phone', label: 'Phone' },
      { section: 'personal', key: 'location', label: 'Location' },
      { section: 'personal', key: 'linkedin', label: 'LinkedIn' },
      { section: 'personal', key: 'github', label: 'GitHub', full: true },
    ] },
    { key: 'summary', title: 'Summary / objective', description: 'Career objective and profile', icon: 'target', fields: [
      { section: 'summary', key: 'text', label: 'Professional summary', type: 'textarea', rows: 7, required: true, full: true },
    ] },
    { key: 'education', title: 'Education', description: 'Degree, college, and scores', icon: 'education', fields: [
      { section: 'education', key: 'degree', label: 'Degree', required: true },
      { section: 'education', key: 'institution', label: 'Institution', required: true },
      { section: 'education', key: 'year', label: 'Year' },
      { section: 'education', key: 'score', label: 'Score' },
    ] },
    { key: 'experience', title: 'Work experience', description: 'Roles and achievements', icon: 'briefcase', fields: [
      { section: 'experience', key: 'role', label: 'Role', required: true },
      { section: 'experience', key: 'company', label: 'Company', required: true },
      { section: 'experience', key: 'duration', label: 'Duration', full: true },
      { section: 'experience', key: 'highlights', label: 'Work highlights', type: 'textarea', rows: 6, full: true },
    ] },
    { key: 'skills', title: 'Skills', description: 'Technical and soft skills', icon: 'star', fields: [
      { section: 'skills', key: 'technical', label: 'Technical skills', type: 'textarea', rows: 4, required: true, full: true },
      { section: 'skills', key: 'soft', label: 'Soft skills', type: 'textarea', rows: 4, full: true },
    ] },
    { key: 'projects', title: 'Projects', description: 'Relevant project work', icon: 'file', fields: [
      { section: 'projects', key: 'name', label: 'Project name', required: true },
      { section: 'projects', key: 'stack', label: 'Technology stack' },
      { section: 'projects', key: 'link', label: 'Project link', full: true },
      { section: 'projects', key: 'description', label: 'Project description', type: 'textarea', rows: 5, full: true },
    ] },
    { key: 'certifications', title: 'Certifications', description: 'Courses and credentials', icon: 'award', fields: [
      { section: 'certifications', key: 'items', label: 'Certifications', type: 'textarea', rows: 6, full: true },
    ] },
    { key: 'achievements', title: 'Achievements', description: 'Awards and honors', icon: 'list', fields: [
      { section: 'achievements', key: 'items', label: 'Achievements', type: 'textarea', rows: 6, full: true },
    ] },
  ],
  templates: [
    { key: 'modern', name: 'Modern', description: 'Clean and professional' },
    { key: 'creative', name: 'Creative', description: 'Designed to stand out' },
    { key: 'minimal', name: 'Minimal', description: 'Simple and elegant' },
    { key: 'executive', name: 'Executive', description: 'For senior professionals' },
    { key: 'classic', name: 'Classic', description: 'Traditional and timeless' },
    { key: 'compact', name: 'Compact', description: 'ATS friendly' },
  ],
  tips: ['Keep it concise and relevant', 'Use action verbs', 'Quantify achievements', 'Tailor to the job role'],
  editorTips: ['Use action verbs', 'Quantify achievements', 'Keep formatting simple'],
  defaultTemplate: 'modern',
});

function currentUserKey(userId) {
  return String(userId || 'anonymous');
}

function localResumes(userId) {
  const key = currentUserKey(userId);
  if (!localResumesByUser.has(key)) localResumesByUser.set(key, []);
  return localResumesByUser.get(key);
}

function localWorkspace(userId) {
  return {
    ...localWorkspaceConfig,
    initialResume: {},
    resumes: localResumes(userId),
    source: 'stcmockai-local',
  };
}

function upstreamError(error, action) {
  const statusCode = error.response?.status || 503;
  const message = error.response?.data?.message || `STC resume API could not ${action}.`;
  const wrapped = new Error(message);
  wrapped.statusCode = statusCode;
  wrapped.isOperational = true;
  return wrapped;
}

async function request(method, path, authHeader, data) {
  if (!phpBaseUrl) throw Object.assign(new Error('STC_API_BASE_URL is not configured.'), { statusCode: 503, isOperational: true });
  try {
    const response = await axios({ method, url: `${phpBaseUrl}${path}`, headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) }, data, timeout: 15000 });
    return response.data?.data || response.data || {};
  } catch (error) {
    throw upstreamError(error, method.toLowerCase());
  }
}

async function withDevelopmentFallback(userId, action, remoteCall, localCall) {
  try {
    return await remoteCall();
  } catch (error) {
    if (!env.isDev) throw error;
    return localCall();
  }
}

function createLocalResume(userId, payload) {
  const now = new Date().toISOString();
  const resume = { resumeId: randomUUID(), title: payload.title || 'Untitled resume', form: payload.form || {}, template: payload.template || '', atsScore: Number(payload.atsScore) || 0, completedSteps: Array.isArray(payload.completedSteps) ? payload.completedSteps : [], createdAt: now, updatedAt: now };
  localResumes(userId).unshift(resume);
  return resume;
}

function updateLocalResume(userId, resumeId, payload) {
  const resume = localResumes(userId).find((item) => item.resumeId === resumeId);
  if (!resume) throw Object.assign(new Error('Resume not found.'), { statusCode: 404, isOperational: true });
  Object.assign(resume, { ...payload, resumeId, updatedAt: new Date().toISOString() });
  return resume;
}

module.exports = {
  getWorkspace: (userId, authHeader) => withDevelopmentFallback(userId, 'workspace', () => request('get', '/v1/resumes/workspace', authHeader), () => localWorkspace(userId)),
  list: (userId, authHeader) => withDevelopmentFallback(userId, 'list', () => request('get', '/v1/resumes', authHeader), () => ({ resumes: localResumes(userId), source: 'stcmockai-local' })),
  create: (userId, authHeader, payload) => withDevelopmentFallback(userId, 'create', () => request('post', '/v1/resumes', authHeader, payload), () => createLocalResume(userId, payload)),
  update: (userId, resumeId, authHeader, payload) => withDevelopmentFallback(userId, 'update', () => request('put', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader, payload), () => updateLocalResume(userId, resumeId, payload)),
  remove: (userId, resumeId, authHeader) => withDevelopmentFallback(userId, 'delete', () => request('delete', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader), () => {
    const resumes = localResumes(userId);
    const index = resumes.findIndex((item) => item.resumeId === resumeId);
    if (index === -1) throw Object.assign(new Error('Resume not found.'), { statusCode: 404, isOperational: true });
    resumes.splice(index, 1);
    return { resumeId };
  }),
};
