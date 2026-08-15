const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const User = require("../models/User");
const {
  generateAccessToken,
  generateRefreshToken,
  cookieOptions,
} = require("../utils/tokens");

const issueTokens = async (user) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  user.refreshToken = refreshToken;
  await user.save();
  return { accessToken, refreshToken };
};

// POST /api/admin/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, role: "admin" }).select("+password");
  if (!user) throw ApiError.unauthorized("Invalid email or password");

  if (["suspended", "inactive", "deleted"].includes(user.status)) {
    throw ApiError.forbidden(`Account is ${user.status}`);
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) throw ApiError.unauthorized("Invalid email or password");

  const { accessToken, refreshToken } = await issueTokens(user);
  user.lastLogin = new Date();
  await user.save();

  res.cookie("refreshToken", refreshToken, cookieOptions());

  return new ApiResponse(
    200,
    { user: user.toSafeObject(), accessToken, refreshToken },
    "Login successful"
  ).send(res);
});

// GET /api/admin/auth/me
const getCurrentAdmin = asyncHandler(async (req, res) => {
  return new ApiResponse(200, { user: req.user.toSafeObject() }).send(res);
});

module.exports = { login, getCurrentAdmin };
