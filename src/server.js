/**
 * Server Entry Point
 * Boots Express + WebSocket + Redis + AI services
 */
const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./core/logger');
const { initRedis } = require('./config/redis');
const { initWebSocket } = require('./modules/interview/interview.gateway');
const { initOpenAI } = require('./modules/ai/openai.service');

async function bootstrap() {
  try {
    // 1. Initialize Redis
    await initRedis();

    // 2. Initialize OpenAI AI
    initOpenAI();

    // 3. Create HTTP server
    const server = http.createServer(app);

    // 4. Initialize WebSocket on the same server
    initWebSocket(server);

    // 5. Start listening
    server.listen(env.PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════╗
║   🎤 STC Mock AI Interview Server             ║
║   Port: ${env.PORT}                                ║
║   Env:  ${env.NODE_ENV.padEnd(20)}              ║
║   WS:   ws://localhost:${env.PORT}/ws/interview     ║
╚═══════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force close after 10s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled errors
    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled Promise Rejection');
    });

    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught Exception');
      process.exit(1);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();
