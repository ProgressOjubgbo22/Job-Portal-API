const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const APPLICATION_STATUSES = [
  "applied",
  "under_review",
  "shortlisted",
  "assessment",
  "interview_scheduled",
  "interview_completed",
  "offer_extended",
  "offer_accepted",
  "offer_declined",
  "hired",
  "rejected",
  "withdrawn",
];

const applicationSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicantProfile",
      required: true,
    },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    resume: { type: String, required: true },
    coverLetter: { type: String },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: "applied",
    },
    appliedAt: { type: Date, default: Date.now },
    withdrawnAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    applicantRatingByRecruiter: { type: Number, min: 1, max: 5 },
  },
  { timestamps: true }
);

applicationSchema.plugin(paginate);
applicationSchema.index({ applicant: 1, job: 1 }, { unique: true });
applicationSchema.index({ job: 1, status: 1 });
applicationSchema.index({ status: 1 });

applicationSchema.statics.STATUSES = APPLICATION_STATUSES;

// Statuses after which the applicant may no longer edit resume/cover letter
applicationSchema.statics.LOCKED_FOR_EDIT_STATUSES = APPLICATION_STATUSES.filter(
  (s) => !["applied"].includes(s)
);

module.exports = mongoose.model("Application", applicationSchema);
