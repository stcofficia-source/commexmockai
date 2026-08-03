/**
 * Application Logger
 * Pino-based structured logger with pretty printing in development
 */
const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.isDev ? 'debug' : 'info',
  redact: {
    paths: [
      'authorization',
      'token',
      'access_token',
      'refresh_token',
      'headers.authorization',
      'headers.Authorization',
      'req.headers.authorization',
      'request.headers.authorization',
      'config.headers.authorization',
      'config.headers.Authorization',
      'err.config.headers.authorization',
      'err.config.headers.Authorization',
    ],
    censor: '[REDACTED]',
  },
  transport: env.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'stcmockai',
  },
});

module.exports = logger;
