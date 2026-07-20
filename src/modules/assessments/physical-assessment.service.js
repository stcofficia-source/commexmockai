const axios = require('axios');
const env = require('../../config/env');

function url(path = '') {
  return `${env.STC_API_BASE_URL}${env.STC_ASSESSMENT_API_PREFIX}${path}`;
}

const assetOrigin = (env.STC_API_BASE_URL || '').replace(/\/+$/, '');

function headers(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeAssetUrls(value) {
  if (typeof value === 'string') {
    if (/^\/uploads\//i.test(value)) {
      return `${assetOrigin}${value}`;
    }
    if (/^uploads\//i.test(value)) {
      return `${assetOrigin}/${value}`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeAssetUrls);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeAssetUrls(entry)]));
  }

  return value;
}

function toOperationalError(error) {
  const detail = error.response?.data?.message || error.response?.data?.error || error.message;
  const wrapped = new Error(detail || 'Psychometric assessment service is unavailable.');
  wrapped.statusCode = error.response?.status || 502;
  wrapped.isOperational = true;
  return wrapped;
}

async function request(config) {
  try {
    const response = await axios({ timeout: 12000, ...config });
    return normalizeAssetUrls(response.data?.data ?? response.data);
  } catch (error) {
    throw toOperationalError(error);
  }
}

function catalog(token) { return request({ method: 'get', url: url(), headers: headers(token) }); }
function history(token) { return request({ method: 'get', url: url('/attempts'), headers: headers(token) }); }
function report(attemptId, token) { return request({ method: 'get', url: url(`/attempts/${attemptId}/report`), headers: headers(token) }); }

async function start(payload, token) {
  const result = await request({ method: 'post', url: url('/attempts'), data: payload, headers: headers(token) });
  const data = result?.attempt ? result : (result?.id ? { attempt: result, questions: result?.questions || [] } : result);

  if (!data?.questions || !data.questions.length) {
    try {
      const catData = await catalog(token);
      const targetLevelId = Number(payload?.levelId || payload?.level_id || 1);
      const list = Array.isArray(catData) ? catData : catData?.categories || catData?.data || [];
      for (const cat of list) {
        const levels = cat.levels || [];
        const lvl = levels.find((l) => Number(l.id) === targetLevelId || Number(l.level_number) === targetLevelId);
        if (lvl && lvl.questions && lvl.questions.length) {
          data.questions = lvl.questions;
          break;
        }
      }
    } catch (err) {
      console.warn('Failed to attach fallback questions in stcmockai:', err.message);
    }
  }

  return data;
}
function answer(attemptId, questionId, payload, token) { return request({ method: 'put', url: url(`/attempts/${attemptId}/answers/${questionId}`), data: payload, headers: headers(token) }); }
function complete(attemptId, payload, token) { return request({ method: 'post', url: url(`/attempts/${attemptId}/complete`), data: payload, headers: headers(token) }); }

async function reportPdf(attemptId, token) {
  try {
    const response = await axios.get(url(`/attempts/${attemptId}/report.pdf`), { headers: headers(token), responseType: 'arraybuffer', timeout: 20000 });
    return { data: response.data, status: response.status, contentType: response.headers['content-type'] || 'application/pdf' };
  } catch (error) {
    throw toOperationalError(error);
  }
}

module.exports = { catalog, history, report, reportPdf, start, answer, complete };
