const mongoose = require("mongoose");

const experienceSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicantProfile",
      required: true,
    },
    company: { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true },
    employmentType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "internship", "temporary", "freelance"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    currentlyWorking: { type: Boolean, default: false },
    description: { type: String },
  },
  { timestamps: true }
);

experienceSchema.index({ applicant: 1 });

module.exports = mongoose.model("Experience", experienceSchema);
