const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const User = require("../models/User");
const Recruiter = require("../models/Recruiter");
const Company = require("../models/Company");
const Job = require("../models/Job");
const { getPaginationOptions } = require("../utils/pagination");
const { logAction } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notify");
const { generateRandomToken, hashToken } = require("../utils/tokens");
const { sendRecruiterInviteEmail } = require("../utils/email");

// GET /api/admin/recruiters
const getAllRecruiters = asyncHandler(async (req, res) => {
  const { page, limit, sort } = getPaginationOptions(req.query);
  const recruiterFilter = {};
  if (req.query.company) recruiterFilter.company = req.query.company;
  if (req.query.status) recruiterFilter.status = req.query.status;

  const total = await Recruiter.countDocuments(recruiterFilter);
  const recruiters = await Recruiter.find(recruiterFilter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("user", "firstName lastName email status createdAt")
    .populate("company", "name");

  return new ApiResponse(200, { recruiters, total, page, limit }).send(res);
});

// POST /api/admin/recruiters
const createRecruiter = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, jobTitle, company: companyId } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const company = await Company.findById(companyId);
  if (!company) throw ApiError.notFound("Company not found");

  const user = await User.create({
    firstName,
    lastName,
    email,
    role: "recruiter",
    emailVerified: false,
    status: "active",
  });

  const inviteToken = generateRandomToken();
  user.invitationTokenHash = hashToken(inviteToken);
  user.invitationExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  await user.save();

  const isFirstRecruiter = !(await Recruiter.exists({ company: company._id }));
  const recruiter = await Recruiter.create({
    user: user._id,
    company: company._id,
    jobTitle,
    isOwner: isFirstRecruiter,
    status: "pending",
  });

  await sendRecruiterInviteEmail(email, inviteToken, company.name);

  await logAction({
    req,
    action: "create_recruiter",
    entity: "Recruiter",
    entityId: recruiter._id,
    description: `Invited recruiter for ${company.name}`,
  });

  return new ApiResponse(201, { user: user.toSafeObject(), recruiter }, "Recruiter invited").send(res);
});

// PATCH /api/admin/recruiters/:id
const updateRecruiter = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findById(req.params.id).populate("user");
  if (!recruiter) throw ApiError.notFound("Recruiter not found");

  const { jobTitle, firstName, lastName } = req.body;
  if (jobTitle !== undefined) recruiter.jobTitle = jobTitle;
  await recruiter.save();

  if (firstName || lastName) {
    const user = await User.findById(recruiter.user._id);
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    await user.save();
  }

  await logAction({
    req,
    action: "update_recruiter",
    entity: "Recruiter",
    entityId: recruiter._id,
  });

  return new ApiResponse(200, { recruiter }, "Recruiter updated").send(res);
});

// PATCH /api/admin/recruiters/:id/suspend
const suspendRecruiter = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findById(req.params.id);
  if (!recruiter) throw ApiError.notFound("Recruiter not found");

  const user = await User.findById(recruiter.user).select("+refreshToken");
  if (user.status === "suspended") throw ApiError.badRequest("Recruiter is already suspended");

  user.status = "suspended";
  user.suspensionReason = req.body.reason || "Violation of platform policies";
  user.suspendedAt = new Date();
  user.refreshToken = undefined;
  await user.save();

  recruiter.status = "suspended";
  await recruiter.save();

  await logAction({ req, action: "suspend_recruiter", entity: "Recruiter", entityId: recruiter._id });
  await notifyUser({
    user: user._id,
    title: "Account suspended",
    message: `Your recruiter account has been suspended. Reason: ${user.suspensionReason}`,
    type: "account",
  });

  return new ApiResponse(200, { recruiter }, "Recruiter suspended").send(res);
});

// PATCH /api/admin/recruiters/:id/activate
const activateRecruiter = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findById(req.params.id);
  if (!recruiter) throw ApiError.notFound("Recruiter not found");

  const user = await User.findById(recruiter.user);
  if (user.status === "active") throw ApiError.badRequest("Recruiter is already active");

  user.status = "active";
  user.suspensionReason = undefined;
  user.suspendedAt = undefined;
  await user.save();

  recruiter.status = "active";
  await recruiter.save();

  await logAction({ req, action: "activate_recruiter", entity: "Recruiter", entityId: recruiter._id });
  await notifyUser({
    user: user._id,
    title: "Account activated",
    message: "Your recruiter account has been reactivated.",
    type: "account",
  });

  return new ApiResponse(200, { recruiter }, "Recruiter activated").send(res);
});

// DELETE /api/admin/recruiters/:id
const deleteRecruiter = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findById(req.params.id);
  if (!recruiter) throw ApiError.notFound("Recruiter not found");

  const hasActiveJobs = await Job.exists({ recruiter: recruiter._id, status: { $in: ["published", "draft"] } });

  const user = await User.findById(recruiter.user).select("+refreshToken");
  user.status = "deleted";
  user.refreshToken = undefined;
  await user.save();

  await logAction({
    req,
    action: "delete_recruiter",
    entity: "Recruiter",
    entityId: recruiter._id,
    description: hasActiveJobs ? "Soft-deleted due to active job dependencies" : "Soft-deleted",
  });

  return new ApiResponse(200, null, "Recruiter account deleted").send(res);
});

// POST /api/admin/recruiters/:id/resend-invitation
const resendInvitation = asyncHandler(async (req, res) => {
  const recruiter = await Recruiter.findById(req.params.id).populate("user").populate("company", "name");
  if (!recruiter) throw ApiError.notFound("Recruiter not found");

  const user = await User.findById(recruiter.user._id).select("+invitationTokenHash +invitationExpires");
  if (user.invitationAccepted) throw ApiError.badRequest("Invitation has already been accepted");

  const inviteToken = generateRandomToken();
  user.invitationTokenHash = hashToken(inviteToken);
  user.invitationExpires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await user.save();

  await sendRecruiterInviteEmail(user.email, inviteToken, recruiter.company.name);

  await logAction({ req, action: "resend_invitation", entity: "Recruiter", entityId: recruiter._id });

  return new ApiResponse(200, null, "Invitation resent").send(res);
});

// GET /api/admin/recruiters/search
const searchRecruiters = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) throw ApiError.badRequest("Search query 'q' is required");

  const users = await User.find({
    role: "recruiter",
    $or: [
      { firstName: new RegExp(q, "i") },
      { lastName: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
    ],
  }).select("_id");

  const recruiters = await Recruiter.find({ user: { $in: users.map((u) => u._id) } })
    .populate("user", "firstName lastName email")
    .populate("company", "name")
    .limit(20);

  return new ApiResponse(200, { recruiters }).send(res);
});

module.exports = {
  getAllRecruiters,
  createRecruiter,
  updateRecruiter,
  suspendRecruiter,
  activateRecruiter,
  deleteRecruiter,
  resendInvitation,
  searchRecruiters,
};
