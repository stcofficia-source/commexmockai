const axios = require('axios');
const env = require('../config/env');

const baseURL = (env.STC_API_BASE_URL || '').replace(/\/+$/, '');

/**
 * Single reusable server HTTP client. Relative URLs target PHP stc_api; vetted
 * provider integrations may use absolute URLs with credentials set per request.
 */
const phpApiClient = axios.create({
  baseURL,
  timeout: 30000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

module.exports = phpApiClient;
