/**
 * Exchange Rate Service
 * Provides cached, real-time USD to INR exchange rates for AI credit billing.
 */
const https = require('https');
const logger = require('./logger');

let cachedUsdInrRate = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Refresh and return the live USD/INR exchange rate with in-memory caching.
 * Falls back to the provided default rate if the network request fails.
 */
function getUsdInrExchangeRate(fallbackRate = 96.1856) {
  const now = Date.now();
  if (cachedUsdInrRate && (now - lastFetchTimestamp < CACHE_TTL_MS)) {
    return cachedUsdInrRate;
  }

  // Trigger non-blocking background refresh
  https
    .get('https://open.er-api.com/v6/latest/USD', { timeout: 3500 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const inrRate = data?.rates?.INR;
          if (inrRate && Number.isFinite(inrRate) && inrRate > 0) {
            cachedUsdInrRate = inrRate;
            lastFetchTimestamp = now;
            logger.info({ liveUsdInrRate: inrRate }, 'Fetched live USD to INR exchange rate for AI credit settlement');
          }
        } catch {
          // Keep current or fallback rate on parse error
        }
      });
    })
    .on('error', () => undefined);

  return cachedUsdInrRate || fallbackRate;
}

module.exports = {
  getUsdInrExchangeRate,
};
