/**
 * Redis Client Configuration
 * Provides Redis connection with fallback to in-memory store
 */
const env = require('./env');
const logger = require('../core/logger');

let redisClient = null;
let useInMemory = false;
const memoryStore = new Map();

/**
 * In-memory fallback store that mimics Redis API
 * Used when Redis is not available (development/testing)
 */
const memoryClient = {
  async get(key) {
    const item = memoryStore.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      memoryStore.delete(key);
      return null;
    }
    return item.value;
  },

  async set(key, value, ...args) {
    const item = { value };
    // Handle EX (seconds) argument
    const exIdx = args.indexOf('EX');
    if (exIdx !== -1 && args[exIdx + 1]) {
      item.expiry = Date.now() + (parseInt(args[exIdx + 1]) * 1000);
    }
    memoryStore.set(key, item);
    return 'OK';
  },

  async del(key) {
    memoryStore.delete(key);
    return 1;
  },

  async exists(key) {
    const item = memoryStore.get(key);
    if (!item) return 0;
    if (item.expiry && Date.now() > item.expiry) {
      memoryStore.delete(key);
      return 0;
    }
    return 1;
  },

  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(memoryStore.keys()).filter(k => regex.test(k));
  },

  async expire(key, seconds) {
    const item = memoryStore.get(key);
    if (item) {
      item.expiry = Date.now() + (seconds * 1000);
      return 1;
    }
    return 0;
  },

  status: 'ready',
};

/**
 * Initialize Redis connection
 */
async function initRedis() {
  const Redis = require('ioredis');

  // If we are in dev and want to try local redis
  if (env.isDev && !env.REDIS_PASSWORD) {
    logger.info('Attempting to connect to local Redis...');
    
    return new Promise((resolve) => {
      const tempClient = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        connectTimeout: 1000,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null, // Do not retry
      });

      tempClient.on('error', (err) => {
        logger.warn('⚠️ Redis not running locally. Falling back to in-memory session store.');
        useInMemory = true;
        redisClient = memoryClient;
        tempClient.disconnect();
        resolve(memoryClient);
      });

      tempClient.on('connect', () => {
        logger.info('✅ Redis connected successfully');
        redisClient = tempClient;
        resolve(tempClient);
      });
    });
  }

  // Production or configured Redis
  try {
    redisClient = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
    });
    return redisClient;
  } catch (err) {
    logger.error('Failed to connect to configured Redis. Using memory fallback.');
    redisClient = memoryClient;
    return memoryClient;
  }
}

/**
 * Get the active Redis client (or memory fallback)
 */
function getRedis() {
  if (!redisClient) {
    logger.warn('Redis not initialized, using memory store');
    useInMemory = true;
    redisClient = memoryClient;
  }
  return redisClient;
}

module.exports = { initRedis, getRedis };
