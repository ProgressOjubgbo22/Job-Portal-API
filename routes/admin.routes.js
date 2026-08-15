const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");

const adminAuthController = require("../controllers/adminAuth.controller");
const adminApplicantController = require("../controllers/admin.applicant.controller");
const adminRecruiterController = require("../controllers/admin.recruiter.controller");
const adminCompanyController = require("../controllers/admin.company.controller");
const adminJobController = require("../controllers/admin.job.controller");
const adminReviewController = require("../controllers/admin.review.controller");
const auditLogController = require("../controllers/auditlog.controller");
const supportController = require("../controllers/support.controller");

const { loginSchema } = require("../validations/auth.validation");
const { createRecruiterSchema } = require("../validations/recruiter.validation");

// --- Auth ---
router.post("/auth/login", validate(loginSchema), adminAuthController.login);
router.get("/auth/me", authenticate, authorize("admin"), adminAuthController.getCurrentAdmin);

router.use(authenticate, authorize("admin"));

// // --- Applicants ---
router.get("/applicants/search", adminApplicantController.searchApplicants);
router.get("/applicants/statistics", adminApplicantController.applicantStatistics);
router.get("/applicants", adminApplicantController.getAllApplicants);
router.get("/applicants/:id", adminApplicantController.getApplicantDetails);
router.patch("/applicants/:id", adminApplicantController.updateApplicant);
router.patch("/applicants/:id/suspend", adminApplicantController.suspendApplicant);
router.patch("/applicants/:id/activate", adminApplicantController.activateApplicant);
router.delete("/applicants/:id", adminApplicantController.deleteApplicant);

// // --- Recruiters ---
router.get("/recruiters/search", adminRecruiterController.searchRecruiters);
router.get("/recruiters", adminRecruiterController.getAllRecruiters);
router.post("/recruiters", validate(createRecruiterSchema), adminRecruiterController.createRecruiter);
router.patch("/recruiters/:id", adminRecruiterController.updateRecruiter);
router.patch("/recruiters/:id/suspend", adminRecruiterController.suspendRecruiter);
router.patch("/recruiters/:id/activate", adminRecruiterController.activateRecruiter);
router.delete("/recruiters/:id", adminRecruiterController.deleteRecruiter);
router.post("/recruiters/:id/resend-invitation", adminRecruiterController.resendInvitation);

// // --- Companies ---
router.get("/companies", adminCompanyController.getAllCompanies);
router.post("/companies", adminCompanyController.createCompany);
router.get("/companies/:id", adminCompanyController.getCompanyDetails);
router.patch("/companies/:id", adminCompanyController.updateCompany);
router.patch("/companies/:id/verify", adminCompanyController.verifyCompany);
router.patch("/companies/:id/reject", adminCompanyController.rejectCompanyVerification);
router.patch("/companies/:id/suspend", adminCompanyController.suspendCompany);
router.patch("/companies/:id/activate", adminCompanyController.activateCompany);
router.delete("/companies/:id", adminCompanyController.deleteCompany);
router.get("/companies/:id/recruiters", adminCompanyController.getCompanyRecruiters);
router.get("/companies/:id/jobs", adminCompanyController.getCompanyJobs);

// // --- Jobs ---
router.get("/jobs", adminJobController.getAllJobs);
router.get("/jobs/:id", adminJobController.getJobDetails);
router.patch("/jobs/:id", adminJobController.updateJob);
router.delete("/jobs/:id", adminJobController.deleteJob);
router.patch("/jobs/:id/suspend", adminJobController.suspendJob);
router.patch("/jobs/:id/restore", adminJobController.restoreJob);
router.patch("/jobs/:id/feature", adminJobController.featureJob);
router.patch("/jobs/:id/unfeature", adminJobController.unfeatureJob);
router.patch("/jobs/:id/close", adminJobController.closeJob);
router.get("/jobs/:id/applicants", adminJobController.getJobApplicants);
router.get("/jobs/:id/analytics", adminJobController.getJobAnalytics);

// // --- Reviews ---
router.get("/reviews/statistics", adminReviewController.reviewStatistics);
router.get("/reviews", adminReviewController.getAllReviews);
router.get("/reviews/:id", adminReviewController.getReviewDetails);
router.patch("/reviews/:id/hide", adminReviewController.hideReview);
router.patch("/reviews/:id/restore", adminReviewController.restoreReview);
router.delete("/reviews/:id", adminReviewController.deleteReview);

// // --- Audit Logs & Activity ---
router.get("/audit-logs", auditLogController.getAllAuditLogs);
router.get("/audit-logs/:id", auditLogController.getAuditLogDetails);
router.get("/activity/user/:id", auditLogController.getUserActivity);
router.get("/activity/company/:id", auditLogController.getCompanyActivity);
router.get("/activity/job/:id", auditLogController.getJobActivity);

// // --- Support (admin side) ---
router.get("/support/tickets", supportController.getAllTicketsAdmin);
router.patch("/support/tickets/:id/status", supportController.updateTicketStatusAdmin);
router.patch("/support/tickets/:id/assign", supportController.assignTicketAdmin);

module.exports = router;
