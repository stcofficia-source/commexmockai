/**
 * Token Service
 * Industry standard JWT verification service
 */
const jwt = require('jsonwebtoken');
const axios = require('axios');
const env = require('../../config/env');
const { AuthenticationError } = require('../errors');
const logger = require('../logger');

class TokenService {
 
  async verifyToken(token) {
    if (!token) throw new AuthenticationError('Token missing');
 
    if (env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        return decoded;
      } catch (err) {
        logger.debug('Local JWT verification failed, falling back to remote');
      }
    }
 
    try {
      const url = `${env.STC_API_BASE_URL}/v1/user/profile`;
      logger.debug({ url }, 'Attempting remote token verification');

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // The PHP API returns data in a nested response.data.data.user_info structure
      const apiResponse = response.data;
      if (apiResponse.success && apiResponse.data?.user_info) {
        return apiResponse.data.user_info;
      }
      
      throw new AuthenticationError('Invalid session on main API');
    } catch (err) {
      if (err.response?.status === 401) {
        logger.warn('Remote API returned 401: Token invalid/expired');
        throw new AuthenticationError('Session expired');
      }
      logger.error({ 
        url: `${env.STC_API_BASE_URL}/v1/user/profile`,
        err: err.message,
        status: err.response?.status 
      }, 'Token remote verification failure');
      throw new AuthenticationError('Authentication service unavailable');
    }
  }
 
  generateInternalToken(payload) {
    if (!env.JWT_SECRET) return null;
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' });
  }
}

module.exports = new TokenService();
