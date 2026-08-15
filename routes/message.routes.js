const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const messageController = require("../controllers/message.controller");
const { sendMessageSchema } = require("../validations/conversation.validation");

router.use(authenticate, authorize("applicant", "recruiter"));

router.get("/unread-count", messageController.getUnreadCount);
router.patch("/read", messageController.markMessagesAsRead);
router.get("/:conversationId", messageController.getMessages);
router.post("/", validate(sendMessageSchema), messageController.sendMessage);
router.patch("/:id", messageController.editMessage);
router.delete("/:id", messageController.deleteMessage);

module.exports = router;
