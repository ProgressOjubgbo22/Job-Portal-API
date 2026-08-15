const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    role: { type: String },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    description: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.plugin(paginate);
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
