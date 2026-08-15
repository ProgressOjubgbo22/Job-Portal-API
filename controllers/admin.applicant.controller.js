const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const User = require("../models/User");
const ApplicantProfile = require("../models/ApplicantProfile");
const Education = require("../models/Education");
const Experience = require("../models/Experience");
const Certification = require("../models/Certification");
const Application = require("../models/Application");
const { getPaginationOptions } = require("../utils/pagination");
const { logAction } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notify");

const RESTRICTED_FIELDS = ["password", "role", "refreshToken", "email"];

// GET /api/admin/applicants
const getAllApplicants = asyncHandler(async (req, res) => {
  const { page, limit, sort } = getPaginationOptions(req.query);
  const filter = { role: "applicant" };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    filter.$or = [
      { firstName: new RegExp(req.query.search, "i") },
      { lastName: new RegExp(req.query.search, "i") },
      { email: new RegExp(req.query.search, "i") },
    ];
  }

  const total = await User.countDocuments(filter);
  const applicants = await User.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);

  return new ApiResponse(200, { applicants, total, page, limit }).send(res);
});

// GET /api/admin/applicants/:id
const getApplicantDetails = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== "applicant") throw ApiError.notFound("Applicant not found");

  const profile = await ApplicantProfile.findOne({ user: user._id });
  let education = [];
  let experience = [];
  let certifications = [];
  let applications = [];

  if (profile) {
    [education, experience, certifications] = await Promise.all([
      Education.find({ applicant: profile._id }),
      Experience.find({ applicant: profile._id }),
      Certification.find({ applicant: profile._id }),
    ]);
    applications = await Application.find({ applicant: profile._id }).populate("job", "title");
  }

  return new ApiResponse(200, { user, profile, education, experience, certifications, applications }).send(res);
});

// PATCH /api/admin/applicants/:id
const updateApplicant = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== "applicant") throw ApiError.notFound("Applicant not found");

  const updates = { ...req.body };
  RESTRICTED_FIELDS.forEach((f) => delete updates[f]);

  Object.assign(user, updates);
  await user.save();

  await logAction({
    req,
    action: "update_applicant",
    entity: "User",
    entityId: user._id,
    description: "Admin updated applicant profile",
  });

  return new ApiResponse(200, { user: user.toSafeObject() }, "Applicant updated").send(res);
});

// PATCH /api/admin/applicants/:id/suspend
const suspendApplicant = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("+refreshToken");
  if (!user || user.role !== "applicant") throw ApiError.notFound("Applicant not found");
  if (user.status === "suspended") throw ApiError.badRequest("Applicant is already suspended");

  user.status = "suspended";
  user.suspensionReason = req.body.reason || "Violation of platform policies";
  user.suspendedAt = new Date();
  user.refreshToken = undefined;
  await user.save();

  await logAction({
    req,
    action: "suspend_applicant",
    entity: "User",
    entityId: user._id,
    description: user.suspensionReason,
  });

  await notifyUser({
    user: user._id,
    title: "Account suspended",
    message: `Your account has been suspended. Reason: ${user.suspensionReason}`,
    type: "account",
  });

  return new ApiResponse(200, { user: user.toSafeObject() }, "Applicant suspended").send(res);
});

// PATCH /api/admin/applicants/:id/activate
const activateApplicant = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== "applicant") throw ApiError.notFound("Applicant not found");
  if (user.status === "active") throw ApiError.badRequest("Applicant is already active");

  user.status = "active";
  user.suspensionReason = undefined;
  user.suspendedAt = undefined;
  await user.save();

  await logAction({
    req,
    action: "activate_applicant",
    entity: "User",
    entityId: user._id,
  });

  await notifyUser({
    user: user._id,
    title: "Account activated",
    message: "Your account has been reactivated.",
    type: "account",
  });

  return new ApiResponse(200, { user: user.toSafeObject() }, "Applicant activated").send(res);
});

// DELETE /api/admin/applicants/:id
const deleteApplicant = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("+refreshToken");
  if (!user || user.role !== "applicant") throw ApiError.notFound("Applicant not found");

  const profile = await ApplicantProfile.findOne({ user: user._id });
  const hasActiveApplications = profile
    ? await Application.exists({ applicant: profile._id, status: { $nin: ["withdrawn", "rejected", "hired"] } })
    : false;

  user.status = "deleted";
  user.refreshToken = undefined;
  await user.save();

  await logAction({
    req,
    action: "delete_applicant",
    entity: "User",
    entityId: user._id,
    description: hasActiveApplications ? "Soft-deleted due to active application dependencies" : "Soft-deleted",
  });

  return new ApiResponse(200, null, "Applicant account deleted").send(res);
});

// GET /api/admin/applicants/search
const searchApplicants = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) throw ApiError.badRequest("Search query 'q' is required");

  const applicants = await User.find({
    role: "applicant",
    $or: [
      { firstName: new RegExp(q, "i") },
      { lastName: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
      { phoneNumber: new RegExp(q, "i") },
    ],
  }).limit(20);

  return new ApiResponse(200, { applicants }).send(res);
});

// GET /api/admin/applicants/statistics
const applicantStatistics = asyncHandler(async (req, res) => {
  const [total, active, suspended, newLast30Days] = await Promise.all([
    User.countDocuments({ role: "applicant" }),
    User.countDocuments({ role: "applicant", status: "active" }),
    User.countDocuments({ role: "applicant", status: "suspended" }),
    User.countDocuments({
      role: "applicant",
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  return new ApiResponse(200, { total, active, suspended, newLast30Days }).send(res);
});

module.exports = {
  getAllApplicants,
  getApplicantDetails,
  updateApplicant,
  suspendApplicant,
  activateApplicant,
  deleteApplicant,
  searchApplicants,
  applicantStatistics,
};
