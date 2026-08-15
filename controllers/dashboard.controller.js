const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const ApplicantProfile = require("../models/ApplicantProfile");
const Application = require("../models/Application");
const Interview = require("../models/Interview");
const SavedJob = require("../models/SavedJob");
const Notification = require("../models/Notification");
const Job = require("../models/Job");
const Recruiter = require("../models/Recruiter");
const Company = require("../models/Company");
const User = require("../models/User");

// GET /api/dashboard/applicant
const applicantDashboard = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const [
    totalApplications,
    pendingApplications,
    shortlistedApplications,
    interviewApplications,
    hiredApplications,
    recentApplications,
    savedJobsCount,
    unreadNotifications,
  ] = await Promise.all([
    Application.countDocuments({ applicant: profile._id }),
    Application.countDocuments({ applicant: profile._id, status: { $in: ["applied", "under_review"] } }),
    Application.countDocuments({ applicant: profile._id, status: "shortlisted" }),
    Application.countDocuments({
      applicant: profile._id,
      status: { $in: ["interview_scheduled", "interview_completed"] },
    }),
    Application.countDocuments({ applicant: profile._id, status: "hired" }),
    Application.find({ applicant: profile._id }).sort({ createdAt: -1 }).limit(5).populate("job", "title"),
    SavedJob.countDocuments({ applicant: profile._id }),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  const applicationIds = (await Application.find({ applicant: profile._id }).select("_id")).map((a) => a._id);
  const upcomingInterviews = await Interview.find({
    application: { $in: applicationIds },
    date: { $gte: new Date() },
    status: { $in: ["scheduled", "rescheduled"] },
  })
    .sort({ date: 1 })
    .limit(5)
    .populate({ path: "application", populate: { path: "job", select: "title" } });

  const recommendedJobs = await Job.find({
    status: "published",
    isActive: true,
    applicationDeadline: { $gte: new Date() },
    ...(profile.preferredWorkMode ? { workMode: profile.preferredWorkMode } : {}),
  })
    .limit(5)
    .select("title company salaryMin salaryMax")
    .populate("company", "name logo");

  return new ApiResponse(200, {
    stats: {
      totalApplications,
      pendingApplications,
      shortlistedApplications,
      interviewApplications,
      hiredApplications,
      savedJobsCount,
      unreadNotifications,
      profileCompletion: profile.profileCompletion,
    },
    recentApplications,
    upcomingInterviews,
    recommendedJobs,
  }).send(res);
});

// GET /api/dashboard/recruiter
const recruiterDashboard = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const [totalJobs, activeJobs, draftJobs, closedJobs] = await Promise.all([
    Job.countDocuments({ company: recruiter.company }),
    Job.countDocuments({ company: recruiter.company, status: "published", isActive: true }),
    Job.countDocuments({ company: recruiter.company, status: "draft" }),
    Job.countDocuments({ company: recruiter.company, status: "closed" }),
  ]);

  const companyJobIds = (await Job.find({ company: recruiter.company }).select("_id")).map((j) => j._id);

  const [
    totalApplications,
    pendingApplications,
    shortlistedApplications,
    interviewApplications,
    hiredApplications,
    recentApplications,
    unreadNotifications,
  ] = await Promise.all([
    Application.countDocuments({ job: { $in: companyJobIds } }),
    Application.countDocuments({ job: { $in: companyJobIds }, status: { $in: ["applied", "under_review"] } }),
    Application.countDocuments({ job: { $in: companyJobIds }, status: "shortlisted" }),
    Application.countDocuments({
      job: { $in: companyJobIds },
      status: { $in: ["interview_scheduled", "interview_completed"] },
    }),
    Application.countDocuments({ job: { $in: companyJobIds }, status: "hired" }),
    Application.find({ job: { $in: companyJobIds } })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("job", "title")
      .populate({ path: "applicant", populate: { path: "user", select: "firstName lastName" } }),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  const upcomingInterviews = await Interview.find({
    recruiter: recruiter._id,
    date: { $gte: new Date() },
    status: { $in: ["scheduled", "rescheduled"] },
  })
    .sort({ date: 1 })
    .limit(5)
    .populate({ path: "application", populate: { path: "job", select: "title" } });

  const topJobs = await Job.find({ company: recruiter.company })
    .sort({ applicationsCount: -1 })
    .limit(5)
    .select("title applicationsCount status");

  return new ApiResponse(200, {
    stats: {
      totalJobs,
      activeJobs,
      draftJobs,
      closedJobs,
      totalApplications,
      pendingApplications,
      shortlistedApplications,
      interviewApplications,
      hiredApplications,
      unreadNotifications,
    },
    recentApplications,
    upcomingInterviews,
    topJobs,
  }).send(res);
});

// GET /api/dashboard/admin
const adminDashboard = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalApplicants,
    totalRecruiters,
    totalCompanies,
    totalJobs,
    activeJobs,
    draftJobs,
    closedJobs,
    totalApplications,
    pendingApplications,
    totalInterviews,
    totalHires,
    withdrawnApplications,
    pendingVerifications,
  ] = await Promise.all([
    User.countDocuments({ status: { $ne: "deleted" } }),
    User.countDocuments({ role: "applicant", status: { $ne: "deleted" } }),
    User.countDocuments({ role: "recruiter", status: { $ne: "deleted" } }),
    Company.countDocuments(),
    Job.countDocuments(),
    Job.countDocuments({ status: "published", isActive: true }),
    Job.countDocuments({ status: "draft" }),
    Job.countDocuments({ status: "closed" }),
    Application.countDocuments(),
    Application.countDocuments({ status: { $in: ["applied", "under_review"] } }),
    Interview.countDocuments(),
    Application.countDocuments({ status: "hired" }),
    Application.countDocuments({ status: "withdrawn" }),
    Company.countDocuments({ verificationStatus: "pending" }),
  ]);

  const jobsByCategory = await Job.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, category: "$category.name", count: 1 } },
  ]);

  const recentUsers = await User.find({ status: { $ne: "deleted" } })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("firstName lastName email role createdAt");

  const recentCompanies = await Company.find().sort({ createdAt: -1 }).limit(5).select("name verificationStatus createdAt");

  return new ApiResponse(200, {
    platformStats: { totalUsers, totalApplicants, totalRecruiters, totalCompanies, totalJobs },
    jobStats: { activeJobs, draftJobs, closedJobs, jobsByCategory },
    applicationStats: { totalApplications, pendingApplications, totalInterviews, totalHires, withdrawnApplications },
    pendingVerifications,
    recentUsers,
    recentCompanies,
  }).send(res);
});

module.exports = { applicantDashboard, recruiterDashboard, adminDashboard };
