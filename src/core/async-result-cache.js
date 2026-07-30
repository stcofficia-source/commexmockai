/**
 * Small process-local cache for expensive deterministic-by-input operations.
 * It coalesces identical in-flight work and keeps only short-lived results.
 */
class AsyncResultCache {
  constructor({ ttlMs = 300000, maxEntries = 100 } = {}) {
    this.ttlMs = Math.max(1000, Number(ttlMs) || 300000);
    this.maxEntries = Math.max(1, Number(maxEntries) || 100);
    this.entries = new Map();
    this.inFlight = new Map();
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  async getOrCreate(key, factory) {
    const now = Date.now();
    this.prune(now);

    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      // Refresh insertion order so frequently reused entries remain resident.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { value: cached.value, status: 'hit' };
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return { value: await pending, status: 'shared' };
    }

    const promise = Promise.resolve().then(factory);
    this.inFlight.set(key, promise);
    try {
      const value = await promise;
      this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
      this.prune();
      return { value, status: 'miss' };
    } finally {
      this.inFlight.delete(key);
    }
  }
}

module.exports = AsyncResultCache;
