const router = require("express").Router();

router.use("/auth", require("./auth.routes"));
router.use("/applicants", require("./applicant.routes"));
router.use("/educations", require("./education.routes"));
router.use("/experiences", require("./experience.routes"));
router.use("/skills", require("./skill.routes"));
router.use("/certifications", require("./certification.routes"));

router.use("/jobs", require("./job.routes"));
router.use("/applications", require("./application.routes"));
router.use("/interviews", require("./interview.routes"));

router.use("/companies", require("./company.routes"));
router.use("/recruiters", require("./recruiter.routes"));

router.use("/conversations", require("./conversation.routes"));
router.use("/messages", require("./message.routes"));
router.use("/notifications", require("./notification.routes"));

router.use("/reviews", require("./review.routes"));
router.use("/categories", require("./category.routes"));

router.use("/dashboard", require("./dashboard.routes"));
router.use("/analytics", require("./analytics.routes"));
router.use("/reports", require("./report.routes"));

router.use("/support", require("./support.routes"));
router.use("/admin", require("./admin.routes"));
router.use("/locations", require("./location.routes"));

router.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Job Portal API is running" });
});

module.exports = router;
