const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Notification = require("../models/Notification");
const { getPaginationOptions } = require("../utils/pagination");

// GET /api/notifications
const getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, sort } = getPaginationOptions(req.query);
  const filter = { user: req.user._id };
  if (req.query.isRead !== undefined) filter.isRead = req.query.isRead === "true";
  if (req.query.type) filter.type = req.query.type;

  const notifications = await Notification.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await Notification.countDocuments(filter);

  return new ApiResponse(200, { notifications, total, page, limit }).send(res);
});

// GET /api/notifications/:id
const getNotificationDetails = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw ApiError.notFound("Notification not found");
  if (String(notification.user) !== String(req.user._id)) {
    throw ApiError.forbidden("You do not have access to this notification");
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return new ApiResponse(200, { notification }).send(res);
});

// PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw ApiError.notFound("Notification not found");
  if (String(notification.user) !== String(req.user._id)) {
    throw ApiError.forbidden("You do not have access to this notification");
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return new ApiResponse(200, { notification }, "Notification marked as read").send(res);
});

// PATCH /api/notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return new ApiResponse(200, { modifiedCount: result.modifiedCount }, "All notifications marked as read").send(res);
});

// DELETE /api/notifications/:id
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw ApiError.notFound("Notification not found");
  if (String(notification.user) !== String(req.user._id)) {
    throw ApiError.forbidden("You do not have access to this notification");
  }

  await notification.deleteOne();
  return new ApiResponse(200, null, "Notification deleted").send(res);
});

// DELETE /api/notifications
const deleteAllNotifications = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id });
  if (count === 0) throw ApiError.notFound("No notifications found");

  const result = await Notification.deleteMany({ user: req.user._id });
  return new ApiResponse(200, { deletedCount: result.deletedCount }, "All notifications deleted").send(res);
});

// GET /api/notifications/unread-count
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
  return new ApiResponse(200, { unreadCount: count }).send(res);
});

module.exports = {
  getMyNotifications,
  getNotificationDetails,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  getUnreadCount,
};
