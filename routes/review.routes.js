const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const reviewController = require("../controllers/review.controller");
const { createReviewSchema, updateReviewSchema } = require("../validations/review.validation");

router.get("/", reviewController.getReviews);
router.get("/:id", reviewController.getReviewDetails);

router.use(authenticate, authorize("applicant"));

router.post("/", validate(createReviewSchema), reviewController.createReview);
router.get("/mine/all", reviewController.getMyReviews);
router.patch("/:id", validate(updateReviewSchema), reviewController.updateReview);
router.delete("/:id", reviewController.deleteReview);

module.exports = router;
