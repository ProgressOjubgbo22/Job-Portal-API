const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Recruiter = require("../models/Recruiter");
const Job = require("../models/Job");
const Application = require("../models/Application");
const ApplicantProfile = require("../models/ApplicantProfile");
const SavedApplicant = require("../models/SavedApplicant");
const ApplicantRating = require("../models/ApplicantRating");
const ApplicationNote = require("../models/ApplicationNote");
const { getPaginationOptions } = require("../utils/pagination");

// GET /api/recruiters/applicants
const getAllApplicants = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const companyJobs = await Job.find({ company: recruiter.company }).select("_id");
  const jobIds = companyJobs.map((j) => j._id);

  const { page, limit, sort } = getPaginationOptions(req.query);
  const filter = { job: { $in: jobIds } };
  if (req.query.job) filter.job = req.query.job;
  if (req.query.status) filter.status = req.query.status;

  const result = await Application.paginate(filter, {
    page,
    limit,
    sort,
    populate: [
      { path: "job", select: "title" },
      { path: "applicant", populate: { path: "user", select: "firstName lastName email" } },
    ],
  });

  return new ApiResponse(200, result).send(res);
});

// PATCH /api/recruiters/applications/:id/status - delegate to application.controller.updateApplicationStatus
// (kept here as alias route target if needed)

// POST /api/recruiters/applicants/:id/save
const saveApplicant = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const applicant = await ApplicantProfile.findById(req.params.id);
  if (!applicant) throw ApiError.notFound("Applicant not found");

  const existing = await SavedApplicant.findOne({ recruiter: recruiter._id, applicant: applicant._id });
  if (existing) throw ApiError.conflict("Applicant already saved");

  const saved = await SavedApplicant.create({ recruiter: recruiter._id, applicant: applicant._id });
  return new ApiResponse(201, { saved }, "Applicant saved").send(res);
});

// DELETE /api/recruiters/applicants/:id/save
const removeSavedApplicant = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const saved = await SavedApplicant.findOne({ recruiter: recruiter._id, applicant: req.params.id });
  if (!saved) throw ApiError.notFound("Saved applicant not found");

  await saved.deleteOne();
  return new ApiResponse(200, null, "Applicant removed from saved list").send(res);
});

// GET /api/recruiters/applicants/saved
const getSavedApplicants = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const { page, limit } = getPaginationOptions(req.query);
  const result = await SavedApplicant.paginate(
    { recruiter: recruiter._id },
    {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [{ path: "applicant", populate: { path: "user", select: "firstName lastName email" } }],
    }
  );

  return new ApiResponse(200, result).send(res);
});

// POST /api/recruiters/applicants/:id/rating
const rateApplicant = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const applicant = await ApplicantProfile.findById(req.params.id);
  if (!applicant) throw ApiError.notFound("Applicant not found");

  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) throw ApiError.badRequest("Rating must be between 1 and 5");

  const existing = await ApplicantRating.findOne({ recruiter: recruiter._id, applicant: applicant._id });
  let record;
  if (existing) {
    existing.rating = rating;
    existing.comment = comment;
    record = await existing.save();
  } else {
    record = await ApplicantRating.create({ recruiter: recruiter._id, applicant: applicant._id, rating, comment });
  }

  return new ApiResponse(201, { rating: record }, "Applicant rated").send(res);
});

// POST /api/recruiters/applications/:id/note
const addApplicationNote = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const application = await Application.findById(req.params.id).populate("job");
  if (!application) throw ApiError.notFound("Application not found");
  if (String(application.job.recruiter) !== String(recruiter._id)) {
    throw ApiError.forbidden("You do not have access to this application");
  }

  if (!req.body.content) throw ApiError.badRequest("Note content is required");

  const note = await ApplicationNote.create({
    application: application._id,
    recruiter: recruiter._id,
    content: req.body.content,
  });

  return new ApiResponse(201, { note }, "Note added").send(res);
});

const findOwnNote = async (noteId, userId) => {
  const recruiter = await Recruiter.findOne({ user: userId });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const note = await ApplicationNote.findById(noteId);
  if (!note) throw ApiError.notFound("Note not found");
  if (String(note.recruiter) !== String(recruiter._id)) {
    throw ApiError.forbidden("You do not have access to this note");
  }
  return note;
};

// PATCH /api/recruiters/notes/:id
const updateApplicationNote = asyncHandler(async (req, res) => {
  const note = await findOwnNote(req.params.id, req.user._id);
  if (!req.body.content) throw ApiError.badRequest("Note content is required");

  note.content = req.body.content;
  await note.save();

  return new ApiResponse(200, { note }, "Note updated").send(res);
});

// DELETE /api/recruiters/notes/:id
const deleteApplicationNote = asyncHandler(async (req, res) => {
  const note = await findOwnNote(req.params.id, req.user._id);
  await note.deleteOne();
  return new ApiResponse(200, null, "Note deleted").send(res);
});

// GET /api/applications/:id/notes (list notes for an application)
const getApplicationNotes = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const application = await Application.findById(req.params.id).populate("job");
  if (!application) throw ApiError.notFound("Application not found");
  if (String(application.job.recruiter) !== String(recruiter._id)) {
    throw ApiError.forbidden("You do not have access to this application");
  }

  const notes = await ApplicationNote.find({ application: application._id }).sort({ createdAt: -1 });
  return new ApiResponse(200, { notes }).send(res);
});

// GET /api/applications/export (export applicants for a job as JSON/CSV-ready data)
const exportApplicants = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findOne({ user: req.user._id });
  if (!recruiter) throw ApiError.notFound("Recruiter profile not found");

  const filter = {};
  if (req.query.job) {
    const job = await Job.findById(req.query.job);
    if (!job || String(job.recruiter) !== String(recruiter._id)) {
      throw ApiError.forbidden("You do not have access to this job");
    }
    filter.job = job._id;
  } else {
    const companyJobs = await Job.find({ company: recruiter.company }).select("_id");
    filter.job = { $in: companyJobs.map((j) => j._id) };
  }

  const applications = await Application.find(filter)
    .populate("job", "title")
    .populate({ path: "applicant", populate: { path: "user", select: "firstName lastName email phoneNumber" } });

  const rows = applications.map((a) => ({
    applicantName: `${a.applicant?.user?.firstName || ""} ${a.applicant?.user?.lastName || ""}`.trim(),
    email: a.applicant?.user?.email,
    phone: a.applicant?.user?.phoneNumber,
    job: a.job?.title,
    status: a.status,
    appliedAt: a.appliedAt,
  }));

  return new ApiResponse(200, { count: rows.length, applicants: rows }).send(res);
});

module.exports = {
  getAllApplicants,
  saveApplicant,
  removeSavedApplicant,
  getSavedApplicants,
  rateApplicant,
  addApplicationNote,
  updateApplicationNote,
  deleteApplicationNote,
  getApplicationNotes,
  exportApplicants,
};
