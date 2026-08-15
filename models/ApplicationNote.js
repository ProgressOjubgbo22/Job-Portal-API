const mongoose = require("mongoose");

// Internal recruiter-only notes attached to an application
const applicationNoteSchema = new mongoose.Schema(
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
    content: { type: String, required: true },
  },
  { timestamps: true }
);

applicationNoteSchema.index({ application: 1 });

module.exports = mongoose.model("ApplicationNote", applicationNoteSchema);
