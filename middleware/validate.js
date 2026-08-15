const ApiError = require("../utils/apiError");

/**
 * Validates req.body / req.query / req.params against a zod schema.
 * Usage: validate(schema) or validate(schema, "query")
 */
const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const errors = result.error.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    return next(ApiError.badRequest("Validation failed", errors));
  }
  req[source] = result.data;
  next();
};

module.exports = validate;
