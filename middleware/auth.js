const { verifyAccessToken } = require("../utils/tokens");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const User = require("../models/User");

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  const token =
    (header && header.startsWith("Bearer ") && header.split(" ")[1]) ||
    req.cookies?.accessToken;

  if (!token) throw ApiError.unauthorized("Access token is missing");

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw ApiError.unauthorized("Invalid or expired access token");
  }

  const user = await User.findById(decoded.id);
  if (!user) throw ApiError.notFound("User not found");

  if (["suspended", "inactive", "deleted"].includes(user.status)) {
    throw ApiError.forbidden(`Account is ${user.status}`);
  }

  req.user = user;
  next();
});

// Attaches the user if a valid token is present but does not fail if absent.
// Useful for public endpoints with optional personalization.
const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  const token =
    (header && header.startsWith("Bearer ") && header.split(" ")[1]) ||
    req.cookies?.accessToken;

  if (!token) return next();

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    if (user && !["suspended", "inactive", "deleted"].includes(user.status)) {
      req.user = user;
    }
  } catch (err) {
    // ignore invalid token in optional auth
  }
  next();
});

module.exports = { authenticate, optionalAuthenticate };
