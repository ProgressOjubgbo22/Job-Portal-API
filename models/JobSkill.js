const mongoose = require("mongoose");

// Optional normalized join between Job and the master Skill list.
// The Job model also stores requiredSkills/preferredSkills as plain strings
// for fast filtering; this collection exists for the normalized ERD relation
// and can be used for skill-based analytics.
const jobSkillSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    skill: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", required: true },
  },
  { timestamps: true }
);

jobSkillSchema.index({ job: 1, skill: 1 }, { unique: true });

module.exports = mongoose.model("JobSkill", jobSkillSchema);
