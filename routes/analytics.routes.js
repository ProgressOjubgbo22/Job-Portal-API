const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const analyticsController = require("../controllers/analytics.controller");

router.use(authenticate);

router.get("/jobs", authorize("recruiter", "admin"), analyticsController.jobAnalytics);
router.get("/applications", authorize("recruiter", "admin"), analyticsController.applicationAnalytics);
router.get("/interviews", authorize("recruiter", "admin"), analyticsController.interviewAnalytics);
router.get("/recruitment", authorize("recruiter", "admin"), analyticsController.recruitmentAnalytics);
router.get("/users", authorize("admin"), analyticsController.userAnalytics);
router.get("/companies", authorize("admin"), analyticsController.companyAnalytics);

module.exports = router;
