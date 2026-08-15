const mongoose = require("mongoose");

const applicationTimelineSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    status: { type: String, required: true },
    note: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

applicationTimelineSchema.index({ application: 1, createdAt: 1 });

module.exports = mongoose.model("ApplicationTimeline", applicationTimelineSchema);
