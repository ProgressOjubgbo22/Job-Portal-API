const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Interview = require("../models/Interview");
const Application = require("../models/Application");
const ApplicationTimeline = require("../models/ApplicationTimeline");
const Recruiter = require("../models/Recruiter");
const ApplicantProfile = require("../models/ApplicantProfile");
const { getPaginationOptions } = require("../utils/pagination");
const { notifyUser } = require("../utils/notify");
const withTransaction = require("../utils/transaction");
const { withLock } = require("../utils/lock");

const ELIGIBLE_STATUSES = ["shortlisted", "assessment"];

const addTimelineEntry = (application, status, note, changedBy) =>
  ApplicationTimeline.create({ application, status, note, changedBy });

const notifyApplicant = async (application, title, message) => {
  const profile = await ApplicantProfile.findById(application.applicant).populate("user");
  if (profile?.user) {
    await notifyUser({ user: profile.user._id, title, message, type: "interview" });
  }
};

// POST /api/interviews
const scheduleInterview = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const application = await Application.findById(req.body.application).populate("job");
  if (!application) throw ApiError.notFound("Application not found");
  if (String(application.job.recruiter) !== String(recruiter._id)) {
    throw ApiError.forbidden("You do not have access to this application");
  }

  if (!ELIGIBLE_STATUSES.includes(application.status)) {
    throw ApiError.badRequest("Applicant must be shortlisted or in assessment to schedule an interview");
  }

// Concurrency handling: guard against two near-simultaneous requests
// (e.g. a recruiter double-clicking "Schedule") both passing the
// "existing interview?" check before either has written its Interview
// document. The unique index on Interview.application is the final
// backstop if Redis is unavailable.
const lockKey = `lock:schedule-interview:${application._id}`;
const { locked, result: interview } = await withLock(lockKey, 8000, async () => {
  const existing = await Interview.findOne({ application: application._id });
  if (existing) throw ApiError.conflict("An interview already exists for this application");

  // Database transaction: the Interview document, the application status
  // change, and the timeline entry must be committed together - a
  // failure partway through must not leave an interview scheduled
  // against an application that still shows an earlier status.
  return withTransaction(async (session) => {
    const [createdInterview] = await Interview.create(
      [
        {
          application: application._id,
          recruiter: recruiter._id,
          date: req.body.date,
          location: req.body.location,
          notes: req.body.notes,
        },
      ],
      { session }
    );
 
    application.status = "interview_scheduled";
    await application.save({ session });
    await ApplicationTimeline.create(
      [{ application: application._id, status: "interview_scheduled", note: "Interview scheduled", changedBy: req.user._id }],
      { session }
    );
 
    return createdInterview;
  });
});

if (!locked) {
  throw ApiError.conflict("An interview is already being scheduled for this application, please try again shortly");
}

  await notifyApplicant(
    application,
    "Interview scheduled",
    `An interview has been scheduled for your application to ${application.job.title}`
  );

  return new ApiResponse(201, { interview }, "Interview scheduled").send(res);
});

// GET /api/interviews
const getAllInterviews = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const { page, limit, sort } = getPaginationOptions(req.query, { date: 1 });
  const filter = { recruiter: recruiter._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.dateFrom || req.query.dateTo) {
    filter.date = {};
    if (req.query.dateFrom) filter.date.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.date.$lte = new Date(req.query.dateTo);
  }

  const interviews = await Interview.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({
      path: "application",
      populate: [{ path: "job", select: "title" }, { path: "applicant", populate: { path: "user", select: "firstName lastName email" } }],
    });

  const total = await Interview.countDocuments(filter);

  return new ApiResponse(200, { interviews, total, page, limit }).send(res);
});

const findAccessibleInterview = async (interviewId, user) => {
  const interview = await Interview.findById(interviewId).populate({
    path: "application",
    populate: [{ path: "job" }, { path: "applicant", populate: { path: "user" } }],
  });
  if (!interview) throw ApiError.notFound("Interview not found");

  if (user.role === "recruiter") {
    const recruiter = await Recruiter.findOne({ user: user._id });
    if (!recruiter || String(interview.recruiter) !== String(recruiter._id)) {
      throw ApiError.forbidden("You do not have access to this interview");
    }
  } else if (user.role === "applicant") {
    if (String(interview.application.applicant.user._id) !== String(user._id)) {
      throw ApiError.forbidden("You do not have access to this interview");
    }
  }

  return interview;
};

const findOwnedInterview = async (interviewId, userId) => {
  const recruiter = await Recruiter.findOne({ user: userId });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const interview = await Interview.findById(interviewId).populate({
    path: "application",
    populate: [{ path: "job" }, { path: "applicant", populate: { path: "user" } }],
  });
  if (!interview) throw ApiError.notFound("Interview not found");
  if (String(interview.recruiter) !== String(recruiter._id)) {
    throw ApiError.forbidden("You do not have access to this interview");
  }
  return interview;
};

// GET /api/interviews/:id
const getInterviewDetails = asyncHandler(async (req, res) => {
  const interview = await findAccessibleInterview(req.params.id, req.user);
  return new ApiResponse(200, { interview }).send(res);
});

// PATCH /api/interviews/:id
const updateInterview = asyncHandler(async (req, res) => {
  const interview = await findOwnedInterview(req.params.id, req.user._id);
  if (["completed", "cancelled"].includes(interview.status)) {
    throw ApiError.badRequest("Cannot edit a completed or cancelled interview");
  }

  Object.assign(interview, req.body);
  await interview.save();

  await addTimelineEntry(interview.application._id, interview.application.status, "Interview details updated", req.user._id);
  await notifyApplicant(interview.application, "Interview updated", "Your interview details have been updated");

  return new ApiResponse(200, { interview }, "Interview updated").send(res);
});

// PATCH /api/interviews/:id/reschedule
const rescheduleInterview = asyncHandler(async (req, res) => {
  const interview = await findOwnedInterview(req.params.id, req.user._id);
  if (["completed", "cancelled"].includes(interview.status)) {
    throw ApiError.badRequest("Cannot reschedule a completed or cancelled interview");
  }

  interview.date = req.body.date;
  if (req.body.location) interview.location = req.body.location;
  interview.status = "rescheduled";
  await interview.save();

  await addTimelineEntry(interview.application._id, interview.application.status, "Interview rescheduled", req.user._id);
  await notifyApplicant(interview.application, "Interview rescheduled", "Your interview has been rescheduled");

  return new ApiResponse(200, { interview }, "Interview rescheduled").send(res);
});

// PATCH /api/interviews/:id/cancel
const cancelInterview = asyncHandler(async (req, res) => {
  const interview = await findOwnedInterview(req.params.id, req.user._id);
  if (["completed", "cancelled"].includes(interview.status)) {
    throw ApiError.badRequest("Interview is already completed or cancelled");
  }

  interview.status = "cancelled";
  await interview.save();

  await addTimelineEntry(interview.application._id, interview.application.status, "Interview cancelled", req.user._id);
  await notifyApplicant(interview.application, "Interview cancelled", "Your scheduled interview has been cancelled");

  return new ApiResponse(200, { interview }, "Interview cancelled").send(res);
});

// PATCH /api/interviews/:id/complete
const completeInterview = asyncHandler(async (req, res) => {
  const interview = await findOwnedInterview(req.params.id, req.user._id);
  if (["cancelled", "completed"].includes(interview.status)) {
    throw ApiError.badRequest("Interview cannot be marked as completed");
  }

  interview.status = "completed";
  await interview.save();

  const application = await Application.findById(interview.application._id);
  application.status = "interview_completed";
  await application.save();

  await addTimelineEntry(application._id, "interview_completed", "Interview completed", req.user._id);
  await notifyApplicant(interview.application, "Interview completed", "Your interview has been marked as completed");

  return new ApiResponse(200, { interview }, "Interview marked as completed").send(res);
});

// PATCH /api/interviews/:id/outcome
const recordInterviewOutcome = asyncHandler(async (req, res) => {
  const interview = await findOwnedInterview(req.params.id, req.user._id);
  if (interview.status !== "completed") {
    throw ApiError.badRequest("Interview must be completed before recording an outcome");
  }

  interview.outcome = req.body.outcome;
  interview.outcomeNotes = req.body.outcomeNotes;
  await interview.save();

  const application = await Application.findById(interview.application._id);
  if (req.body.outcome === "passed") {
    application.status = "offer_extended";
  } else if (req.body.outcome === "failed") {
    application.status = "rejected";
  }
  await application.save();

  await addTimelineEntry(application._id, application.status, `Interview outcome recorded: ${req.body.outcome}`, req.user._id);
  await notifyApplicant(interview.application, "Interview outcome recorded", `Your interview outcome: ${req.body.outcome}`);

  return new ApiResponse(200, { interview }, "Interview outcome recorded").send(res);
});

// POST /api/interviews/:id/reminder
const sendInterviewReminder = asyncHandler(async (req, res) => {
  const interview = await findOwnedInterview(req.params.id, req.user._id);

  await notifyApplicant(
    interview.application,
    "Interview reminder",
    `Reminder: your interview is scheduled for ${new Date(interview.date).toLocaleString()} at ${interview.location}`
  );
  interview.reminderSentAt = new Date();
  await interview.save();

  return new ApiResponse(200, null, "Interview reminder sent").send(res);
});

// GET /api/interviews/upcoming
const upcomingInterviews = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const interviews = await Interview.find({
    recruiter: recruiter._id,
    date: { $gte: new Date() },
    status: { $in: ["scheduled", "rescheduled"] },
  })
    .sort({ date: 1 })
    .populate({ path: "application", populate: [{ path: "job", select: "title" }] });

  return new ApiResponse(200, { interviews }).send(res);
});

// GET /api/interviews/today
const todaysInterviews = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const interviews = await Interview.find({
    recruiter: recruiter._id,
    date: { $gte: startOfDay, $lte: endOfDay },
  }).populate({ path: "application", populate: [{ path: "job", select: "title" }] });

  return new ApiResponse(200, { interviews }).send(res);
});

// DELETE /api/interviews/:id
const deleteInterview = asyncHandler(async (req, res) => {
  const interview = await findOwnedInterview(req.params.id, req.user._id);
  if (interview.status === "completed") {
    throw ApiError.badRequest("Cannot delete a completed interview");
  }
  // "Only if it hasn't started" - guard against past-dated scheduled interviews
  if (new Date(interview.date) < new Date() && interview.status !== "cancelled") {
    throw ApiError.badRequest("Cannot delete an interview that has already started");
  }

  await interview.deleteOne();
  return new ApiResponse(200, null, "Interview deleted").send(res);
});

module.exports = {
  scheduleInterview,
  getAllInterviews,
  getInterviewDetails,
  updateInterview,
  rescheduleInterview,
  cancelInterview,
  completeInterview,
  recordInterviewOutcome,
  sendInterviewReminder,
  upcomingInterviews,
  todaysInterviews,
  deleteInterview,
};
