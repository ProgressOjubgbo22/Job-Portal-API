const { redisClient } = require("../config/redis");
const logger = require("../config/logger");

const DEFAULT_TTL_SECONDS = 60;

/**
 * Thin JSON cache wrapper around ioredis. Every method fails "open": if
 * Redis is unavailable, callers fall back to hitting the database directly
 * instead of erroring out, since caching is a performance optimization, not
 * a correctness requirement.
 */
const get = async (key) => {
  try {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn(`Cache GET failed for key "${key}": ${err.message}`);
    return null;
  }
};

const set = async (key, value, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  try {
    await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn(`Cache SET failed for key "${key}": ${err.message}`);
  }
};

const del = async (key) => {
  try {
    await redisClient.del(key);
  } catch (err) {
    logger.warn(`Cache DEL failed for key "${key}": ${err.message}`);
  }
};

/**
 * Fetch-through cache: returns the cached value if present, otherwise calls
 * `fetchFn`, caches the result, and returns it.
 */
const getOrSet = async (key, fetchFn, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  const cached = await get(key);
  if (cached !== null) return { data: cached, fromCache: true };

  const fresh = await fetchFn();
  await set(key, fresh, ttlSeconds);
  return { data: fresh, fromCache: false };
};

/**
 * Cache keys for list-style queries (e.g. job search/browse) are namespaced
 * with a version number instead of being deleted individually with pattern
 * matching (KEYS/SCAN in production Redis is best avoided on the hot path).
 * Bumping the version instantly invalidates every previously cached list
 * without having to know each key.
 */
const getNamespaceVersion = async (namespace) => {
  const key = `cache:version:${namespace}`;
  try {
    const version = await redisClient.get(key);
    if (version) return version;

    // Namespace has never been explicitly versioned. Persist the starting
    // value of "1" (instead of only returning it as an in-memory default)
    // so that the first real bumpNamespaceVersion() call reliably produces
    // "2" via INCR, rather than INCR-ing a still-missing key from 0 to 1
    // and landing on the same "1" this fallback already handed out - which
    // would make the very first invalidation silently do nothing.
    await redisClient.set(key, "1", "NX");
    return "1";
  } catch (err) {
    logger.warn(`Cache version lookup failed for "${namespace}": ${err.message}`);
    return "1";
  }
};

const bumpNamespaceVersion = async (namespace) => {
  try {
    await redisClient.incr(`cache:version:${namespace}`);
  } catch (err) {
    logger.warn(`Cache version bump failed for "${namespace}": ${err.message}`);
  }
};

module.exports = {
  get,
  set,
  del,
  getOrSet,
  getNamespaceVersion,
  bumpNamespaceVersion,
  DEFAULT_TTL_SECONDS,
};
