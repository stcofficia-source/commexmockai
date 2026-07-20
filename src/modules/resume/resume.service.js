const axios = require('axios');
const env = require('../../config/env');

const phpBaseUrl = String(env.STC_API_BASE_URL || '').replace(/\/+$/, '');

function upstreamError(error, action) {
  const statusCode = error.response?.status || 503;
  const message = error.response?.data?.message
    || error.response?.data?.error
    || `STC resume API could not ${action}.`;
  const wrapped = new Error(message);
  wrapped.statusCode = statusCode;
  wrapped.isOperational = true;
  return wrapped;
}

async function request(method, path, authHeader, data) {
  if (!phpBaseUrl) {
    const error = new Error('STC_API_BASE_URL is not configured.');
    error.statusCode = 503;
    error.isOperational = true;
    throw error;
  }

  try {
    const response = await axios({
      method,
      url: `${phpBaseUrl}${path}`,
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      data,
      timeout: 15000,
    });
    return response.data?.data || response.data || {};
  } catch (error) {
    throw upstreamError(error, method.toLowerCase());
  }
}

module.exports = {
  getWorkspace: (authHeader) => request('get', '/v1/resumes/workspace', authHeader),
  list: (authHeader) => request('get', '/v1/resumes', authHeader),
  create: (authHeader, payload) => request('post', '/v1/resumes', authHeader, payload),
  update: (resumeId, authHeader, payload) => request('put', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader, payload),
  remove: (resumeId, authHeader) => request('delete', `/v1/resumes/${encodeURIComponent(resumeId)}`, authHeader),
};
