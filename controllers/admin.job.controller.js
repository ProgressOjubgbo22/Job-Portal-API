const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Recruiter = require("../models/Recruiter");
const { getPaginationOptions } = require("../utils/pagination");
const { logAction } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notify");
const cache = require("../utils/cache");

// Shares the same "jobs" cache namespace as controllers/job.controller.js,
// since admin actions here (suspend/restore/close/feature/etc.) change the
// exact same public job listings that controller caches.
const invalidateJobsCache = () => cache.bumpNamespaceVersion("jobs");

// GET /api/admin/jobs
const getAllJobs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.search) filter.$text = { $search: req.query.search };
  if (req.query.company) filter.company = req.query.company;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.state) filter.state = req.query.state;

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Job.paginate(filter, {
    page,
    limit,
    sort,
    populate: [
      { path: "company", select: "name" },
      { path: "category", select: "name" },
    ],
  });

  return new ApiResponse(200, result).send(res);
});

// GET /api/admin/jobs/:id
const getJobDetails = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id)
    .populate("company")
    .populate("category", "name")
    .populate({ path: "recruiter", populate: { path: "user", select: "firstName lastName email" } });
  if (!job) throw ApiError.notFound("Job not found");

  const applicantCount = await Application.countDocuments({ job: job._id });

  return new ApiResponse(200, { job, applicantCount }).send(res);
});

const notifyRecruiter = async (job, title, message) => {
  const recruiter = await Recruiter.findById(job.recruiter).populate("user");
  if (recruiter?.user) {
    await notifyUser({ user: recruiter.user._id, title, message, type: "job" });
  }
};

// PATCH /api/admin/jobs/:id
const updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");

  Object.assign(job, req.body);
  await job.save();
  await invalidateJobsCache();

  await logAction({ req, action: "admin_update_job", entity: "Job", entityId: job._id });

  return new ApiResponse(200, { job }, "Job updated").send(res);
});

// DELETE /api/admin/jobs/:id
const deleteJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");

  const hasDependencies = await Application.exists({ job: job._id });

  if (hasDependencies) {
    job.status = "closed";
    job.isActive = false;
    await job.save();
  } else {
    await job.deleteOne();
  }
  await invalidateJobsCache();

  await logAction({
    req,
    action: "delete_job",
    entity: "Job",
    entityId: job._id,
    description: hasDependencies ? "Soft-deleted (closed) due to existing applications" : "Hard-deleted",
  });

  return new ApiResponse(200, null, "Job deleted").send(res);
});

// PATCH /api/admin/jobs/:id/suspend
const suspendJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  if (job.status === "suspended") throw ApiError.badRequest("Job is already suspended");
  if (!req.body.reason) throw ApiError.badRequest("A suspension reason is required");

  job.status = "suspended";
  job.isActive = false;
  job.suspensionReason = req.body.reason;
  job.suspendedAt = new Date();
  await job.save();
  await invalidateJobsCache();

  await logAction({ req, action: "suspend_job", entity: "Job", entityId: job._id, description: req.body.reason });
  await notifyRecruiter(job, "Job suspended", `Your job "${job.title}" has been suspended. Reason: ${req.body.reason}`);

  return new ApiResponse(200, { job }, "Job suspended").send(res);
});

// PATCH /api/admin/jobs/:id/restore
const restoreJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  if (job.status !== "suspended") throw ApiError.badRequest("Job is not suspended");

  const Company = require("../models/Company");
  const company = await Company.findById(job.company);
  if (!company || company.status !== "active") {
    throw ApiError.badRequest("Cannot restore job because the associated company is not active");
  }

  job.status = "published";
  job.isActive = true;
  job.suspensionReason = undefined;
  job.suspendedAt = undefined;
  await job.save();
  await invalidateJobsCache();

  await logAction({ req, action: "restore_job", entity: "Job", entityId: job._id });
  await notifyRecruiter(job, "Job restored", `Your job "${job.title}" has been restored`);

  return new ApiResponse(200, { job }, "Job restored").send(res);
});

// PATCH /api/admin/jobs/:id/feature
const featureJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  if (job.featured) throw ApiError.badRequest("Job is already featured");

  job.featured = true;
  job.featuredAt = new Date();
  job.featuredBy = req.user._id;
  await job.save();
  await invalidateJobsCache();

  await logAction({ req, action: "feature_job", entity: "Job", entityId: job._id });
  await notifyRecruiter(job, "Job featured", `Your job "${job.title}" is now featured`);

  return new ApiResponse(200, { job }, "Job featured").send(res);
});

// PATCH /api/admin/jobs/:id/unfeature
const unfeatureJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  if (!job.featured) throw ApiError.badRequest("Job is not featured");

  job.featured = false;
  job.featuredAt = undefined;
  job.featuredBy = undefined;
  await job.save();
  await invalidateJobsCache();

  await logAction({ req, action: "unfeature_job", entity: "Job", entityId: job._id });
  await notifyRecruiter(job, "Job unfeatured", `Your job "${job.title}" is no longer featured`);

  return new ApiResponse(200, { job }, "Job unfeatured").send(res);
});

// PATCH /api/admin/jobs/:id/close
const closeJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");

  job.status = "closed";
  job.isActive = false;
  job.closedAt = new Date();
  await job.save();
  await invalidateJobsCache();

  await logAction({ req, action: "admin_close_job", entity: "Job", entityId: job._id });

  return new ApiResponse(200, { job }, "Job closed").send(res);
});

// GET /api/admin/jobs/:id/applicants
const getJobApplicants = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Application.paginate(
    { job: job._id },
    {
      page,
      limit,
      sort,
      populate: [{ path: "applicant", populate: { path: "user", select: "firstName lastName email" } }],
    }
  );

  return new ApiResponse(200, result).send(res);
});

// GET /api/admin/jobs/:id/analytics
const getJobAnalytics = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");

  const statusBreakdown = await Application.aggregate([
    { $match: { job: job._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  return new ApiResponse(200, {
    views: job.views,
    applicationsCount: job.applicationsCount,
    statusBreakdown,
  }).send(res);
});

module.exports = {
  getAllJobs,
  getJobDetails,
  updateJob,
  deleteJob,
  suspendJob,
  restoreJob,
  featureJob,
  unfeatureJob,
  closeJob,
  getJobApplicants,
  getJobAnalytics,
};
