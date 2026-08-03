const phpApiClient = require('../../core/php-api-client');
const env = require('../../config/env');
const { ValidationError } = require('../../core/errors');
const { extractText } = require('../documents/document-parser.service');
const { scanProjectFiles } = require('../documents/document-security.service');
const { storeProjectFile } = require('../documents/document-storage.service');
const { analyzeProject } = require('../analysis/analysis.service');
const { runBillableAiOperation } = require('../../core/credit-billing.service');

function list(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = []; } }
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 12) : [];
}

async function persist(authHeader, payload) {
  try {
    const response = await phpApiClient.post('/v1/project-critiques', payload, { headers: { ...(authHeader ? { Authorization: authHeader } : {}) }, timeout: 20000 });
    return response.data?.data || response.data;
  } catch (error) {
    const wrapped = new Error(error.response?.data?.message || 'STC project critique API could not save the analysis.');
    wrapped.statusCode = error.response?.status || 503;
    wrapped.isOperational = true;
    throw wrapped;
  }
}

async function analyze({ studentId, authHeader, payload, files }) {
  if (!studentId) throw new ValidationError('Authentication is required to analyze a project.');
  const title = String(payload.title || '').trim().slice(0, 190);
  const focus = list(payload.focus);
  if (!title) throw new ValidationError('Project title is required.');
  if (!focus.length) throw new ValidationError('Select at least one feedback area.');
  if (!files.length && !payload.description?.trim() && !payload.reference?.trim()) {
    throw new ValidationError('Upload at least one project file or provide a project description.');
  }
  const securityChecks = files.length ? await scanProjectFiles(files) : [];
  const extractedFiles = files.length ? await Promise.all(files.map((file) => extractText(file, 'project'))) : [];
  const parsedFiles = files.length ? await Promise.all(files.map(async (file, index) => {
    const parsed = extractedFiles[index];
    const stored = await storeProjectFile(studentId, file);
    return {
      ...securityChecks[index],
      name: file.originalname,
      mimeType: securityChecks[index]?.mimeType || file.mimetype,
      size: file.size,
      extension: parsed.extension,
      extractedCharacters: parsed.text.length,
      text: parsed.text,
      storagePath: stored.storagePath,
    };
  })) : [];
  const billed = await runBillableAiOperation({
    authorization: authHeader,
    serviceKey: 'project_critique',
    operation: () => analyzeProject({
      title,
      submissionType: payload.submissionType,
      technologies: payload.technologies,
      description: payload.description,
      focus,
      files: parsedFiles,
    }),
  });
  const analysis = billed.data;
  return persist(authHeader, {
    title,
    submissionType: payload.submissionType || '',
    technologies: payload.technologies || '',
    description: payload.description || '',
    focus,
    files: parsedFiles.map(({ text, ...file }) => file),
    analysis: {
      ...analysis,
      security: {
        status: 'passed',
        scannedFiles: securityChecks.length,
        engines: Array.from(new Set(securityChecks.map((item) => item.scanEngine))),
        scannedAt: securityChecks[securityChecks.length - 1]?.scannedAt || new Date().toISOString(),
      },
    },
  });
}

module.exports = { analyze };
