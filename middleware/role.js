const ApiError = require("../utils/apiError");

// Usage: authorize("admin") or authorize("admin", "recruiter")
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized("Authentication required"));
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden("You do not have permission to perform this action"));
  }
  next();
};

module.exports = authorize;
