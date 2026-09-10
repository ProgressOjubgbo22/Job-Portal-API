const crypto = require("crypto");
const { redisClient } = require("../config/redis");
const logger = require("../config/logger");

// Lua script guarantees a lock is only released by whoever acquired it
// (compare-and-delete), avoiding a slow request releasing a lock that a
// later request already re-acquired.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Simple single-node Redis lock (SET key value NX PX ttl). Good enough to
 * serialize a narrow, short-lived critical section (e.g. "only one request
 * may schedule an interview for this application at a time") across
 * multiple API instances. Not a full Redlock implementation, but adequate
 * for this app's scale and fails safe: if Redis is down, the lock is
 * treated as unavailable and the caller falls back to relying on database
 * constraints (unique indexes) alone.
 */
// Distinguishes "the lock is genuinely held by another request" (a real,
// expected NX failure) from "Redis itself could not be reached" (an
// infrastructure failure). These must NOT be treated the same way by
// callers: the former is a real conflict, the latter should fail open.
const LOCK_UNAVAILABLE = Symbol("lock_unavailable");

const acquireLock = async (key, ttlMs = 5000) => {
  const token = crypto.randomBytes(16).toString("hex");
  try {
    const result = await redisClient.set(key, token, "PX", ttlMs, "NX");
    return result === "OK" ? token : null;
  } catch (err) {
    logger.warn(`Lock acquisition failed for "${key}" (Redis unavailable): ${err.message}`);
    return LOCK_UNAVAILABLE;
  }
};

const releaseLock = async (key, token) => {
  if (!token || token === LOCK_UNAVAILABLE) return;
  try {
    await redisClient.eval(RELEASE_SCRIPT, 1, key, token);
  } catch (err) {
    logger.warn(`Lock release failed for "${key}": ${err.message}`);
  }
};

/**
 * Runs `fn` while holding the lock for `key`.
 *
 * Returns `{ locked: false }` only when the lock is genuinely held by
 * another in-flight request (a real conflict the caller should reject).
 * If Redis itself is unreachable, this fails OPEN - `fn` still runs (with
 * `degraded: true` on the result) so a Redis outage can never block every
 * write in the app; database-level constraints (unique indexes) remain the
 * final backstop against duplicates in that scenario.
 */
const withLock = async (key, ttlMs, fn) => {
  const token = await acquireLock(key, ttlMs);

  if (token === LOCK_UNAVAILABLE) {
    const result = await fn();
    return { locked: true, degraded: true, result };
  }

  if (!token) return { locked: false, result: undefined };

  try {
    const result = await fn();
    return { locked: true, result };
  } finally {
    await releaseLock(key, token);
  }
};

module.exports = { acquireLock, releaseLock, withLock };
