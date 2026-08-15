const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Company = require("../models/Company");
const Recruiter = require("../models/Recruiter");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Interview = require("../models/Interview");
const Review = require("../models/Review");
const cloudinary = require("../config/cloudinary");
const { getPaginationOptions } = require("../utils/pagination");
const {
  recalculateCompanyProfileCompletion,
} = require("../utils/profileCompletion");

const streamUpload = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

// GET /api/companies
const browseCompanies = asyncHandler(async (req, res) => {
  const filter = { verificationStatus: "verified", status: "active" };
  if (req.query.industry) filter.industry = req.query.industry;
  if (req.query.state) filter.state = req.query.state;
  if (req.query.companySize) filter.companySize = req.query.companySize;
  if (req.query.q) filter.$text = { $search: req.query.q };

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Company.paginate(filter, { page, limit, sort });

  return new ApiResponse(200, result).send(res);
});

// GET /api/companies/:id
const getCompanyDetails = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");
  if (company.status !== "active" || company.verificationStatus !== "verified") {
    throw ApiError.notFound("Company not found");
  }

  const jobs = await Job.find({ company: company._id, status: "published", isActive: true })
    .select("title employmentType workMode state city salaryMin salaryMax createdAt")
    .sort({ createdAt: -1 })
    .limit(20);

  const reviews = await Review.find({ company: company._id, status: "visible" })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("applicant", "firstName lastName");

  return new ApiResponse(200, { company, jobs, reviews }).send(res);
});

// PATCH /api/companies/profile (recruiter)
const updateCompanyProfile = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter has no associated company");

  const company = await Company.findById(recruiter.company);
  if (!company) throw ApiError.notFound("Company not found");

  if (req.body.name && req.body.name !== company.name) {
    const nameExists = await Company.findOne({ name: req.body.name, _id: { $ne: company._id } });
    if (nameExists) throw ApiError.conflict("Company name already in use");
  }

  Object.assign(company, req.body);
  await company.save();
  await recalculateCompanyProfileCompletion(company._id);

  return new ApiResponse(200, { company }, "Company profile updated").send(res);
});

// POST /api/companies/logo
const uploadLogo = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter has no associated company");

  const company = await Company.findById(recruiter.company).select("+logoPublicId");
  if (!company) throw ApiError.notFound("Company not found");
  if (!req.file) throw ApiError.badRequest("No logo file provided");

  if (company.logoPublicId) {
    await cloudinary.uploader.destroy(company.logoPublicId).catch(() => {});
  }

  const result = await streamUpload(req.file.buffer, "job-portal/company-logos");
  company.logo = result.secure_url;
  company.logoPublicId = result.public_id;
  await company.save();
  await recalculateCompanyProfileCompletion(company._id);

  return new ApiResponse(200, { company }, "Logo updated").send(res);
});

// DELETE /api/companies/logo
const deleteLogo = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter has no associated company");

  const company = await Company.findById(recruiter.company).select("+logoPublicId");
  if (!company) throw ApiError.notFound("Company not found");
  if (!company.logo) throw ApiError.notFound("No logo to delete");

  if (company.logoPublicId) {
    await cloudinary.uploader.destroy(company.logoPublicId).catch(() => {});
  }
  company.logo = null;
  company.logoPublicId = undefined;
  await company.save();
  await recalculateCompanyProfileCompletion(company._id);

  return new ApiResponse(200, { company }, "Logo removed").send(res);
});

// POST /api/companies/cover-image
const uploadCoverImage = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter has no associated company");

  const company = await Company.findById(recruiter.company).select("+coverImagePublicId");
  if (!company) throw ApiError.notFound("Company not found");
  if (!req.file) throw ApiError.badRequest("No cover image provided");

  if (company.coverImagePublicId) {
    await cloudinary.uploader.destroy(company.coverImagePublicId).catch(() => {});
  }

  const result = await streamUpload(req.file.buffer, "job-portal/company-covers");
  company.coverImage = result.secure_url;
  company.coverImagePublicId = result.public_id;
  await company.save();

  return new ApiResponse(200, { company }, "Cover image updated").send(res);
});

// DELETE /api/companies/cover-image
const deleteCoverImage = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter has no associated company");

  const company = await Company.findById(recruiter.company).select("+coverImagePublicId");
  if (!company) throw ApiError.notFound("Company not found");
  if (!company.coverImage) throw ApiError.notFound("No cover image to delete");

  if (company.coverImagePublicId) {
    await cloudinary.uploader.destroy(company.coverImagePublicId).catch(() => {});
  }
  company.coverImage = null;
  company.coverImagePublicId = undefined;
  await company.save();

  return new ApiResponse(200, { company }, "Cover image removed").send(res);
});

// GET /api/companies/:id/statistics
const companyStatistics = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  if (req.user.role !== "admin") {
    const recruiter = await Recruiter.findOne({ user: req.user._id });
    if (!recruiter || String(recruiter.company) !== String(company._id)) {
      throw ApiError.forbidden("You do not have access to this company's statistics");
    }
  }

  const [totalActiveJobs, totalClosedJobs, totalRecruiters, jobs] = await Promise.all([
    Job.countDocuments({ company: company._id, status: "published", isActive: true }),
    Job.countDocuments({ company: company._id, status: "closed" }),
    Recruiter.countDocuments({ company: company._id, status: "active" }),
    Job.find({ company: company._id }).select("_id"),
  ]);

  const jobIds = jobs.map((j) => j._id);
  const totalApplications = await Application.countDocuments({ job: { $in: jobIds } });

  return new ApiResponse(200, {
    totalActiveJobs,
    totalClosedJobs,
    totalApplications,
    totalRecruiters,
    averageRating: company.averageRating,
    totalReviews: company.totalReviews,
  }).send(res);
});

// GET /api/companies/:id/reviews
const getCompanyReviews = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  const { page, limit } = getPaginationOptions(req.query);
  const filter = { company: company._id, status: "visible" };
  if (req.query.rating) filter.rating = Number(req.query.rating);

  const result = await Review.paginate(filter, {
    page,
    limit,
    sort: req.query.sort === "highest" ? { rating: -1 } : { createdAt: -1 },
    populate: [{ path: "applicant", select: "firstName lastName" }],
  });

  return new ApiResponse(200, result).send(res);
});

// GET /api/companies/recruiters (manage company recruiters - list)
const getCompanyRecruiters = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter has no associated company");

  const recruiters = await Recruiter.find({ company: recruiter.company }).populate(
    "user",
    "firstName lastName email status"
  );

  return new ApiResponse(200, { recruiters }).send(res);
});

module.exports = {
  browseCompanies,
  getCompanyDetails,
  updateCompanyProfile,
  uploadLogo,
  deleteLogo,
  uploadCoverImage,
  deleteCoverImage,
  companyStatistics,
  getCompanyReviews,
  getCompanyRecruiters,
};
