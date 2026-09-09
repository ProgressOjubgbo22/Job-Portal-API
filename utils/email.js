const { emailQueue } = require("../config/queue");
const logger = require("../config/logger");

/**
 * Public email API used throughout the app (controllers/*). The function
 * signatures are unchanged from the original synchronous implementation —
 * only the internals changed: instead of calling nodemailer directly and
 * blocking the request/response cycle on an SMTP round-trip, each call now
 * enqueues a background job (BullMQ, backed by Redis) that a worker process
 * (workers/email.worker.js) picks up, sends, and retries on failure.
 *
 * This means no controller code had to change to get: background
 * processing, automatic retries with backoff, and a durable queue that
 * survives a server restart.
 */
const enqueueEmail = async (type, payload) => {
  try {
    await emailQueue.add(type, payload, {
      jobId: undefined, // let BullMQ generate one; idempotency is handled separately where needed
    });
  } catch (err) {
    // If Redis/the queue is unavailable, don't silently drop the email —
    // fall back to attempting immediate delivery so core flows (register,
    // password reset) still work in a degraded environment.
    logger.error(`Failed to enqueue "${type}" email job, attempting direct send: ${err.message}`);
    const { deliverEmail, EMAIL_BUILDERS } = require("./mailer");
    try {
      const message = EMAIL_BUILDERS[type] ? EMAIL_BUILDERS[type](payload) : payload;
      await deliverEmail(message);
    } catch (sendErr) {
      logger.error(`Direct email fallback also failed for "${type}": ${sendErr.message}`);
    }
  }
};

const sendEmail = ({ to, subject, html, text }) => enqueueEmail("generic", { to, subject, html, text });

const sendVerificationEmail = (to, token) => enqueueEmail("verification", { to, token });

const sendPasswordResetEmail = (to, token) => enqueueEmail("passwordReset", { to, token });

const sendRecruiterInviteEmail = (to, token, companyName) =>
  enqueueEmail("recruiterInvite", { to, token, companyName });

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendRecruiterInviteEmail,
};
