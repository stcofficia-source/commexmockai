const axios = require('axios');
const { randomUUID } = require('crypto');
const env = require('../config/env');

function creditError(error) {
  const wrapped = new Error(error.response?.data?.message || 'AI credit service is unavailable.');
  wrapped.statusCode = error.response?.status || 503;
  wrapped.isOperational = true;
  return wrapped;
}

async function reserveAiCredits({ authorization, serviceKey, reference, metadata = {} }) {
  if (!authorization) {
    const error = new Error('Authentication is required to use AI services.');
    error.statusCode = 401;
    error.isOperational = true;
    throw error;
  }

  try {
    const response = await axios.post(
      `${String(env.STC_API_BASE_URL).replace(/\/+$/, '')}/v1/credits/usage/consume`,
      {
        service_key: serviceKey,
        usage_units: 1,
        reference: reference || `${serviceKey}_${randomUUID()}`,
        metadata,
      },
      {
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        timeout: 10000,
      },
    );
    return response.data?.data || response.data || {};
  } catch (error) {
    throw creditError(error);
  }
}

module.exports = { reserveAiCredits };
