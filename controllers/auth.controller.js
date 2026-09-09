const { OAuth2Client } = require("google-auth-library");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const User = require("../models/User");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
  cookieOptions,
} = require("../utils/tokens");
const {
  generateTwoFactorSecret,
  verifyTwoFactorToken,
  maybeRequireTwoFactor,
} = require("../utils/twoFactor");
const { verifyTwoFactorPendingToken } = require("../utils/tokens");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../utils/email");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const issueTokens = async (user) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  user.refreshToken = refreshToken;
  await user.save();
  return { accessToken, refreshToken };
};

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, phoneNumber, email, password, dateOfBirth, gender } = req.body;

  const existingEmail = await User.findOne({ email });
  if (existingEmail) throw ApiError.conflict("Email already registered");

  const existingPhone = await User.findOne({ phoneNumber });
  if (existingPhone) throw ApiError.conflict("Phone number already registered");

  const tempUser = new User({ dateOfBirth });
  if (!tempUser.isAdult()) {
    throw ApiError.badRequest("You must be at least 18 years old to register");
  }

  const user = await User.create({
    firstName,
    lastName,
    phoneNumber,
    email,
    password,
    dateOfBirth,
    gender,
    role: "applicant",
  });

  const verificationToken = generateRandomToken();
  user.emailVerificationTokenHash = hashToken(verificationToken);
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  await user.save();

  await sendVerificationEmail(user.email, verificationToken);

  return new ApiResponse(
    201,
    { user: user.toSafeObject() },
    "Registration successful. Please check your email to verify your account."
  ).send(res);
});

// POST /api/auth/google
const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw ApiError.unauthorized("Invalid Google ID token");
  }

  const { sub: googleId, email, given_name, family_name } = payload;

  let user = await User.findOne({ $or: [{ googleId }, { email }] });
  let statusCode = 200;

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }
  } else {
    user = await User.create({
      firstName: given_name || "User",
      lastName: family_name || "",
      email,
      googleId,
      role: "applicant",
      emailVerified: true,
      dateOfBirth: null,
    });
    statusCode = 201;
  }

  if (["suspended", "inactive", "deleted"].includes(user.status)) {
    throw ApiError.forbidden(`Account is ${user.status}`);
  }

  const { accessToken, refreshToken } = await issueTokens(user);
  res.cookie("refreshToken", refreshToken, cookieOptions());

  return new ApiResponse(
    statusCode,
    { user: user.toSafeObject(), accessToken, refreshToken },
    "Authenticated with Google"
  ).send(res);
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, role: "applicant" }).select("+password");
  if (!user) throw ApiError.unauthorized("Invalid email or password");

  if (["suspended", "inactive", "deleted"].includes(user.status)) {
    throw ApiError.forbidden(`Account is ${user.status}`);
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) throw ApiError.unauthorized("Invalid email or password");

  if (!user.emailVerified) {
    throw ApiError.forbidden("Please verify your email before logging in");
  }

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

// POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw ApiError.notFound("No account found with that email");

  const resetToken = generateRandomToken();
  user.passwordResetTokenHash = hashToken(resetToken);
  user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save();

  await sendPasswordResetEmail(user.email, resetToken);

  return new ApiResponse(200, null, "Password reset email sent").send(res);
});

// POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  const tokenHash = hashToken(token);

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: Date.now() },
  }).select("+passwordResetTokenHash +passwordResetExpires");

  if (!user) throw ApiError.badRequest("Invalid or expired reset token");

  user.password = newPassword;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = undefined;
  await user.save();

  return new ApiResponse(200, null, "Password reset successful").send(res);
});

// POST /api/auth/verify-email
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const tokenHash = hashToken(token);

  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
  }).select("+emailVerificationTokenHash +emailVerificationExpires");

  if (!user) throw ApiError.badRequest("Invalid verification token");
  if (user.emailVerificationExpires < Date.now()) {
    throw ApiError.badRequest("Verification token has expired");
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  return new ApiResponse(200, null, "Email verified successfully").send(res);
});

// POST /api/auth/resend-verification
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw ApiError.notFound("No account found with that email");
  if (user.emailVerified) throw ApiError.badRequest("Email is already verified");

  const verificationToken = generateRandomToken();
  user.emailVerificationTokenHash = hashToken(verificationToken);
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  await user.save();

  await sendVerificationEmail(user.email, verificationToken);

  return new ApiResponse(200, null, "Verification email resent").send(res);
});

// POST /api/auth/refresh-token
const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body.refreshToken;
  if (!token) throw ApiError.unauthorized("Refresh token is missing");

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.id).select("+refreshToken");
  if (!user || user.refreshToken !== token) {
    throw ApiError.unauthorized("Refresh token does not match");
  }

  if (["suspended", "inactive", "deleted"].includes(user.status)) {
    throw ApiError.forbidden(`Account is ${user.status}`);
  }

  const { accessToken, refreshToken: newRefreshToken } = await issueTokens(user);
  res.cookie("refreshToken", newRefreshToken, cookieOptions());

  return new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }).send(res);
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body.refreshToken;
  if (!token) throw ApiError.unauthorized("Refresh token is missing");

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.id).select("+refreshToken");
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }
  } catch (err) {
    // token already invalid/expired - proceed to clear cookie regardless
  }

  res.clearCookie("refreshToken", cookieOptions());
  return new ApiResponse(200, null, "Logged out successfully").send(res);
});

// PATCH /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password +refreshToken");
  if (!user) throw ApiError.notFound("User not found");

  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) throw ApiError.unauthorized("Current password is incorrect");

  if (currentPassword === newPassword) {
    throw ApiError.badRequest("New password must be different from current password");
  }

  user.password = newPassword;
  user.refreshToken = undefined;
  await user.save();

  return new ApiResponse(200, null, "Password changed successfully").send(res);
});

// DELETE /api/auth/delete-account
const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound("User not found");
  if (user.status === "deleted") throw ApiError.badRequest("Account already deleted");

  user.status = "deleted";
  user.refreshToken = undefined;
  await user.save();

  res.clearCookie("refreshToken", cookieOptions());
  return new ApiResponse(200, null, "Account deleted successfully").send(res);
});

// GET /api/auth/me (helper - not strictly listed but commonly needed)
const getCurrentUser = asyncHandler(async (req, res) => {
  return new ApiResponse(200, { user: req.user.toSafeObject() }).send(res);
});

// --- Two-factor authentication (TOTP) ---
// These endpoints are role-agnostic: applicant, recruiter, and admin
// accounts all live on the same User model, so one implementation covers
// 2FA setup/verification for every login flow (auth/recruiterAuth/adminAuth
// controllers all just call maybeRequireTwoFactor() after password checks).

// POST /api/auth/2fa/setup (authenticated)
// Generates a new TOTP secret + QR code. The secret is stored as "temp"
// until confirmed via /2fa/verify, so a half-finished setup never silently
// enables 2FA or locks the user out.
const setupTwoFactor = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound("User not found");
  if (user.twoFactorEnabled) throw ApiError.badRequest("Two-factor authentication is already enabled");

  const { base32Secret, otpauthUrl, qrCodeDataUrl } = await generateTwoFactorSecret(user.email);
  user.twoFactorTempSecret = base32Secret;
  await user.save();

  return new ApiResponse(
    200,
    { qrCode: qrCodeDataUrl, otpauthUrl, secret: base32Secret },
    "Scan the QR code with your authenticator app, then confirm with a 6-digit code"
  ).send(res);
});

// POST /api/auth/2fa/verify (authenticated) - confirms setup
const verifyTwoFactorSetup = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findById(req.user._id).select("+twoFactorTempSecret");
  if (!user) throw ApiError.notFound("User not found");
  if (!user.twoFactorTempSecret) {
    throw ApiError.badRequest("No two-factor setup is in progress. Call /2fa/setup first");
  }

  const isValid = verifyTwoFactorToken(user.twoFactorTempSecret, token);
  if (!isValid) throw ApiError.badRequest("Invalid or expired authentication code");

  user.twoFactorSecret = user.twoFactorTempSecret;
  user.twoFactorTempSecret = undefined;
  user.twoFactorEnabled = true;
  await user.save();

  return new ApiResponse(200, null, "Two-factor authentication enabled").send(res);
});

// POST /api/auth/2fa/disable (authenticated)
const disableTwoFactor = asyncHandler(async (req, res) => {
  const { password, token } = req.body;
  const user = await User.findById(req.user._id).select("+password +twoFactorSecret");
  if (!user) throw ApiError.notFound("User not found");
  if (!user.twoFactorEnabled) throw ApiError.badRequest("Two-factor authentication is not enabled");

  // Google-authenticated accounts may have no password set - require a
  // valid current TOTP code instead in that case.
  if (user.password) {
    const validPassword = await user.comparePassword(password);
    if (!validPassword) throw ApiError.unauthorized("Incorrect password");
  } else {
    if (!token || !verifyTwoFactorToken(user.twoFactorSecret, token)) {
      throw ApiError.unauthorized("Invalid or expired authentication code");
    }
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  user.twoFactorTempSecret = undefined;
  await user.save();

  return new ApiResponse(200, null, "Two-factor authentication disabled").send(res);
});

// POST /api/auth/2fa/login-verify (public) - completes a login that was
// paused by maybeRequireTwoFactor(), for any role.
const completeTwoFactorLogin = asyncHandler(async (req, res) => {
  const { twoFactorToken, token } = req.body;
  if (!twoFactorToken || !token) {
    throw ApiError.badRequest("twoFactorToken and token are required");
  }

  let decoded;
  try {
    decoded = verifyTwoFactorPendingToken(twoFactorToken);
  } catch (err) {
    throw ApiError.unauthorized("Invalid or expired two-factor session, please log in again");
  }

  const user = await User.findById(decoded.id).select("+twoFactorSecret +refreshToken");
  if (!user) throw ApiError.notFound("User not found");
  if (!user.twoFactorEnabled) throw ApiError.badRequest("Two-factor authentication is not enabled for this account");
  if (["suspended", "inactive", "deleted"].includes(user.status)) {
    throw ApiError.forbidden(`Account is ${user.status}`);
  }

  const isValid = verifyTwoFactorToken(user.twoFactorSecret, token);
  if (!isValid) throw ApiError.unauthorized("Invalid or expired authentication code");

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

module.exports = {
  register,
  googleAuth,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  refreshToken,
  logout,
  changePassword,
  deleteAccount,
  getCurrentUser,
  setupTwoFactor,
  verifyTwoFactorSetup,
  disableTwoFactor,
  completeTwoFactorLogin,
};
