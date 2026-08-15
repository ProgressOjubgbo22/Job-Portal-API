const Notification = require("../models/Notification");

/**
 * Creates an in-app notification for a user. Fire-and-forget style but
 * awaited by callers that want to guarantee delivery ordering.
 */
const notifyUser = async ({ user, title, message, type, link }) => {
  try {
    return await Notification.create({ user, title, message, type, link });
  } catch (err) {
    console.error(`Failed to create notification: ${err.message}`);
    return null;
  }
};

module.exports = { notifyUser };
