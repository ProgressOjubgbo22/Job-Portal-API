const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const { generateTwoFactorPendingToken } = require("./tokens");

const ISSUER = "Job Portal API";

/**
 * Generates a new TOTP secret plus a QR code (as a data URL) the user can
 * scan with an authenticator app (Google Authenticator, Authy, etc).
 * Returns the base32 secret separately so the caller can store it
 * temporarily until the user confirms setup with a valid code.
 */
const generateTwoFactorSecret = async (accountLabel) => {
  const secret = speakeasy.generateSecret({
    name: `${ISSUER} (${accountLabel})`,
    issuer: ISSUER,
    length: 20,
  });

  const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  return {
    base32Secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrCodeDataUrl,
  };
};

/**
 * Verifies a 6-digit TOTP code against a stored base32 secret. `window: 1`
 * tolerates minor clock drift (accepts the previous/next 30s step too).
 */
const verifyTwoFactorToken = (base32Secret, token) =>
  speakeasy.totp.verify({
    secret: base32Secret,
    encoding: "base32",
    token,
    window: 1,
  });

/**
 * Called by login controllers right after a password check succeeds. If
 * the account has 2FA enabled, returns a payload describing that a second
 * factor is required instead of full access/refresh tokens. Otherwise
 * returns null and the caller proceeds with its normal login flow.
 */
const maybeRequireTwoFactor = (user) => {
  if (!user.twoFactorEnabled) return null;
  const twoFactorToken = generateTwoFactorPendingToken({ id: user._id, role: user.role });
  return { twoFactorRequired: true, twoFactorToken };
};

module.exports = {
  generateTwoFactorSecret,
  verifyTwoFactorToken,
  maybeRequireTwoFactor,
};
