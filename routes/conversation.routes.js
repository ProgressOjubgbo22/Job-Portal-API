const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const conversationController = require("../controllers/conversation.controller");
const {
  startConversationSchema,
  reportConversationSchema,
} = require("../validations/conversation.validation");

router.use(authenticate, authorize("applicant", "recruiter"));

router.get("/", conversationController.getConversations);
router.post("/", validate(startConversationSchema), conversationController.startConversation);
router.get("/:id", conversationController.getConversation);
router.patch("/:id/archive", conversationController.archiveConversation);
router.patch("/:id/unarchive", conversationController.unarchiveConversation);
router.patch("/:id/block", conversationController.blockConversation);
router.post("/:id/report", validate(reportConversationSchema), conversationController.reportConversation);

module.exports = router;
