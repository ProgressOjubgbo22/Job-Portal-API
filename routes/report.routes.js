const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const reportController = require("../controllers/report.controller");

router.use(authenticate);

router.get("/users", authorize("admin"), reportController.userReport);
router.get("/jobs", authorize("admin"), reportController.jobReport);
router.get("/applications", authorize("admin", "recruiter"), reportController.applicationReport);
router.get("/companies", authorize("admin"), reportController.companyReport);
router.get("/recruiters", authorize("admin"), reportController.recruiterReport);
router.get("/export", authorize("admin"), reportController.exportReport);

module.exports = router;
