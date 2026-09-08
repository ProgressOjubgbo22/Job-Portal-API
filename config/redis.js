const Redis = require("ioredis");
const logger = require("./logger");

/**
 * Shared Redis connection used for caching, idempotency keys, and
 * distributed locks. BullMQ queues/workers create their own dedicated
 * connections (see config/queue.js) using the same options, because BullMQ
 * requires `maxRetriesPerRequest: null` on its connections.
 */
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisClient;
let hasWarnedUnavailable = false;

const createClient = (overrides = {}) => {
  const client = new Redis(REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    ...overrides,
  });

  client.on("error", (err) => {
    // Redis is an enhancement (caching, idempotency, locks, queues) — the
    // core API must keep working even if Redis is temporarily unreachable.
    if (!hasWarnedUnavailable) {
      logger.warn(`Redis connection error (features degrading gracefully): ${err.message}`);
      hasWarnedUnavailable = true;
    }
  });

  client.on("connect", () => {
    hasWarnedUnavailable = false;
    logger.info("Connected to Redis");
  });

  return client;
};

redisClient = createClient();

/**
 * BullMQ requires its own ioredis connection(s) with maxRetriesPerRequest
 * set to null (it manages retries/backoff itself via job options).
 * Call this once per Queue/Worker/QueueEvents instance.
 */
const createBullConnection = () =>
  createClient({ maxRetriesPerRequest: null, enableReadyCheck: false });

module.exports = { redisClient, createClient, createBullConnection, REDIS_URL };
