const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { uploadImage, uploadResume } = require("../middleware/upload");
const applicantController = require("../controllers/applicant.controller");
const jobController = require("../controllers/job.controller");
const { profileSchema } = require("../validations/applicant.validation");

// Public profile view is accessible to both applicants and recruiters
router.get("/:id", authenticate, authorize("applicant", "recruiter"), applicantController.getPublicProfile);

router.use(authenticate, authorize("applicant"));

router.get("/me", applicantController.getMyProfile);
router.post("/profile", validate(profileSchema), applicantController.createProfile);
router.patch("/profile", validate(profileSchema), applicantController.updateProfile);
router.get("/profile/completion", applicantController.getProfileCompletion);

router.post("/profile-picture", uploadImage.single("image"), applicantController.uploadProfilePicture);
router.delete("/profile-picture", applicantController.deleteProfilePicture);

router.post("/resume", uploadResume.single("resume"), applicantController.uploadResume);
router.patch("/resume", uploadResume.single("resume"), applicantController.replaceResume);
router.delete("/resume", applicantController.deleteResume);

router.get("/saved-jobs", jobController.getSavedJobs);

module.exports = router;
