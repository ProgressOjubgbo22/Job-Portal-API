const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const idempotency = require("../middleware/idempotency");
const applicationController = require("../controllers/application.controller");
const recruiterController = require("../controllers/recruiter.controller");
const {
  applySchema,
  updateStatusSchema,
  coverLetterSchema,
} = require("../validations/application.validation");

router.use(authenticate);

// Applicant routes
router.post(
  "/",
  authorize("applicant"),
  idempotency(),
  validate(applySchema),
  applicationController.applyForJob
);
router.get("/", authorize("applicant"), applicationController.getMyApplications);
router.get("/drafts", authorize("applicant"), applicationController.getDraftApplications);
router.get("/:id", authorize("applicant"), applicationController.getApplicationDetails);
router.patch("/:id/withdraw", authorize("applicant"), applicationController.withdrawApplication);
router.delete("/:id", authorize("applicant"), applicationController.deleteWithdrawnApplication);
router.get("/:id/timeline", authorize("applicant"), applicationController.getApplicationTimeline);
router.patch("/:id/resume", authorize("applicant"), applicationController.updateApplicationResume);
router.patch("/:id/cover-letter", authorize("applicant"), validate(coverLetterSchema), applicationController.updateCoverLetter);

// Recruiter routes
router.patch(
  "/:id/status",
  authorize("recruiter"),
  validate(updateStatusSchema),
  applicationController.updateApplicationStatus
);
router.get("/:id/notes", authorize("recruiter"), recruiterController.getApplicationNotes);
router.post("/:id/note", authorize("recruiter"), recruiterController.addApplicationNote);
router.get("/export/all", authorize("recruiter"), recruiterController.exportApplicants);

module.exports = router;
