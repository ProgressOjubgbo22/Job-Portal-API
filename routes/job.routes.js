const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const jobController = require("../controllers/job.controller");
const { createJobSchema, updateJobSchema } = require("../validations/job.validation");

// --- Public / applicant browse routes ---
router.get("/", optionalAuthenticate, jobController.browseJobs);
router.get("/search", optionalAuthenticate, jobController.searchJobs);
router.get("/featured", jobController.featuredJobs);
router.get("/latest", jobController.latestJobs);
router.get("/popular", jobController.popularJobs);
router.get("/recommended", authenticate, authorize("applicant"), jobController.recommendedJobs);
router.get("/category/:categoryId", jobController.jobsByCategory);

// --- Recruiter management routes (must come before /:id to avoid conflicts) ---
router.get(
  "/recruiter/mine",
  authenticate,
  authorize("recruiter"),
  jobController.getAllJobsForRecruiter
);
router.post("/", authenticate, authorize("recruiter"), validate(createJobSchema), jobController.createJob);

router.get("/:id", optionalAuthenticate, jobController.getJobDetails);
router.patch("/:id", authenticate, authorize("recruiter"), validate(updateJobSchema), jobController.updateJob);
router.delete("/:id", authenticate, authorize("recruiter"), jobController.deleteJob);

router.patch("/:id/publish", authenticate, authorize("recruiter"), jobController.publishJob);
router.patch("/:id/unpublish", authenticate, authorize("recruiter"), jobController.unpublishJob);
router.patch("/:id/close", authenticate, authorize("recruiter"), jobController.closeJob);
router.patch("/:id/reopen", authenticate, authorize("recruiter"), jobController.reopenJob);
router.patch("/:id/feature", authenticate, authorize("recruiter"), jobController.featureJob);

router.get("/:id/statistics", authenticate, authorize("recruiter"), jobController.jobStatistics);
router.get("/:id/applicants", authenticate, authorize("recruiter"), jobController.getJobApplicants);

router.post("/:id/save", authenticate, authorize("applicant"), jobController.saveJob);
router.delete("/:id/save", authenticate, authorize("applicant"), jobController.unsaveJob);
router.post("/:id/share", jobController.shareJob);

module.exports = router;
