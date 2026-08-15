const mongoose = require("mongoose");

const recruiterSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    jobTitle: { type: String },
    isOwner: { type: Boolean, default: false }, // first recruiter created for a company
    status: {
      type: String,
      enum: ["active", "suspended", "pending"],
      default: "pending",
    },
  },
  { timestamps: true }
);

recruiterSchema.index({ company: 1 });

module.exports = mongoose.model("Recruiter", recruiterSchema);
