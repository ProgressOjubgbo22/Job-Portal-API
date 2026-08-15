const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
    },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

supportMessageSchema.index({ ticket: 1, createdAt: 1 });

module.exports = mongoose.model("SupportMessage", supportMessageSchema);
