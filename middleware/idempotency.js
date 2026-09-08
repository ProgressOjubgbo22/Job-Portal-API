const { redisClient } = require("../config/redis");
const logger = require("../config/logger");

/**
 * Idempotency-Key support for POST endpoints that create resources with
 * side effects (e.g. applying to a job, scheduling an interview), so a
 * client retrying a timed-out request (or a double-click) doesn't create a
 * duplicate resource or send duplicate notifications/emails.
 *
 * Usage: client sends an `Idempotency-Key` header (any unique string, e.g.
 * a UUID it generates per user action). If the same key is replayed for the
 * same route, the previously-recorded response is returned as-is instead of
 * re-running the handler.
 *
 * This middleware is opt-in per request: if the header is absent, it's a
 * no-op and the request proceeds normally. This mirrors how idempotency
 * keys work in APIs like Stripe's.
 */
const idempotency = (ttlSeconds = 24 * 60 * 60) => (req, res, next) => {
  const key = req.headers["idempotency-key"];
  if (!key) return next();

  const redisKey = `idempotency:${req.method}:${req.originalUrl}:${key}`;

  (async () => {
    try {
      const existing = await redisClient.get(redisKey);
      if (existing) {
        const { statusCode, body } = JSON.parse(existing);
        res.setHeader("Idempotent-Replay", "true");
        return res.status(statusCode).json(body);
      }

      // Reserve the key so a second, concurrent request with the same key
      // (e.g. a network-retry racing the original) doesn't also proceed
      // to run the handler before the first one has finished.
      const reserved = await redisClient.set(
        redisKey,
        JSON.stringify({ statusCode: 409, body: { success: false, message: "Request already in progress" } }),
        "EX",
        30,
        "NX"
      );

      if (!reserved) {
        return res.status(409).json({
          success: false,
          message: "A request with this idempotency key is already being processed",
        });
      }

      // Wrap res.json so the first real response gets persisted under the
      // key for the full TTL (overwriting the short-lived "in progress"
      // placeholder above), so future replays return it directly.
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        redisClient
          .set(redisKey, JSON.stringify({ statusCode: res.statusCode, body }), "EX", ttlSeconds)
          .catch((err) => logger.warn(`Failed to persist idempotency record for "${redisKey}": ${err.message}`));
        return originalJson(body);
      };

      next();
    } catch (err) {
      // Redis unavailable: fail open rather than blocking the whole API on
      // a caching/idempotency feature being down.
      logger.warn(`Idempotency middleware error (failing open): ${err.message}`);
      next();
    }
  })();
};

module.exports = idempotency;
