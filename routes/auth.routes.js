const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authController = require("../controllers/auth.controller");
const {
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
} = require("../validations/auth.validation");

router.post("/register", validate(registerSchema), authController.register);
router.post("/google", validate(googleAuthSchema), authController.googleAuth);
router.post("/login", validate(loginSchema), authController.login);
router.post("/forgot-password", validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);
router.post("/verify-email", validate(verifyEmailSchema), authController.verifyEmail);
router.post("/resend-verification", validate(resendVerificationSchema), authController.resendVerification);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", authController.logout);
router.patch("/change-password", authenticate, validate(changePasswordSchema), authController.changePassword);
router.delete("/delete-account", authenticate, authController.deleteAccount);
router.get("/me", authenticate, authController.getCurrentUser);

// --- Two-factor authentication (applies to applicant/recruiter/admin alike) ---
router.post("/2fa/setup", authenticate, authController.setupTwoFactor);
router.post("/2fa/verify", authenticate, validate(twoFactorTokenSchema), authController.verifyTwoFactorSetup);
router.post("/2fa/disable", authenticate, validate(disableTwoFactorSchema), authController.disableTwoFactor);
router.post("/2fa/login-verify", validate(twoFactorLoginVerifySchema), authController.completeTwoFactorLogin);

module.exports = router;
