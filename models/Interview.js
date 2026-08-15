const mongoose = require("mongoose");

const interviewSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    recruiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recruiter",
      required: true,
    },
    date: { type: Date, required: true },
    // Interviews are always physical per spec
    location: { type: String, required: true },
    status: {
      type: String,
      enum: ["scheduled", "rescheduled", "completed", "cancelled", "no_show"],
      default: "scheduled",
    },
    notes: { type: String },
    outcome: {
      type: String,
      enum: ["passed", "failed", "pending", null],
      default: null,
    },
    outcomeNotes: { type: String },
    reminderSentAt: { type: Date },
  },
  { timestamps: true }
);

interviewSchema.index({ application: 1 }, { unique: true });
interviewSchema.index({ recruiter: 1, date: 1 });

module.exports = mongoose.model("Interview", interviewSchema);
