const AuditLog = require("../models/AuditLog");

/**
 * Fire-and-forget audit log writer. Never throws so it can't break the
 * primary request flow.
 */
const logAction = async ({ req, action, entity, entityId, description }) => {
  try {
    await AuditLog.create({
      user: req.user?._id,
      role: req.user?.role,
      action,
      entity,
      entityId,
      description,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
    });
  } catch (err) {
    console.error(`Failed to write audit log: ${err.message}`);
  }
};

module.exports = { logAction };
