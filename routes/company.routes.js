const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { uploadImage } = require("../middleware/upload");
const companyController = require("../controllers/company.controller");
const { companyProfileSchema } = require("../validations/company.validation");

router.get("/", companyController.browseCompanies);

router.patch(
  "/profile",
  authenticate,
  authorize("recruiter"),
  validate(companyProfileSchema),
  companyController.updateCompanyProfile
);
router.post("/logo", authenticate, authorize("recruiter"), uploadImage.single("image"), companyController.uploadLogo);
router.delete("/logo", authenticate, authorize("recruiter"), companyController.deleteLogo);
router.post(
  "/cover-image",
  authenticate,
  authorize("recruiter"),
  uploadImage.single("image"),
  companyController.uploadCoverImage
);
router.delete("/cover-image", authenticate, authorize("recruiter"), companyController.deleteCoverImage);
router.get("/recruiters", authenticate, authorize("recruiter"), companyController.getCompanyRecruiters);

router.get("/:id", optionalAuthenticate, companyController.getCompanyDetails);
router.get("/:id/statistics", authenticate, companyController.companyStatistics);
router.get("/:id/reviews", companyController.getCompanyReviews);

module.exports = router;
