const mongoose = require("mongoose");

const applicantProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    professionalHeadline: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 2000 },
    profilePicture: { type: String, default: null },
    profilePicturePublicId: { type: String, select: false },

    resume: { type: String, default: null },
    resumePublicId: { type: String, select: false },

    state: { type: String },
    city: { type: String },
    address: { type: String },

    currentJobTitle: { type: String },
    yearsOfExperience: { type: Number, min: 0 },
    employmentStatus: {
      type: String,
      enum: ["employed", "unemployed", "self-employed", "student", "freelancer"],
    },
    preferredWorkMode: {
      type: String,
      enum: ["remote", "on-site", "hybrid"],
    },
    preferredJobType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "internship", "temporary"],
    },
    expectedSalary: { type: Number, min: 0 },

    portfolio: { type: String },
    linkedin: { type: String },
    github: { type: String },

    profileCompletion: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApplicantProfile", applicantProfileSchema);
