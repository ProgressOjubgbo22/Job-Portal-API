const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Job = require("../models/Job");
const Category = require("../models/Category");
const Recruiter = require("../models/Recruiter");
const ApplicantProfile = require("../models/ApplicantProfile");
const SavedJob = require("../models/SavedJob");
const Application = require("../models/Application");
const { getPaginationOptions } = require("../utils/pagination");
const cache = require("../utils/cache");

const PUBLIC_FILTER = { status: "published", isActive: true };

// Public job listings/details are read far more often than they change, so
// they're cached in Redis. Every write to a Job (create/update/publish/
// close/etc.) bumps this namespace's version, which instantly invalidates
// every previously cached list/detail key without needing to track or scan
// for individual keys.
const JOBS_CACHE_NAMESPACE = "jobs";
const JOBS_LIST_TTL_SECONDS = 60;
const JOB_DETAIL_TTL_SECONDS = 120;

const invalidateJobsCache = () => cache.bumpNamespaceVersion(JOBS_CACHE_NAMESPACE);

const buildFilterQuery = (query) => {
  const filter = { ...PUBLIC_FILTER, applicationDeadline: { $gte: new Date() } };

  if (query.category) filter.category = query.category;
  if (query.company) filter.company = query.company;
  if (query.employmentType) filter.employmentType = query.employmentType;
  if (query.experienceLevel) filter.experienceLevel = query.experienceLevel;
  if (query.workMode) filter.workMode = query.workMode;
  if (query.educationLevel) filter.educationLevel = query.educationLevel;
  if (query.state) filter.state = query.state;
  if (query.city) filter.city = query.city;
  if (query.industry) filter.industry = query.industry;
  if (query.skills) {
    const skills = Array.isArray(query.skills) ? query.skills : query.skills.split(",");
    filter.requiredSkills = { $in: skills.map((s) => new RegExp(`^${s}$`, "i")) };
  }
  if (query.salaryMin || query.salaryMax) {
    filter.$and = filter.$and || [];
    if (query.salaryMin) filter.$and.push({ salaryMax: { $gte: Number(query.salaryMin) } });
    if (query.salaryMax) filter.$and.push({ salaryMin: { $lte: Number(query.salaryMax) } });
  }
  if (query.postedAfter) {
    filter.publishedAt = { ...(filter.publishedAt || {}), $gte: new Date(query.postedAfter) };
  }

  return filter;
};

const POPULATE_LIST = [
  { path: "company", select: "name logo state city verificationStatus" },
  { path: "category", select: "name" },
];

// GET /api/jobs
const browseJobs = asyncHandler(async (req, res) => {
  const filter = buildFilterQuery(req.query);
  const { page, limit, sort } = getPaginationOptions(req.query);

 const version = await cache.getNamespaceVersion(JOBS_CACHE_NAMESPACE);
  const cacheKey = `${JOBS_CACHE_NAMESPACE}:v${version}:list:${JSON.stringify(req.query)}`;
 
  const { data: result } = await cache.getOrSet(
    cacheKey,
    () => Job.paginate(filter, { page, limit, sort, populate: POPULATE_LIST }),
    JOBS_LIST_TTL_SECONDS
  );

  return new ApiResponse(200, result).send(res);
});

// GET /api/jobs/search
const searchJobs = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) throw ApiError.badRequest("Search query is required");

  const filter = { ...buildFilterQuery(req.query), $text: { $search: q } };
  const { page, limit, sort } = getPaginationOptions(req.query);

  const result = await Job.paginate(filter, {
    page,
    limit,
    sort,
    populate: POPULATE_LIST,
  });

  return new ApiResponse(200, result).send(res);
});

// GET /api/jobs/featured
const featuredJobs = asyncHandler(async (req, res) => {
  const { page, limit } = getPaginationOptions(req.query);
  const result = await Job.paginate(
    { ...PUBLIC_FILTER, featured: true },
    { page, limit, sort: { featuredAt: -1 }, populate: POPULATE_LIST }
  );
  return new ApiResponse(200, result).send(res);
});

// GET /api/jobs/latest
const latestJobs = asyncHandler(async (req, res) => {
  const { page, limit } = getPaginationOptions(req.query);
  const result = await Job.paginate(PUBLIC_FILTER, {
    page,
    limit,
    sort: { createdAt: -1 },
    populate: POPULATE_LIST,
  });
  return new ApiResponse(200, result).send(res);
});

// GET /api/jobs/popular
const popularJobs = asyncHandler(async (req, res) => {
  const { page, limit } = getPaginationOptions(req.query);
  const result = await Job.paginate(PUBLIC_FILTER, {
    page,
    limit,
    sort: { applicationsCount: -1 },
    populate: POPULATE_LIST,
  });
  return new ApiResponse(200, result).send(res);
});

// GET /api/jobs/recommended
const recommendedJobs = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const { page, limit } = getPaginationOptions(req.query);
  const filter = { ...PUBLIC_FILTER, applicationDeadline: { $gte: new Date() } };

  const orConditions = [];
  if (profile.preferredWorkMode) orConditions.push({ workMode: profile.preferredWorkMode });
  if (profile.preferredJobType) orConditions.push({ employmentType: profile.preferredJobType });
  if (profile.state) orConditions.push({ state: profile.state });

  if (orConditions.length) filter.$or = orConditions;

  const result = await Job.paginate(filter, {
    page,
    limit,
    sort: { createdAt: -1 },
    populate: POPULATE_LIST,
  });

  return new ApiResponse(200, result).send(res);
});

// GET /api/jobs/category/:categoryId
const jobsByCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.categoryId);
  if (!category) throw ApiError.notFound("Category not found");
  if (category.status !== "active") throw ApiError.notFound("Category not found");

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Job.paginate(
    { ...PUBLIC_FILTER, category: category._id },
    { page, limit, sort, populate: POPULATE_LIST }
  );

  return new ApiResponse(200, result).send(res);
});

// GET /api/jobs/:id
const getJobDetails = asyncHandler(async (req, res) => {

  const version = await cache.getNamespaceVersion(JOBS_CACHE_NAMESPACE);
  const cacheKey = `${JOBS_CACHE_NAMESPACE}:v${version}:detail:${req.params.id}`;
  // Only the anonymous/public view is ever read from or written to the
  // shared cache. A recruiter viewing their own draft job (a private view)
  // always goes straight to the database, so a draft's data can never leak
  // through a cache key that other users could also read.
  const cached = req.user ? null : await cache.get(cacheKey);
  
  let job;
  let relatedJobs;
  
  if (cached) {
    ({ job, relatedJobs } = cached);
  } else {
    job = await Job.findById(req.params.id)
      .populate("company")
      .populate("category", "name")
      .populate({ path: "recruiter", populate: { path: "user", select: "firstName lastName email" } });
  
    if (!job) throw ApiError.notFound("Job not found");
    if (!job.isPubliclyVisible() && !(req.user && String(job.recruiter?.user?._id) === String(req.user._id))) {
      throw ApiError.notFound("Job not found");
    }
  
    relatedJobs = await Job.find({
      ...PUBLIC_FILTER,
      category: job.category,
      _id: { $ne: job._id },
    })
      .limit(5)
      .select("title company state city salaryMin salaryMax employmentType");
  
    if (!req.user && job.isPubliclyVisible()) {
      await cache.set(cacheKey, { job, relatedJobs }, JOB_DETAIL_TTL_SECONDS);
    }
  }
  
    // View count is incremented atomically (a single $inc, not a
    // read-modify-write) so concurrent requests never lose an increment to a
    // race condition, regardless of whether this response came from cache.
    // The count in the response payload may therefore lag by a request or
    // two when served from cache - an acceptable trade-off for a popularity
    // counter, and it self-corrects every time the cache entry expires.
  await Job.updateOne({ _id: req.params.id }, { $inc: { views: 1 } });

  return new ApiResponse(200, { job, relatedJobs }).send(res);
});

// POST /api/jobs (recruiter - create job, defaults to draft)
const createJob = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const category = await Category.findById(req.body.category);
  if (!category) throw ApiError.notFound("Category not found");

  const job = await Job.create({
    ...req.body,
    recruiter: recruiter._id,
    company: recruiter.company,
    status: "draft",
  });

  await invalidateJobsCache();
  return new ApiResponse(201, { job }, "Job created as draft").send(res);
});

const findOwnedJob = async (jobId, userId) => {
  const recruiter = await Recruiter.findOne({ user: userId });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const job = await Job.findById(jobId);
  if (!job) throw ApiError.notFound("Job not found");
  if (String(job.recruiter) !== String(recruiter._id)) {
    throw ApiError.forbidden("You do not have access to this job");
  }
  return { job, recruiter };
};

// GET /api/recruiters/jobs (list own jobs)
const getAllJobsForRecruiter = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const { page, limit, sort } = getPaginationOptions(req.query);
  const filter = { recruiter: recruiter._id };
  if (req.query.status) filter.status = req.query.status;

  const result = await Job.paginate(filter, { page, limit, sort, populate: [{ path: "category", select: "name" }] });
  return new ApiResponse(200, result).send(res);
});

// PATCH /api/jobs/:id
const updateJob = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);

  if (req.body.category) {
    const category = await Category.findById(req.body.category);
    if (!category) throw ApiError.notFound("Category not found");
  }

  Object.assign(job, req.body);
  await job.save();

  await invalidateJobsCache();
  return new ApiResponse(200, { job }, "Job updated").send(res);
});

// DELETE /api/jobs/:id
const deleteJob = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);
  await job.deleteOne();
  await invalidateJobsCache();
  return new ApiResponse(200, null, "Job deleted").send(res);
});

// PATCH /api/jobs/:id/publish
const publishJob = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);
  if (job.status === "published") throw ApiError.badRequest("Job is already published");

  job.status = "published";
  job.isActive = true;
  job.publishedAt = new Date();
  await job.save();

  await invalidateJobsCache();
  return new ApiResponse(200, { job }, "Job published").send(res);
});

// PATCH /api/jobs/:id/unpublish
const unpublishJob = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);
  job.status = "draft";
  job.isActive = false;
  await job.save();
  await invalidateJobsCache();
  return new ApiResponse(200, { job }, "Job unpublished").send(res);
});

// PATCH /api/jobs/:id/close
const closeJob = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);
  job.status = "closed";
  job.isActive = false;
  job.closedAt = new Date();
  await job.save();
  await invalidateJobsCache();
  return new ApiResponse(200, { job }, "Job closed").send(res);
});

// PATCH /api/jobs/:id/reopen
const reopenJob = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);
  if (job.status !== "closed") throw ApiError.badRequest("Only closed jobs can be reopened");

  job.status = "published";
  job.isActive = true;
  job.closedAt = undefined;
  await job.save();
  await invalidateJobsCache();
  return new ApiResponse(200, { job }, "Job reopened").send(res);
});

// GET /api/jobs/:id/statistics
const jobStatistics = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);

  const statusCounts = await Application.aggregate([
    { $match: { job: job._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  return new ApiResponse(200, {
    views: job.views,
    totalApplications: job.applicationsCount,
    statusBreakdown: statusCounts,
  }).send(res);
});

// GET /api/jobs/:id/applicants
const getJobApplicants = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);
  const { page, limit, sort } = getPaginationOptions(req.query);

  const filter = { job: job._id };
  if (req.query.status) filter.status = req.query.status;

  const result = await Application.paginate(filter, {
    page,
    limit,
    sort,
    populate: [{ path: "applicant", populate: { path: "user", select: "firstName lastName email" } }],
  });

  return new ApiResponse(200, result).send(res);
});

// PATCH /api/jobs/:id/feature (admin only, but recruiters have their own "Feature Job" too - handled in admin controller)
const featureJob = asyncHandler(async (req, res) => {
  const { job } = await findOwnedJob(req.params.id, req.user._id);
  job.featured = true;
  job.featuredAt = new Date();
  job.featuredBy = req.user._id;
  await job.save();
  await invalidateJobsCache();
  return new ApiResponse(200, { job }, "Job featured").send(res);
});

// POST /api/jobs/:id/save
const saveJob = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  if (!job.isPubliclyVisible()) throw ApiError.badRequest("This job is not currently active");

  const existing = await SavedJob.findOne({ applicant: profile._id, job: job._id });
  if (existing) throw ApiError.conflict("Job already saved");

  const saved = await SavedJob.create({ applicant: profile._id, job: job._id });
  return new ApiResponse(201, { saved }, "Job saved").send(res);
});

// DELETE /api/jobs/:id/save
const unsaveJob = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const saved = await SavedJob.findOne({ applicant: profile._id, job: req.params.id });
  if (!saved) throw ApiError.notFound("Saved job not found");

  await saved.deleteOne();
  return new ApiResponse(200, null, "Job removed from saved list").send(res);
});

// GET /api/applicants/saved-jobs
const getSavedJobs = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const { page, limit } = getPaginationOptions(req.query);
  const result = await SavedJob.paginate(
    { applicant: profile._id },
    { page, limit, sort: { createdAt: -1 }, populate: [{ path: "job", populate: POPULATE_LIST }] }
  );

  return new ApiResponse(200, result).send(res);
});

// POST /api/jobs/:id/share
const shareJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  if (!job.isPubliclyVisible()) throw ApiError.badRequest("This job is not currently active");

  const shareUrl = `${process.env.CLIENT_URL}/jobs/${job._id}`;
  return new ApiResponse(200, { shareUrl }).send(res);
});

module.exports = {
  browseJobs,
  searchJobs,
  featuredJobs,
  latestJobs,
  popularJobs,
  recommendedJobs,
  jobsByCategory,
  getJobDetails,
  createJob,
  getAllJobsForRecruiter,
  updateJob,
  deleteJob,
  publishJob,
  unpublishJob,
  closeJob,
  reopenJob,
  jobStatistics,
  getJobApplicants,
  featureJob,
  saveJob,
  unsaveJob,
  getSavedJobs,
  shareJob,
};
