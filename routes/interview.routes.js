const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const idempotency = require("../middleware/idempotency");
const interviewController = require("../controllers/interview.controller");
const {
  scheduleInterviewSchema,
  rescheduleInterviewSchema,
  outcomeSchema,
} = require("../validations/interview.validation");

router.use(authenticate);

router.post(
  "/",
  authorize("recruiter"),
  idempotency(),
  validate(scheduleInterviewSchema),
  interviewController.scheduleInterview
);
router.get("/", authorize("recruiter"), interviewController.getAllInterviews);
router.get("/upcoming", authorize("recruiter"), interviewController.upcomingInterviews);
router.get("/today", authorize("recruiter"), interviewController.todaysInterviews);

router.get("/:id", authorize("recruiter", "applicant"), interviewController.getInterviewDetails);
router.patch("/:id", authorize("recruiter"), interviewController.updateInterview);
router.patch(
  "/:id/reschedule",
  authorize("recruiter"),
  validate(rescheduleInterviewSchema),
  interviewController.rescheduleInterview
);
router.patch("/:id/cancel", authorize("recruiter"), interviewController.cancelInterview);
router.patch("/:id/complete", authorize("recruiter"), interviewController.completeInterview);
router.patch("/:id/outcome", authorize("recruiter"), validate(outcomeSchema), interviewController.recordInterviewOutcome);
router.post("/:id/reminder", authorize("recruiter"), interviewController.sendInterviewReminder);
router.delete("/:id", authorize("recruiter"), interviewController.deleteInterview);

module.exports = router;
