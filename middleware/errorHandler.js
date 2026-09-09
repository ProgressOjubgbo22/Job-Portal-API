const { StatusCodes } = require("http-status-codes");
const ApiError = require("../utils/apiError");
const logger = require("../config/logger");

const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    // Mongoose validation error
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((e) => e.message);
      error = ApiError.badRequest("Validation failed", errors);
    } else if (error.name === "CastError") {
      error = ApiError.badRequest(`Invalid ${error.path}: ${error.value}`);
    } else if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || "field";
      error = ApiError.conflict(`Duplicate value for ${field}`);
    } else if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      error = ApiError.unauthorized("Invalid or expired token");
    } else if (error.name === "MulterError") {
      error = ApiError.badRequest(error.message);
    } else {
      error = new ApiError(
        error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || "Internal Server Error"
      );
    }
  }

  // Always log — not just in development — so failures are captured in
  // logs/error.log (and stdout) regardless of environment. Client (4xx)
  // errors are logged at a lower level than genuine server failures.
  const logLine = `${req.method} ${req.originalUrl} -> ${error.statusCode} ${error.message}`;
  if (error.statusCode >= 500) {
    logger.error(logLine, { stack: err.stack });
  } else {
    logger.warn(logLine);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    errors: error.errors || [],
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { notFoundHandler, errorHandler };
