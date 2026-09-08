/**
 * Background job worker process. Runs separately from the HTTP API server
 * (`npm run worker` alongside `npm start`), consuming jobs enqueued onto
 * BullMQ queues (currently: email delivery). Kept as its own process so a
 * slow/failing SMTP provider can never block or crash API request handling.
 *
 * For local development convenience, the API server can also start these
 * workers in-process by setting RUN_INLINE_WORKERS=true — see server.js.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const logger = require("../config/logger");
const createEmailWorker = require("./email.worker");

const startWorkers = async () => {
  // The email worker only needs Mongo if a job handler ever needs to look
  // up records; the current email jobs are self-contained, but we connect
  // anyway so future job types can query the DB without extra wiring.
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  const emailWorker = createEmailWorker();
  logger.info("Email worker started and listening for jobs");

  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down workers gracefully...`);
    await emailWorker.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return { emailWorker };
};

if (require.main === module) {
  startWorkers().catch((err) => {
    logger.error(`Failed to start workers: ${err.message}`);
    process.exit(1);
  });
}

module.exports = startWorkers;
