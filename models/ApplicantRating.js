const mongoose = require("mongoose");

// A recruiter's private rating of an applicant (distinct from public Review)
const applicantRatingSchema = new mongoose.Schema(
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
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
  },
  { timestamps: true }
);

applicantRatingSchema.index({ recruiter: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model("ApplicantRating", applicantRatingSchema);
