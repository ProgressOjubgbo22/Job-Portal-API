const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });

const generateRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

// Generic random token generator used for email verification / password reset
const generateRandomToken = () => crypto.randomBytes(32).toString("hex");

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
});

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
  cookieOptions,
};
