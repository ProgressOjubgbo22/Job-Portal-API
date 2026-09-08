const winston = require("winston");
const path = require("path");

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${ts}] ${level}: ${stack || message}${metaStr}`;
  })
);

const fileFormat = combine(timestamp(), errors({ stack: true }), json());

const transports = [
  new winston.transports.Console({
    silent: isTest,
    format: consoleFormat,
  }),
];

// File transports give us a persistent trail of failures for background
// jobs / queue workers, independent of whatever is capturing stdout.
if (!isTest) {
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, "..", "logs", "error.log"),
      level: "error",
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "..", "logs", "combined.log"),
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  defaultMeta: { service: "job-portal-api" },
  transports,
  exitOnError: false,
});

// Stream adapter so morgan (HTTP access logging, already used in app.js) can
// pipe its output through the same winston transports instead of raw stdout.
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
