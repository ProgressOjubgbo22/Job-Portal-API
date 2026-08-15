const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

// Recruiters bookmarking applicants for later
const savedApplicantSchema = new mongoose.Schema(
  {
    recruiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recruiter",
      required: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicantProfile",
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

savedApplicantSchema.index({ recruiter: 1, applicant: 1 }, { unique: true });
savedApplicantSchema.plugin(paginate);

module.exports = mongoose.model("SavedApplicant", savedApplicantSchema);
