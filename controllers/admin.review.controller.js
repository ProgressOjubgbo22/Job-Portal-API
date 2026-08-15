const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Review = require("../models/Review");
const { getPaginationOptions } = require("../utils/pagination");
const { logAction } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notify");
const { recalculateCompanyRating } = require("./review.controller");

// GET /api/admin/reviews
const getAllReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.rating) filter.rating = Number(req.query.rating);
  if (req.query.company) filter.company = req.query.company;
  if (req.query.applicant) filter.applicant = req.query.applicant;
  if (req.query.status) filter.status = req.query.status;

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Review.paginate(filter, {
    page,
    limit,
    sort,
    populate: [
      { path: "applicant", select: "firstName lastName email" },
      { path: "company", select: "name" },
    ],
  });

  return new ApiResponse(200, result).send(res);
});

// GET /api/admin/reviews/:id
const getReviewDetails = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id)
    .populate("applicant", "firstName lastName email")
    .populate("company", "name");
  if (!review) throw ApiError.notFound("Review not found");

  return new ApiResponse(200, { review }).send(res);
});

// PATCH /api/admin/reviews/:id/hide
const hideReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound("Review not found");
  if (review.status === "hidden") throw ApiError.badRequest("Review is already hidden");
  if (!req.body.reason) throw ApiError.badRequest("A hide reason is required");

  review.status = "hidden";
  review.hideReason = req.body.reason;
  review.hiddenAt = new Date();
  review.hiddenBy = req.user._id;
  await review.save();

  await recalculateCompanyRating(review.company);
  await logAction({ req, action: "hide_review", entity: "Review", entityId: review._id, description: req.body.reason });
  await notifyUser({
    user: review.applicant,
    title: "Review hidden",
    message: `Your review was hidden by a moderator. Reason: ${req.body.reason}`,
    type: "review",
  });

  return new ApiResponse(200, { review }, "Review hidden").send(res);
});

// PATCH /api/admin/reviews/:id/restore
const restoreReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound("Review not found");
  if (review.status === "visible") throw ApiError.badRequest("Review is already visible");

  review.status = "visible";
  review.hideReason = undefined;
  review.hiddenAt = undefined;
  review.hiddenBy = undefined;
  await review.save();

  await recalculateCompanyRating(review.company);
  await logAction({ req, action: "restore_review", entity: "Review", entityId: review._id });
  await notifyUser({
    user: review.applicant,
    title: "Review restored",
    message: "Your review is visible again.",
    type: "review",
  });

  return new ApiResponse(200, { review }, "Review restored").send(res);
});

// DELETE /api/admin/reviews/:id
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound("Review not found");

  const companyId = review.company;
  await review.deleteOne();
  await recalculateCompanyRating(companyId);

  await logAction({ req, action: "delete_review", entity: "Review", entityId: req.params.id });

  return new ApiResponse(200, null, "Review deleted").send(res);
});

// GET /api/admin/reviews/statistics
const reviewStatistics = asyncHandler(async (req, res) => {
  const [total, visible, hidden, byRating] = await Promise.all([
    Review.countDocuments(),
    Review.countDocuments({ status: "visible" }),
    Review.countDocuments({ status: "hidden" }),
    Review.aggregate([{ $group: { _id: "$rating", count: { $sum: 1 } } }]),
  ]);

  return new ApiResponse(200, { total, visible, hidden, byRating }).send(res);
});

module.exports = {
  getAllReviews,
  getReviewDetails,
  hideReview,
  restoreReview,
  deleteReview,
  reviewStatistics,
};
