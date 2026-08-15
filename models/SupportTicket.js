const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const supportTicketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ticketNumber: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    category: {
      type: String,
      enum: ["account", "billing", "technical", "job_posting", "application", "other"],
      default: "other",
    },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isDeleted: { type: Boolean, default: false },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

supportTicketSchema.plugin(paginate);
supportTicketSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
