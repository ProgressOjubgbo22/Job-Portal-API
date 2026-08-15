const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
      // Not globally unique across roles created by admin without a phone,
      // but unique per applicant self-registration is enforced in controller.
    },
    password: { type: String, select: false },
    googleId: { type: String, default: null },
    dateOfBirth: { type: Date },
    gender: {
      type: String,
      enum: ["male", "female", "other", null],
      default: null,
    },
    role: {
      type: String,
      enum: ["applicant", "recruiter", "admin"],
      required: true,
      default: "applicant",
    },
    status: {
      type: String,
      enum: ["active", "suspended", "inactive", "deleted"],
      default: "active",
    },
    emailVerified: { type: Boolean, default: false },
    profileCompleted: { type: Boolean, default: false },
    lastLogin: { type: Date },
    refreshToken: { type: String, select: false },

    // Email verification
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },

    // Password reset
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Recruiter invitation (used before "Set Password")
    invitationTokenHash: { type: String, select: false },
    invitationExpires: { type: Date, select: false },
    invitationAccepted: { type: Boolean, default: false },

    suspensionReason: { type: String },
    suspendedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isAdult = function () {
  if (!this.dateOfBirth) return false;
  const today = new Date();
  const dob = new Date(this.dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 18;
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.emailVerificationTokenHash;
  delete obj.passwordResetTokenHash;
  delete obj.invitationTokenHash;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
