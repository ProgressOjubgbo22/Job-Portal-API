const mongoose = require("mongoose");
const logger = require("../config/logger");

let warnedNoReplicaSet = false;

const isTransactionUnsupportedError = (err) =>
  err &&
  (err.code === 20 || // IllegalOperation
    /Transaction numbers/i.test(err.message || "") ||
    /replica set/i.test(err.message || "") ||
    /transactions are not supported/i.test(err.message || ""));

/**
 * Runs `fn(session)` inside a MongoDB session/transaction so that multiple
 * writes (e.g. creating an Application, incrementing a Job's counter, and
 * writing a timeline entry) either all succeed or all roll back together.
 *
 * MongoDB transactions require a replica set / mongos, which many local
 * dev setups don't have. Rather than hard-failing the whole feature in
 * that environment, we detect the specific "not supported" error on first
 * use and fall back to running the same steps sequentially without a
 * session (best-effort, logged clearly so it's visible in ops).
 */
const withTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isTransactionUnsupportedError(err)) {
      if (!warnedNoReplicaSet) {
        logger.warn(
          "MongoDB transactions are not supported by this deployment (standalone instance without a replica set). " +
            "Falling back to sequential, non-transactional execution. Use a replica set (e.g. MongoDB Atlas) in production for full atomicity."
        );
        warnedNoReplicaSet = true;
      }
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
};

module.exports = withTransaction;
