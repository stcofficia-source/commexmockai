const axios = require('axios');
const env = require('../config/env');

const baseURL = (env.STC_API_BASE_URL || '').replace(/\/+$/, '');

/**
 * Reusable Axios instance for stcmockai backend communication with PHP stc_api
 */
const phpApiClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

module.exports = phpApiClient;
