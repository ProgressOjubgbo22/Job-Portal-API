const { Worker } = require("bullmq");
const { createBullConnection } = require("../config/redis");
const { QUEUE_NAMES } = require("../config/queue");
const { deliverEmail, EMAIL_BUILDERS } = require("../utils/mailer");
const logger = require("../config/logger");

/**
 * Processes jobs added to the "email" queue by utils/email.js. Each job's
 * `name` is the email type (generic/verification/passwordReset/
 * recruiterInvite) and `data` is the payload needed to build the message.
 */
const processor = async (job) => {
  const builder = EMAIL_BUILDERS[job.name] || EMAIL_BUILDERS.generic;
  const message = builder(job.data);
  await deliverEmail(message);
};

const createEmailWorker = () => {
  const worker = new Worker(QUEUE_NAMES.EMAIL, processor, {
    connection: createBullConnection(),
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    logger.info(`[email worker] Job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    logger.error(
      `[email worker] Job ${job?.id} (${job?.name}) failed (attempt ${job?.attemptsMade}): ${err.message}`
    );
  });

  worker.on("error", (err) => {
    logger.error(`[email worker] Worker error: ${err.message}`);
  });

  return worker;
};

module.exports = createEmailWorker;
