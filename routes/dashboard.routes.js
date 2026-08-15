const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const dashboardController = require("../controllers/dashboard.controller");

router.get("/applicant", authenticate, authorize("applicant"), dashboardController.applicantDashboard);
router.get("/recruiter", authenticate, authorize("recruiter"), dashboardController.recruiterDashboard);
router.get("/admin", authenticate, authorize("admin"), dashboardController.adminDashboard);

module.exports = router;
