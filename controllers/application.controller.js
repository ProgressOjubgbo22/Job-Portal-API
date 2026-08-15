const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Application = require("../models/Application");
const ApplicationTimeline = require("../models/ApplicationTimeline");
const Job = require("../models/Job");
const ApplicantProfile = require("../models/ApplicantProfile");
const Recruiter = require("../models/Recruiter");
const { getPaginationOptions } = require("../utils/pagination");
const { notifyUser } = require("../utils/notify");

const NOT_HIRABLE_STATUSES = ["hired", "offer_accepted", "withdrawn", "rejected"];

// Valid forward transitions for recruiters updating status
const VALID_TRANSITIONS = {
  applied: ["under_review", "rejected"],
  under_review: ["shortlisted", "rejected"],
  shortlisted: ["assessment", "interview_scheduled", "rejected"],
  assessment: ["interview_scheduled", "rejected"],
  interview_scheduled: ["interview_completed", "rejected"],
  interview_completed: ["offer_extended", "rejected"],
  offer_extended: ["offer_accepted", "offer_declined"],
  offer_accepted: ["hired"],
  offer_declined: [],
  hired: [],
  rejected: [],
  withdrawn: [],
};

const addTimelineEntry = (application, status, note, changedBy) =>
  ApplicationTimeline.create({ application, status, note, changedBy });

// POST /api/applications
const applyForJob = asyncHandler(async (req, res) => {
  const { job: jobId, coverLetter } = req.body;

  const job = await Job.findById(jobId);
  if (!job) throw ApiError.notFound("Job not found");
  if (!job.isPubliclyVisible()) throw ApiError.badRequest("This job is not currently accepting applications");
  if (new Date(job.applicationDeadline) < new Date()) {
    throw ApiError.badRequest("Application deadline has passed");
  }

  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");
  if (profile.profileCompletion < 60) {
    throw ApiError.badRequest("Please complete at least 60% of your profile before applying");
  }
  if (!profile.resume) throw ApiError.badRequest("Please upload a resume before applying");

  const existing = await Application.findOne({ applicant: profile._id, job: job._id });
  if (existing) throw ApiError.conflict("You have already applied to this job");

  const application = await Application.create({
    applicant: profile._id,
    job: job._id,
    resume: profile.resume,
    coverLetter,
    status: "applied",
  });

  await addTimelineEntry(application._id, "applied", "Application submitted", req.user._id);

  job.applicationsCount += 1;
  await job.save();

  const recruiter = await Recruiter.findById(job.recruiter).populate("user");
  if (recruiter) {
    await notifyUser({
      user: recruiter.user._id,
      title: "New job application",
      message: `${req.user.firstName} ${req.user.lastName} applied to ${job.title}`,
      type: "application",
      link: `/recruiter/jobs/${job._id}/applicants`,
    });
  }

  return new ApiResponse(201, { application }, "Application submitted").send(res);
});

// GET /api/applications
const getMyApplications = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const { page, limit, sort } = getPaginationOptions(req.query);
  const filter = { applicant: profile._id, isDeleted: false };
  if (req.query.status) filter.status = req.query.status;

  const result = await Application.paginate(filter, {
    page,
    limit,
    sort,
    populate: [{ path: "job", populate: { path: "company", select: "name logo" } }],
  });

  return new ApiResponse(200, result).send(res);
});

const findOwnApplication = async (applicationId, userId) => {
  const profile = await ApplicantProfile.findOne({ user: userId });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const application = await Application.findById(applicationId);
  if (!application) throw ApiError.notFound("Application not found");
  if (String(application.applicant) !== String(profile._id)) {
    throw ApiError.forbidden("You do not have access to this application");
  }
  return application;
};

// GET /api/applications/:id
const getApplicationDetails = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id)
    .populate({ path: "job", populate: { path: "company", select: "name logo state city" } });

  if (!application) throw ApiError.notFound("Application not found");

  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile || String(application.applicant) !== String(profile._id)) {
    throw ApiError.forbidden("You do not have access to this application");
  }

  const Interview = require("../models/Interview");
  const timeline = await ApplicationTimeline.find({ application: application._id }).sort({ createdAt: 1 });
  const interview = await Interview.findOne({ application: application._id });

  return new ApiResponse(200, { application, timeline, interview }).send(res);
});

// PATCH /api/applications/:id/withdraw
const withdrawApplication = asyncHandler(async (req, res) => {
  const application = await findOwnApplication(req.params.id, req.user._id);

  if (NOT_HIRABLE_STATUSES.includes(application.status) && application.status !== "rejected") {
    throw ApiError.badRequest(`Cannot withdraw an application with status: ${application.status}`);
  }

  application.status = "withdrawn";
  application.withdrawnAt = new Date();
  await application.save();

  await addTimelineEntry(application._id, "withdrawn", "Applicant withdrew application", req.user._id);

  const job = await Job.findById(application.job).populate({
    path: "recruiter",
    populate: { path: "user" },
  });
  if (job?.recruiter?.user) {
    await notifyUser({
      user: job.recruiter.user._id,
      title: "Application withdrawn",
      message: `An applicant withdrew their application for ${job.title}`,
      type: "application",
    });
  }

  return new ApiResponse(200, { application }, "Application withdrawn").send(res);
});

// DELETE /api/applications/:id
const deleteWithdrawnApplication = asyncHandler(async (req, res) => {
  const application = await findOwnApplication(req.params.id, req.user._id);
  if (application.status !== "withdrawn") {
    throw ApiError.badRequest("Only withdrawn applications can be deleted");
  }

  await ApplicationTimeline.deleteMany({ application: application._id });
  await application.deleteOne();

  return new ApiResponse(200, null, "Application deleted").send(res);
});

// GET /api/applications/:id/timeline
const getApplicationTimeline = asyncHandler(async (req, res) => {
  const application = await findOwnApplication(req.params.id, req.user._id);
  const timeline = await ApplicationTimeline.find({ application: application._id }).sort({ createdAt: 1 });
  return new ApiResponse(200, { timeline }).send(res);
});

// PATCH /api/applications/:id/resume
const updateApplicationResume = asyncHandler(async (req, res) => {
  const application = await findOwnApplication(req.params.id, req.user._id);
  if (application.status !== "applied" && application.status !== "under_review") {
    throw ApiError.badRequest("Resume can only be updated before the application is reviewed");
  }
  if (!req.body.resume) throw ApiError.badRequest("Resume URL is required");

  application.resume = req.body.resume;
  await application.save();
  await addTimelineEntry(application._id, application.status, "Resume updated", req.user._id);

  return new ApiResponse(200, { application }, "Resume updated").send(res);
});

// PATCH /api/applications/:id/cover-letter
const updateCoverLetter = asyncHandler(async (req, res) => {
  const application = await findOwnApplication(req.params.id, req.user._id);
  if (application.status !== "applied" && application.status !== "under_review") {
    throw ApiError.badRequest("Cover letter can only be updated before the application is reviewed");
  }

  application.coverLetter = req.body.coverLetter;
  await application.save();
  await addTimelineEntry(application._id, application.status, "Cover letter updated", req.user._id);

  return new ApiResponse(200, { application }, "Cover letter updated").send(res);
});

// GET /api/applications/drafts (draft applications aren't part of the core
// flow described, since apply is one-shot; kept for API completeness -
// returns applications still in 'applied' state as editable drafts)
const getDraftApplications = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const drafts = await Application.find({ applicant: profile._id, status: "applied" }).populate("job");
  return new ApiResponse(200, { drafts }).send(res);
});

// --- Recruiter side ---

const findJobApplicationForRecruiter = async (applicationId, userId) => {
  const recruiter = await Recruiter.findOne({ user: userId });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const application = await Application.findById(applicationId).populate("job");
  if (!application) throw ApiError.notFound("Application not found");
  if (String(application.job.recruiter) !== String(recruiter._id)) {
    throw ApiError.forbidden("You do not have access to this application");
  }
  return { application, recruiter };
};

// PATCH /api/applications/:id/status  (recruiter)
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { application } = await findJobApplicationForRecruiter(req.params.id, req.user._id);
  const { status } = req.body;

  const allowedNext = VALID_TRANSITIONS[application.status] || [];
  if (!allowedNext.includes(status)) {
    throw ApiError.badRequest(
      `Cannot transition application from '${application.status}' to '${status}'`
    );
  }

  application.status = status;
  await application.save();

  await addTimelineEntry(application._id, status, `Status updated to ${status}`, req.user._id);

  const applicantProfile = await ApplicantProfile.findById(application.applicant).populate("user");
  if (applicantProfile?.user) {
    await notifyUser({
      user: applicantProfile.user._id,
      title: "Application status updated",
      message: `Your application status changed to ${status.replace(/_/g, " ")}`,
      type: "application",
      link: `/applications/${application._id}`,
    });
  }

  return new ApiResponse(200, { application }, "Application status updated").send(res);
});

module.exports = {
  applyForJob,
  getMyApplications,
  getApplicationDetails,
  withdrawApplication,
  deleteWithdrawnApplication,
  getApplicationTimeline,
  updateApplicationResume,
  updateCoverLetter,
  getDraftApplications,
  updateApplicationStatus,
  VALID_TRANSITIONS,
};
