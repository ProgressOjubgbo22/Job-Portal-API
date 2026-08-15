const mongoose = require("mongoose");

const educationSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicantProfile",
      required: true,
    },
    school: { type: String, required: true, trim: true },
    degree: { type: String, required: true, trim: true },
    fieldOfStudy: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    currentlyStudying: { type: Boolean, default: false },
    grade: { type: String },
  },
  { timestamps: true }
);

educationSchema.index({ applicant: 1 });

module.exports = mongoose.model("Education", educationSchema);
