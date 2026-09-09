const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const User = require("../models/User");
const Recruiter = require("../models/Recruiter");
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  cookieOptions,
} = require("../utils/tokens");
const { maybeRequireTwoFactor } = require("../utils/twoFactor");

const issueTokens = async (user) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  user.refreshToken = refreshToken;
  await user.save();
  return { accessToken, refreshToken };
};

// POST /api/recruiters/auth/accept-invitation
const acceptInvitation = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const tokenHash = hashToken(token);

  const user = await User.findOne({
    invitationTokenHash: tokenHash,
    role: "recruiter",
  }).select("+invitationTokenHash +invitationExpires");

  if (!user) throw ApiError.badRequest("Invalid invitation token");
  if (user.invitationExpires < Date.now()) {
    throw ApiError.badRequest("Invitation link has expired");
  }
  if (user.invitationAccepted) {
    throw ApiError.badRequest("Invitation has already been accepted");
  }

  user.password = password;
  user.invitationAccepted = true;
  user.emailVerified = true;
  user.invitationTokenHash = undefined;
  user.invitationExpires = undefined;
  await user.save();

  await Recruiter.findOneAndUpdate({ user: user._id }, { status: "active" });

  const { accessToken, refreshToken } = await issueTokens(user);
  res.cookie("refreshToken", refreshToken, cookieOptions());

  return new ApiResponse(
    200,
    { user: user.toSafeObject(), accessToken, refreshToken },
    "Invitation accepted. Account activated."
  ).send(res);
});

// POST /api/recruiters/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, role: "recruiter" }).select("+password");
  if (!user) throw ApiError.unauthorized("Invalid email or password");

  if (["suspended", "inactive", "deleted"].includes(user.status)) {
    throw ApiError.forbidden(`Account is ${user.status}`);
  }
  if (!user.invitationAccepted) {
    throw ApiError.forbidden("Please accept your invitation and set a password first");
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) throw ApiError.unauthorized("Invalid email or password");

  const twoFactorChallenge = maybeRequireTwoFactor(user);
  if (twoFactorChallenge) {
    return new ApiResponse(200, twoFactorChallenge, "Two-factor authentication code required").send(res);
  }

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

// GET /api/recruiters/auth/me
const getCurrentRecruiter = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id }).populate("company");
  return new ApiResponse(200, { user: req.user.toSafeObject(), recruiter }).send(res);
});

module.exports = { acceptInvitation, login, getCurrentRecruiter };
