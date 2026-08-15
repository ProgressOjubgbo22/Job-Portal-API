const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const recruiterAuthController = require("../controllers/recruiterAuth.controller");
const recruiterController = require("../controllers/recruiter.controller");
const jobController = require("../controllers/job.controller");
const applicationController = require("../controllers/application.controller");
const {
  acceptInvitationSchema,
  recruiterLoginSchema,
} = require("../validations/recruiter.validation");

// --- Auth ---
router.post("/auth/accept-invitation", validate(acceptInvitationSchema), recruiterAuthController.acceptInvitation);
router.post("/auth/login", validate(recruiterLoginSchema), recruiterAuthController.login);
router.get("/auth/me", authenticate, authorize("recruiter"), recruiterAuthController.getCurrentRecruiter);

// // --- Applicant management (scoped to recruiter's company) ---
router.use(authenticate, authorize("recruiter"));

router.get("/applicants", recruiterController.getAllApplicants);
router.get("/applicants/saved", recruiterController.getSavedApplicants);
router.post("/applicants/:id/save", recruiterController.saveApplicant);
router.delete("/applicants/:id/save", recruiterController.removeSavedApplicant);
router.post("/applicants/:id/rating", recruiterController.rateApplicant);

router.get("/jobs/:id/applicants", jobController.getJobApplicants);

router.patch("/applications/:id/status", applicationController.updateApplicationStatus);
router.post("/applications/:id/note", recruiterController.addApplicationNote);

router.patch("/notes/:id", recruiterController.updateApplicationNote);
router.delete("/notes/:id", recruiterController.deleteApplicationNote);

module.exports = router;
