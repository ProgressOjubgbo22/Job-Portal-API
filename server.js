require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const logger = require("./config/logger");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    logger.info(`Job Portal API running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
  });

  // Optional convenience for local development: run the BullMQ email
  // worker inside the same process as the API instead of a separate
  // `npm run worker` process. Off by default so production keeps the
  // API and background workers as independent, independently-scalable
  // processes.
  if (process.env.RUN_INLINE_WORKERS === "true") {
    const createEmailWorker = require("./workers/email.worker");
    createEmailWorker();
    logger.info("Inline email worker started (RUN_INLINE_WORKERS=true)");
  }

  process.on("unhandledRejection", (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack });
    server.close(() => process.exit(1));
  });

  process.on("uncaughtException", (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
    server.close(() => process.exit(1));
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    server.close(() => process.exit(0));
  });
};

startServer();
