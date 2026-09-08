const { Queue, QueueEvents } = require("bullmq");
const { createBullConnection } = require("./redis");
const logger = require("./logger");

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
  removeOnFail: { count: 5000 },
};

const QUEUE_NAMES = {
  EMAIL: "email",
};

const queues = {};
const queueEvents = {};

const getQueue = (name) => {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: createBullConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return queues[name];
};

/**
 * Lazily attaches a QueueEvents listener (separate Redis connection) so
 * job failures/retries/completions are logged centrally via winston,
 * regardless of which process enqueued the job.
 */
const getQueueEvents = (name) => {
  if (!queueEvents[name]) {
    const events = new QueueEvents(name, { connection: createBullConnection() });

    events.on("failed", ({ jobId, failedReason }) => {
      logger.error(`[queue:${name}] Job ${jobId} failed: ${failedReason}`);
    });

    events.on("stalled", ({ jobId }) => {
      logger.warn(`[queue:${name}] Job ${jobId} stalled and will be retried`);
    });

    queueEvents[name] = events;
  }
  return queueEvents[name];
};

const emailQueue = getQueue(QUEUE_NAMES.EMAIL);

// Start listening for lifecycle events immediately so failures are always
// logged, even if nothing else calls getQueueEvents().
getQueueEvents(QUEUE_NAMES.EMAIL);

module.exports = {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  getQueue,
  getQueueEvents,
  emailQueue,
};
