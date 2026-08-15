const mongoose = require("mongoose");

// Join table: an applicant's chosen skill + proficiency level
const applicantSkillSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicantProfile",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "expert"],
      required: true,
    },
  },
  { timestamps: true }
);

applicantSkillSchema.index({ applicant: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("ApplicantSkill", applicantSkillSchema);
