const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Company = require("../models/Company");
const Recruiter = require("../models/Recruiter");

const dateRangeFilter = (query, field = "createdAt") => {
  if (!query.dateFrom && !query.dateTo) return {};
  const range = {};
  if (query.dateFrom) range.$gte = new Date(query.dateFrom);
  if (query.dateTo) range.$lte = new Date(query.dateTo);
  return { [field]: range };
};

// GET /api/reports/users
const userReport = asyncHandler(async (req, res) => {
  const filter = { status: { $ne: "deleted" }, ...dateRangeFilter(req.query) };
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;

  const [total, applicants, recruiters, active, inactive, newUsers] = await Promise.all([
    User.countDocuments(filter),
    User.countDocuments({ ...filter, role: "applicant" }),
    User.countDocuments({ ...filter, role: "recruiter" }),
    User.countDocuments({ ...filter, status: "active" }),
    User.countDocuments({ ...filter, status: { $ne: "active" } }),
    User.countDocuments({ ...filter, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
  ]);

  return new ApiResponse(200, {
    totalUsers: total,
    applicants,
    recruiters,
    activeUsers: active,
    inactiveUsers: inactive,
    newUsers,
  }).send(res);
});

// GET /api/reports/jobs
const jobReport = asyncHandler(async (req, res) => {
  const filter = { ...dateRangeFilter(req.query) };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.company) filter.company = req.query.company;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.state) filter.state = req.query.state;

  const [total, active, draft, closed, byCategory, byCompany] = await Promise.all([
    Job.countDocuments(filter),
    Job.countDocuments({ ...filter, status: "published", isActive: true }),
    Job.countDocuments({ ...filter, status: "draft" }),
    Job.countDocuments({ ...filter, status: "closed" }),
    Job.aggregate([{ $match: filter }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
    Job.aggregate([{ $match: filter }, { $group: { _id: "$company", count: { $sum: 1 } } }]),
  ]);

  const jobIds = (await Job.find(filter).select("_id")).map((j) => j._id);
  const totalApplications = await Application.countDocuments({ job: { $in: jobIds } });

  return new ApiResponse(200, {
    totalJobs: total,
    activeJobs: active,
    draftJobs: draft,
    closedJobs: closed,
    byCategory,
    byCompany,
    totalApplications,
    avgApplicationsPerJob: total > 0 ? Math.round((totalApplications / total) * 10) / 10 : 0,
  }).send(res);
});

// GET /api/reports/applications
const applicationReport = asyncHandler(async (req, res) => {
  const filter = { ...dateRangeFilter(req.query) };
  if (req.query.job) filter.job = req.query.job;
  if (req.query.status) filter.status = req.query.status;

  if (req.user.role === "recruiter") {
    const recruiter = await Recruiter.findOne({ user: req.user._id });
    if (!recruiter) throw ApiError.notFound("Recruiter profile not found");
    const jobs = await Job.find({ company: recruiter.company }).select("_id");
    filter.job = { $in: jobs.map((j) => j._id) };
  } else if (req.query.company) {
    const jobs = await Job.find({ company: req.query.company }).select("_id");
    filter.job = { $in: jobs.map((j) => j._id) };
  }

  const [total, byStatus, overTime] = await Promise.all([
    Application.countDocuments(filter),
    Application.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Application.aggregate([
      { $match: filter },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));

  return new ApiResponse(200, {
    totalApplications: total,
    byStatus,
    overTime,
    hiringMetrics: {
      shortlisted: statusMap.shortlisted || 0,
      interviews: (statusMap.interview_scheduled || 0) + (statusMap.interview_completed || 0),
      hires: statusMap.hired || 0,
      withdrawn: statusMap.withdrawn || 0,
    },
  }).send(res);
});

// GET /api/reports/companies (admin)
const companyReport = asyncHandler(async (req, res) => {
  const filter = { ...dateRangeFilter(req.query) };
  if (req.query.industry) filter.industry = req.query.industry;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.state) filter.state = req.query.state;

  const [total, verified, active, inactive, byIndustry, byState] = await Promise.all([
    Company.countDocuments(filter),
    Company.countDocuments({ ...filter, verificationStatus: "verified" }),
    Company.countDocuments({ ...filter, status: "active" }),
    Company.countDocuments({ ...filter, status: { $ne: "active" } }),
    Company.aggregate([{ $match: filter }, { $group: { _id: "$industry", count: { $sum: 1 } } }]),
    Company.aggregate([{ $match: filter }, { $group: { _id: "$state", count: { $sum: 1 } } }]),
  ]);

  return new ApiResponse(200, {
    totalCompanies: total,
    verifiedCompanies: verified,
    activeCompanies: active,
    inactiveCompanies: inactive,
    byIndustry,
    byState,
  }).send(res);
});

// GET /api/reports/recruiters (admin)
const recruiterReport = asyncHandler(async (req, res) => {
  const filter = { ...dateRangeFilter(req.query) };
  if (req.query.company) filter.company = req.query.company;
  if (req.query.status) filter.status = req.query.status;

  const [total, active, inactive, byCompany] = await Promise.all([
    Recruiter.countDocuments(filter),
    Recruiter.countDocuments({ ...filter, status: "active" }),
    Recruiter.countDocuments({ ...filter, status: { $ne: "active" } }),
    Recruiter.aggregate([{ $match: filter }, { $group: { _id: "$company", count: { $sum: 1 } } }]),
  ]);

  return new ApiResponse(200, {
    totalRecruiters: total,
    activeRecruiters: active,
    inactiveRecruiters: inactive,
    byCompany,
  }).send(res);
});

// GET /api/reports/export
const exportReport = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const validTypes = ["users", "jobs", "applications", "companies", "recruiters"];
  if (!type || !validTypes.includes(type)) {
    throw ApiError.badRequest(`type must be one of: ${validTypes.join(", ")}`);
  }

  let data = [];
  switch (type) {
    case "users":
      data = await User.find({ status: { $ne: "deleted" } }).select(
        "firstName lastName email role status createdAt"
      );
      break;
    case "jobs":
      data = await Job.find().select("title status employmentType state city applicationsCount createdAt");
      break;
    case "applications":
      data = await Application.find().select("status appliedAt job applicant");
      break;
    case "companies":
      data = await Company.find().select("name industry verificationStatus status createdAt");
      break;
    case "recruiters":
      data = await Recruiter.find().populate("user", "firstName lastName email").select("company status jobTitle");
      break;
  }

  // Return as JSON payload; the client can convert to CSV/Excel/PDF as needed.
  res.setHeader("Content-Disposition", `attachment; filename="${type}_report.json"`);
  return new ApiResponse(200, { type, count: data.length, data }).send(res);
});

module.exports = {
  userReport,
  jobReport,
  applicationReport,
  companyReport,
  recruiterReport,
  exportReport,
};
