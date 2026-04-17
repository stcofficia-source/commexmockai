/**
 * Application Logger
 * Pino-based structured logger with pretty printing in development
 */
const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.isDev ? 'debug' : 'info',
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
