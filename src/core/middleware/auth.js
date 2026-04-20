/**
 * Authentication Middleware
 * Production-ready guard for HTTP and WebSocket
 */
const tokenService = require('../security/token.service');
const { AuthenticationError } = require('../errors');
const logger = require('../logger');

/**
 * Guards HTTP routes
 */
const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new AuthenticationError('Token required for this resource');
    }

    const user = await tokenService.verifyToken(token);
    
    // Attach user to request for follow-up middleware/controllers
    req.user = user;
    next();
  } catch (err) {
    // If we've already sent headers, don't try to send again
    if (res.headersSent) return next(err);

    const statusCode = err.statusCode || 401;
    res.status(statusCode).json({
      success: false,
      code: err.code || 'UNAUTHORIZED',
      message: err.message
    });
  }
};

/**
 * Guard for WebSocket connection / event
 */
const authorizeSocket = async (token) => {
    try {
        if (!token) return null;
        return await tokenService.verifyToken(token);
    } catch (err) {
        logger.warn({ err: err.message }, 'WebSocket authorization failed');
        return null;
    }
};

module.exports = {
  authenticate,
  authorizeSocket
};
