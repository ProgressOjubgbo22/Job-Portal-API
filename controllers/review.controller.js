const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Review = require("../models/Review");
const Company = require("../models/Company");
const Application = require("../models/Application");
const ApplicantProfile = require("../models/ApplicantProfile");
const { getPaginationOptions } = require("../utils/pagination");

const recalculateCompanyRating = async (companyId) => {
  const stats = await Review.aggregate([
    { $match: { company: companyId, status: "visible" } },
    { $group: { _id: "$company", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  const company = await Company.findById(companyId);
  if (!company) return;

  if (stats.length) {
    company.averageRating = Math.round(stats[0].avgRating * 10) / 10;
    company.totalReviews = stats[0].count;
  } else {
    company.averageRating = 0;
    company.totalReviews = 0;
  }
  await company.save();
};

// POST /api/reviews
const createReview = asyncHandler(async (req, res) => {
  const { company: companyId, rating, comment, anonymous } = req.body;

  const company = await Company.findById(companyId);
  if (!company) throw ApiError.notFound("Company not found");

  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  // Verify eligibility: applicant must have an application to a job of this company
  const Job = require("../models/Job");
  const companyJobIds = (await Job.find({ company: company._id }).select("_id")).map((j) => j._id);
  const eligible = await Application.exists({ applicant: profile._id, job: { $in: companyJobIds } });

  if (!eligible) {
    throw ApiError.forbidden("You must have applied to this company before leaving a review");
  }

  const existing = await Review.findOne({ applicant: req.user._id, company: company._id });
  if (existing) throw ApiError.conflict("You have already reviewed this company");

  const review = await Review.create({
    applicant: req.user._id,
    company: company._id,
    rating,
    comment,
    anonymous: !!anonymous,
  });

  await recalculateCompanyRating(company._id);

  return new ApiResponse(201, { review }, "Review submitted").send(res);
});

// GET /api/reviews
const getReviews = asyncHandler(async (req, res) => {
  const filter = { status: "visible" };
  if (req.query.company) filter.company = req.query.company;
  if (req.query.rating) filter.rating = Number(req.query.rating);

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Review.paginate(filter, {
    page,
    limit,
    sort: req.query.sort === "highest" ? { rating: -1 } : sort,
    populate: [
      { path: "applicant", select: "firstName lastName" },
      { path: "company", select: "name logo" },
    ],
  });

  // Strip reviewer identity for anonymous reviews
  result.docs = result.docs.map((r) => {
    const obj = r.toObject();
    if (obj.anonymous) obj.applicant = { firstName: "Anonymous", lastName: "" };
    return obj;
  });

  return new ApiResponse(200, result).send(res);
});

// GET /api/reviews/:id
const getReviewDetails = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id)
    .populate("applicant", "firstName lastName")
    .populate("company", "name logo");
  if (!review) throw ApiError.notFound("Review not found");

  const obj = review.toObject();
  if (obj.anonymous) obj.applicant = { firstName: "Anonymous", lastName: "" };

  return new ApiResponse(200, { review: obj }).send(res);
});

// GET /api/reviews/mine
const getMyReviews = asyncHandler(async (req, res) => {
  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Review.paginate(
    { applicant: req.user._id },
    { page, limit, sort, populate: [{ path: "company", select: "name logo" }] }
  );
  return new ApiResponse(200, result).send(res);
});

// PATCH /api/reviews/:id
const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound("Review not found");
  if (String(review.applicant) !== String(req.user._id)) {
    throw ApiError.forbidden("You do not have access to this review");
  }

  Object.assign(review, req.body);
  await review.save();
  await recalculateCompanyRating(review.company);

  return new ApiResponse(200, { review }, "Review updated").send(res);
});

// DELETE /api/reviews/:id
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound("Review not found");
  if (String(review.applicant) !== String(req.user._id)) {
    throw ApiError.forbidden("You do not have access to this review");
  }

  const companyId = review.company;
  await review.deleteOne();
  await recalculateCompanyRating(companyId);

  return new ApiResponse(200, null, "Review deleted").send(res);
});

module.exports = {
  createReview,
  getReviews,
  getReviewDetails,
  getMyReviews,
  updateReview,
  deleteReview,
  recalculateCompanyRating,
};
