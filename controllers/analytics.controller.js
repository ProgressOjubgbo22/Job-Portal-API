const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Interview = require("../models/Interview");
const Recruiter = require("../models/Recruiter");
const User = require("../models/User");
const Company = require("../models/Company");

// Resolve the job-id scope for the requesting user (recruiter -> own company, admin -> optional company filter)
const resolveJobScope = async (req) => {
  if (req.user.role === "recruiter") {
    const recruiter = await Recruiter.findOne({ user: req.user._id });
    if (!recruiter) throw ApiError.notFound("Recruiter profile not found");
    const jobs = await Job.find({ company: recruiter.company }).select("_id");
    return jobs.map((j) => j._id);
  }
  // admin
  const filter = req.query.company ? { company: req.query.company } : {};
  const jobs = await Job.find(filter).select("_id");
  return jobs.map((j) => j._id);
};

// GET /api/analytics/jobs
const jobAnalytics = asyncHandler(async (req, res) => {
  const jobIds = await resolveJobScope(req);

  const [totalJobs, activeJobs, draftJobs, closedJobs, byCategory, byLocation] = await Promise.all([
    Job.countDocuments({ _id: { $in: jobIds } }),
    Job.countDocuments({ _id: { $in: jobIds }, status: "published", isActive: true }),
    Job.countDocuments({ _id: { $in: jobIds }, status: "draft" }),
    Job.countDocuments({ _id: { $in: jobIds }, status: "closed" }),
    Job.aggregate([
      { $match: { _id: { $in: jobIds } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
    Job.aggregate([
      { $match: { _id: { $in: jobIds } } },
      { $group: { _id: { state: "$state", city: "$city" }, count: { $sum: 1 } } },
    ]),
  ]);

  const applicationsPerJob = await Application.aggregate([
    { $match: { job: { $in: jobIds } } },
    { $group: { _id: "$job", count: { $sum: 1 } } },
  ]);
  const avgApplicationsPerJob =
    applicationsPerJob.length > 0
      ? applicationsPerJob.reduce((sum, j) => sum + j.count, 0) / applicationsPerJob.length
      : 0;

  const topPerformingJobs = await Job.find({ _id: { $in: jobIds } })
    .sort({ applicationsCount: -1 })
    .limit(5)
    .select("title applicationsCount views");

  return new ApiResponse(200, {
    totalJobs,
    activeJobs,
    draftJobs,
    closedJobs,
    byCategory,
    byLocation,
    avgApplicationsPerJob: Math.round(avgApplicationsPerJob * 10) / 10,
    topPerformingJobs,
  }).send(res);
});

// GET /api/analytics/applications
const applicationAnalytics = asyncHandler(async (req, res) => {
  const jobIds = await resolveJobScope(req);

  const byStatus = await Application.aggregate([
    { $match: { job: { $in: jobIds } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const total = byStatus.reduce((sum, s) => sum + s.count, 0);

  const overTime = await Application.aggregate([
    { $match: { job: { $in: jobIds } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  const conversionRate = total > 0 ? Math.round(((statusMap.hired || 0) / total) * 1000) / 10 : 0;

  return new ApiResponse(200, {
    total,
    byStatus,
    overTime,
    hiringMetrics: {
      shortlisted: statusMap.shortlisted || 0,
      interviews: (statusMap.interview_scheduled || 0) + (statusMap.interview_completed || 0),
      hires: statusMap.hired || 0,
      withdrawn: statusMap.withdrawn || 0,
    },
    conversionRate,
  }).send(res);
});

// GET /api/analytics/interviews
const interviewAnalytics = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === "recruiter") {
    const recruiter = await Recruiter.findOne({ user: req.user._id });
    if (!recruiter) throw ApiError.notFound("Recruiter profile not found");
    filter = { recruiter: recruiter._id };
  }

  const byStatus = await Interview.aggregate([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const byOutcome = await Interview.aggregate([
    { $match: { ...filter, outcome: { $ne: null } } },
    { $group: { _id: "$outcome", count: { $sum: 1 } } },
  ]);

  const total = byStatus.reduce((sum, s) => sum + s.count, 0);
  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));

  return new ApiResponse(200, {
    total,
    byStatus,
    byOutcome,
    completionRate: total > 0 ? Math.round(((statusMap.completed || 0) / total) * 1000) / 10 : 0,
    cancellationRate: total > 0 ? Math.round(((statusMap.cancelled || 0) / total) * 1000) / 10 : 0,
  }).send(res);
});

// GET /api/analytics/recruitment
const recruitmentAnalytics = asyncHandler(async (req, res) => {
  const jobIds = await resolveJobScope(req);

  const [totalJobsPosted, totalApplications, shortlisted, interviews, offersMade, hires] = await Promise.all([
    Job.countDocuments({ _id: { $in: jobIds } }),
    Application.countDocuments({ job: { $in: jobIds } }),
    Application.countDocuments({ job: { $in: jobIds }, status: "shortlisted" }),
    Application.countDocuments({
      job: { $in: jobIds },
      status: { $in: ["interview_scheduled", "interview_completed"] },
    }),
    Application.countDocuments({ job: { $in: jobIds }, status: { $in: ["offer_extended", "offer_accepted", "hired"] } }),
    Application.countDocuments({ job: { $in: jobIds }, status: "hired" }),
  ]);

  const pct = (num, denom) => (denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0);

  const hiredApplications = await Application.find({ job: { $in: jobIds }, status: "hired" }).select(
    "appliedAt updatedAt"
  );
  const avgTimeToHireDays =
    hiredApplications.length > 0
      ? Math.round(
          hiredApplications.reduce(
            (sum, a) => sum + (new Date(a.updatedAt) - new Date(a.appliedAt)) / (1000 * 60 * 60 * 24),
            0
          ) / hiredApplications.length
        )
      : 0;

  return new ApiResponse(200, {
    totalJobsPosted,
    totalApplications,
    shortlisted,
    interviewsScheduled: interviews,
    offersMade,
    hires,
    rates: {
      applicationToShortlist: pct(shortlisted, totalApplications),
      shortlistToInterview: pct(interviews, shortlisted),
      interviewToHire: pct(hires, interviews),
      overallHireRate: pct(hires, totalApplications),
    },
    avgTimeToHireDays,
  }).send(res);
});

// GET /api/analytics/users (admin only)
const userAnalytics = asyncHandler(async (req, res) => {
  const [totalUsers, totalApplicants, totalRecruiters, newUsers30d, activeUsers, inactiveUsers] = await Promise.all([
    User.countDocuments({ status: { $ne: "deleted" } }),
    User.countDocuments({ role: "applicant", status: { $ne: "deleted" } }),
    User.countDocuments({ role: "recruiter", status: { $ne: "deleted" } }),
    User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    User.countDocuments({ status: "active" }),
    User.countDocuments({ status: { $in: ["suspended", "inactive"] } }),
  ]);

  const registrationsOverTime = await User.aggregate([
    { $match: { status: { $ne: "deleted" } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const byRole = await User.aggregate([
    { $match: { status: { $ne: "deleted" } } },
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);

  return new ApiResponse(200, {
    totalUsers,
    totalApplicants,
    totalRecruiters,
    newUsers30d,
    activeUsers,
    inactiveUsers,
    registrationsOverTime,
    byRole,
  }).send(res);
});

// GET /api/analytics/companies (admin only)
const companyAnalytics = asyncHandler(async (req, res) => {
  const [totalCompanies, verifiedCompanies, unverifiedCompanies, activeCompanies, inactiveCompanies] = await Promise.all([
    Company.countDocuments(),
    Company.countDocuments({ verificationStatus: "verified" }),
    Company.countDocuments({ verificationStatus: { $ne: "verified" } }),
    Company.countDocuments({ status: "active" }),
    Company.countDocuments({ status: "suspended" }),
  ]);

  const byIndustry = await Company.aggregate([
    { $group: { _id: "$industry", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const topCompanies = await Company.find().sort({ totalReviews: -1, averageRating: -1 }).limit(5).select(
    "name averageRating totalReviews"
  );

  return new ApiResponse(200, {
    totalCompanies,
    verifiedCompanies,
    unverifiedCompanies,
    activeCompanies,
    inactiveCompanies,
    byIndustry,
    topCompanies,
  }).send(res);
});

module.exports = {
  jobAnalytics,
  applicationAnalytics,
  interviewAnalytics,
  recruitmentAnalytics,
  userAnalytics,
  companyAnalytics,
};
