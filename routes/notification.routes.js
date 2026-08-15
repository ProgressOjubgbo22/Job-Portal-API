const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const notificationController = require("../controllers/notification.controller");

router.use(authenticate);

router.get("/", notificationController.getMyNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.delete("/", notificationController.deleteAllNotifications);
router.get("/:id", notificationController.getNotificationDetails);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;
