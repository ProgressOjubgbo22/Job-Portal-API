const { z } = require("zod");

const registerSchema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  phoneNumber: z.string().min(7).max(20),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(["male", "female", "other"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(10),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(72),
});

const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

const twoFactorTokenSchema = z.object({
  token: z.string().length(6),
});

const disableTwoFactorSchema = z.object({
  password: z.string().min(1).optional(),
  token: z.string().length(6).optional(),
});

const twoFactorLoginVerifySchema = z.object({
  twoFactorToken: z.string().min(10),
  token: z.string().length(6),
});

module.exports = {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  changePasswordSchema,
  twoFactorTokenSchema,
  disableTwoFactorSchema,
  twoFactorLoginVerifySchema,
};
