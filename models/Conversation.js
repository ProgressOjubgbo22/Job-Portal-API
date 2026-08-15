const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recruiter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    status: {
      type: String,
      enum: ["active", "archived", "blocked"],
      default: "active",
    },
    archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ applicant: 1, recruiter: 1, application: 1 }, { unique: true });
conversationSchema.index({ applicant: 1, lastMessageAt: -1 });
conversationSchema.index({ recruiter: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
